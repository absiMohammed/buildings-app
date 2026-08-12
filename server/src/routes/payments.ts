import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, unitIdsOf, type AuthedRequest } from '../middleware/auth.js';
import { Payment } from '../models/Payment.js';
import { Unit } from '../models/Unit.js';
import { UserCredit } from '../models/UserCredit.js';
import { generateMonthlyDues, recordReceipts, round2 } from '../services/payments.service.js';
import { Forbidden, NotFound, BadRequest } from '../utils/errors.js';

export const router = Router();

const createPaymentSchema = z.object({
  unitId: z.string(),
  type: z.enum(['monthly_dues', 'expense_split', 'one_off', 'rent']).default('one_off'),
  amount: z.number().min(0),
  currency: z.string().default('USD'),
  dueDate: z.coerce.date(),
  notes: z.string().max(500).optional(),
});

const markPaidSchema = z.object({
  status: z.enum(['paid', 'waived', 'pending', 'overdue']),
  paymentMethod: z.enum(['cash', 'transfer', 'stripe', 'other']).optional(),
  externalRef: z.string().max(120).optional(),
  paidAt: z.coerce.date().optional(),
});

// 'credit' is deliberately absent — it marks system-generated receipts only.
const recordReceiptsSchema = z.object({
  paymentIds: z.array(z.string()).min(1).max(50),
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'transfer', 'stripe', 'other']).default('cash'),
  externalRef: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  payerId: z.string().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const filter: Record<string, unknown> = { buildingId: me.buildingId };
    // Building admins see every unit's payments; plain residents (owners
    // included) only ever see their own unit's. The client additionally
    // narrows a building admin's OWNER view to their own unit.
    if (me.role !== 'admin' && !me.isBuildingAdmin) {
      // A resident may hold several units (owner of one, tenant of
      // another) — scope to the union, not just the primary unit.
      const mine = unitIdsOf(me);
      if (mine.length === 0) {
        res.json({ payments: [] });
        return;
      }
      filter.unitId = { $in: mine };
    }
    const { status, type } = req.query as Record<string, string | undefined>;
    if (status) filter.status = status;
    if (type) filter.type = type;
    const payments = await Payment.find(filter).sort({ dueDate: -1 }).limit(500);
    res.json({ payments });
  })
);

// Registered before GET /:id — otherwise 'credits' is parsed as a payment id.
router.get(
  '/credits',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    if (!me.buildingId) throw Forbidden('Building context required');
    const filter: Record<string, unknown> = { buildingId: me.buildingId };
    if (me.isBuildingAdmin) {
      const { userId } = req.query as Record<string, string | undefined>;
      if (userId) filter.userId = userId;
    } else {
      // Members only ever see their own balance.
      filter.userId = me.sub;
    }
    const credits = await UserCredit.find(filter).select('userId balance currency');
    res.json({ credits });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const payment = await Payment.findOne({
      _id: req.params.id,
      buildingId: me.buildingId,
    });
    if (!payment) throw NotFound('Payment not found');
    if (
      me.role !== 'admin' &&
      !me.isBuildingAdmin &&
      !unitIdsOf(me).includes(payment.unitId.toString())
    ) {
      throw Forbidden();
    }
    res.json({ payment });
  })
);

router.post(
  '/',
  validate(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof createPaymentSchema>;
    if (me.role === 'admin' || !me.buildingId) throw Forbidden('Building context required');
    const unit = await Unit.findOne({ _id: body.unitId, buildingId: me.buildingId });
    if (!unit) throw NotFound('Unit not found');
    // Building admins create any charge. A plain owner may only create RENT
    // charges, and only against a unit they own.
    if (!me.isBuildingAdmin) {
      const ownsUnit = unit.ownerId?.toString() === me.sub;
      if (body.type !== 'rent' || !ownsUnit) {
        throw Forbidden('You can only add rent charges on units you own.');
      }
    }
    const payment = await Payment.create({
      ...body,
      buildingId: me.buildingId,
      status: 'pending',
    });
    res.status(201).json({ payment });
  })
);

