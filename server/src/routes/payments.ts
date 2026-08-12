import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, unitIdsOf, type AuthedRequest } from '../middleware/auth.js';
import { Payment } from '../models/Payment.js';
import { Unit } from '../models/Unit.js';
import { UserCredit } from '../models/UserCredit.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { derivePayer, generateMonthlyDues, recordReceipts, round2 } from '../services/payments.service.js';
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

const claimSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'transfer', 'stripe', 'other']).default('transfer'),
  externalRef: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

// Resident "I paid" claim — only the charge's responsible payer (renter for
// rent, owner for everything else) may submit; the admin reviews it below.
router.post(
  '/:id/claims',
  validate(claimSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof claimSchema>;
    if (me.role === 'admin' || !me.buildingId) throw Forbidden('Building context required');
    const payment = await Payment.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!payment) throw NotFound('Payment not found');
    if (payment.status === 'paid' || payment.status === 'waived') {
      throw BadRequest('This charge is already settled.');
    }
    const unit = await Unit.findById(payment.unitId);
    if (!unit) throw NotFound('Unit not found');
    const payer = await derivePayer(payment, unit);
    if (!payer || payer.toString() !== me.sub) {
      throw Forbidden('Only the responsible payer can claim this charge.');
    }
    const remaining = round2(payment.amount - payment.paidAmount);
    if (body.amount > remaining + 0.005) {
      throw BadRequest('Claim exceeds the remaining amount.');
    }
    if (payment.claims.some((c) => c.status === 'pending' && c.claimedBy?.toString() === me.sub)) {
      throw BadRequest('You already have a claim awaiting review on this charge.');
    }
    payment.claims.push({
      amount: body.amount,
      method: body.method,
      externalRef: body.externalRef ?? '',
      note: body.note ?? '',
      at: new Date(),
      claimedBy: payer,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
    });
    await payment.save();

    // Tell the building admins there's money to confirm.
    const admins = await User.find({
      memberships: { $elemMatch: { buildingId: me.buildingId, isBuildingAdmin: true } },
      status: 'active',
    }).select('_id');
    await Promise.all(
      admins.map((a) =>
        Notification.create({
          userId: a._id,
          buildingId: me.buildingId,
          type: 'payment_claim',
          title: `Payment claim — unit ${unit.number}`,
          body: `${payment.currency} ${body.amount.toFixed(2)} via ${body.method}`,
          link: '/payments',
        })
      )
    );
    res.status(201).json({ payment });
  })
);

const reviewClaimSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

// Review a claim. Approval converts it into a real receipt through the same
// waterfall/permission path as a hand-recorded payment.
router.post(
  '/:id/claims/:claimId/review',
  validate(reviewClaimSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof reviewClaimSchema>;
    if (me.role === 'admin' || !me.buildingId) throw Forbidden('Building context required');
    const payment = await Payment.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!payment) throw NotFound('Payment not found');
    // Same reviewer rule as PATCH /:id: building admin for anything; a plain
    // owner only for rent on units they own.
    if (!me.isBuildingAdmin) {
      const unit = await Unit.findById(payment.unitId).select('ownerId').lean();
      const ownsUnit = unit?.ownerId?.toString() === me.sub;
      if (payment.type !== 'rent' || !ownsUnit) {
        throw Forbidden('You can only review claims on rent charges of units you own.');
      }
    }
    const claim = payment.claims.id(String(req.params.claimId));
    if (!claim) throw NotFound('Claim not found');
    if (claim.status !== 'pending') throw BadRequest('Claim already reviewed.');

    claim.status = body.action === 'approve' ? 'approved' : 'rejected';
    claim.reviewedBy = me.sub as unknown as typeof claim.reviewedBy;
    claim.reviewedAt = new Date();
    if (body.note) claim.note = [claim.note, body.note].filter(Boolean).join(' · ');
    await payment.save();

    if (body.action === 'approve') {
      // recordReceipts re-reads the payment; it also caps at remaining, so a
      // race with another receipt surfaces as a clean error, not double money.
      await recordReceipts({
        buildingId: me.buildingId,
        paymentIds: [payment._id.toString()],
        amount: claim.amount,
        method: claim.method as 'cash' | 'transfer' | 'stripe' | 'other',
        externalRef: claim.externalRef || undefined,
        note: claim.note || undefined,
        payerId: claim.claimedBy?.toString(),
        me: { sub: me.sub, isBuildingAdmin: Boolean(me.isBuildingAdmin) },
      });
    }

    // Close the loop with the claimant either way.
    if (claim.claimedBy) {
      await Notification.create({
        userId: claim.claimedBy,
        buildingId: me.buildingId,
        type: 'payment_claim',
        title: body.action === 'approve' ? 'Payment claim approved' : 'Payment claim rejected',
        body: `${payment.currency} ${claim.amount.toFixed(2)}`,
        link: '/payments',
      });
    }

    const fresh = await Payment.findById(payment._id);
    res.json({ payment: fresh });
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