// Record money received against one unit's charges — the partial-payment
// entry point. The amount waterfalls oldest-first across the selected
// charges; a shortfall leaves the tail partially covered, a surplus credits
// the payer's balance. Permission rules mirror PATCH /:id (enforced in the
// service, which needs the unit loaded anyway).
router.post(
  '/receipts',
  validate(recordReceiptsSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof recordReceiptsSchema>;
    if (me.role === 'admin' || !me.buildingId) throw Forbidden('Building context required');
    const result = await recordReceipts({
      buildingId: me.buildingId,
      paymentIds: body.paymentIds,
      amount: body.amount,
      method: body.paymentMethod,
      externalRef: body.externalRef,
      note: body.note,
      payerId: body.payerId,
      me: { sub: me.sub, isBuildingAdmin: Boolean(me.isBuildingAdmin) },
    });
    res.json(result);
  })
);

router.patch(
  '/:id',
  validate(markPaidSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof markPaidSchema>;
    if (me.role === 'admin' || !me.buildingId) throw Forbidden('Building context required');
    const payment = await Payment.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!payment) throw NotFound('Payment not found');
    // Building admins settle any charge. A plain owner may only act on RENT
    // charges of units they own (their renter pays them directly).
    if (!me.isBuildingAdmin) {
      const unit = await Unit.findById(payment.unitId).select('ownerId').lean();
      const ownsUnit = unit?.ownerId?.toString() === me.sub;
      if (payment.type !== 'rent' || !ownsUnit) {
        throw Forbidden('You can only manage rent charges on units you own.');
      }
    }
    payment.status = body.status;
    if (body.status === 'paid') {
      payment.paidAt = body.paidAt ?? new Date();
      payment.paidBy = me.sub as unknown as typeof payment.paidBy;
      if (body.paymentMethod) payment.paymentMethod = body.paymentMethod;
      if (body.externalRef) payment.externalRef = body.externalRef;
      // Keep receipts/paidAmount consistent no matter which path settles a
      // charge: a full mark-paid closes the remaining balance as one receipt.
      const remaining = round2(payment.amount - payment.paidAmount);
      if (remaining > 0) {
        payment.receipts.push({
          amount: remaining,
          at: payment.paidAt,
          method: body.paymentMethod ?? 'cash',
          externalRef: body.externalRef ?? '',
          note: '',
          recordedBy: me.sub as unknown as typeof payment.paidBy,
          // Legacy full-settle path doesn't know who the money came from.
          payerId: null,
        });
        payment.paidAmount = payment.amount;
      }
    }
    await payment.save();
    res.json({ payment });
  })
);

router.post(
  '/run-monthly',
  requireBuildingAdmin,
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    if (!me.buildingId) {
      throw BadRequest('Admin must impersonate a building to run this action.');
    }
    const result = await generateMonthlyDues(me.buildingId);
    res.json(result);
  })
);

// Record a payment as paid. Building-admin only — residents (owners
// included) settle out of band and the admin records the receipt. The
// buildingId scope in the query keeps admins inside their own building.
router.post(
  '/:id/pay',
  requireBuildingAdmin,
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const payment = await Payment.findOne({
      _id: req.params.id,
      buildingId: me.buildingId,
    });
    if (!payment) throw NotFound('Payment not found');
    if (payment.status === 'paid') throw BadRequest('Already paid');

    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.paidBy = me.sub as unknown as typeof payment.paidBy;
    payment.paymentMethod = (req.body as { paymentMethod?: 'cash' | 'transfer' | 'stripe' | 'other' }).paymentMethod ?? 'transfer';
    payment.externalRef = (req.body as { externalRef?: string }).externalRef ?? '';
    // Same receipts/paidAmount sync as PATCH /:id — see comment there.
    const remaining = round2(payment.amount - payment.paidAmount);
    if (remaining > 0) {
      payment.receipts.push({
        amount: remaining,
        at: payment.paidAt,
        method: payment.paymentMethod,
        externalRef: payment.externalRef,
        note: '',
        recordedBy: me.sub as unknown as typeof payment.paidBy,
        payerId: null,
      });
      payment.paidAmount = payment.amount;
    }
    await payment.save();
    res.json({ payment });
  })
);
