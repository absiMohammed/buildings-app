import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, type AuthedRequest } from '../middleware/auth.js';
import { Payment } from '../models/Payment.js';
import { Unit } from '../models/Unit.js';
import { generateMonthlyDues } from '../services/payments.service.js';
import { Forbidden, NotFound, BadRequest } from '../utils/errors.js';

export const router = Router();

const createPaymentSchema = z.object({
  unitId: z.string(),
  type: z.enum(['monthly_dues', 'expense_split', 'one_off']).default('one_off'),
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

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const filter: Record<string, unknown> = { buildingId: me.buildingId };
    if (me.role !== 'admin') {
      if (!me.unitId) {
        res.json({ payments: [] });
        return;
      }
      filter.unitId = me.unitId;
    }
    const { status, type } = req.query as Record<string, string | undefined>;
    if (status) filter.status = status;
    if (type) filter.type = type;
    const payments = await Payment.find(filter).sort({ dueDate: -1 }).limit(500);
    res.json({ payments });
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
    if (me.role !== 'admin' && payment.unitId.toString() !== me.unitId) throw Forbidden();
    res.json({ payment });
  })
);

router.post(
  '/',
  requireBuildingAdmin,
  validate(createPaymentSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof createPaymentSchema>;
    const unit = await Unit.findOne({ _id: body.unitId, buildingId: me.buildingId });
    if (!unit) throw NotFound('Unit not found');
    const payment = await Payment.create({
      ...body,
      buildingId: me.buildingId,
      status: 'pending',
    });
    res.status(201).json({ payment });
  })
);

router.patch(
  '/:id',
  requireBuildingAdmin,
  validate(markPaidSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof markPaidSchema>;
    const update: Record<string, unknown> = { status: body.status };
    if (body.status === 'paid') {
      update.paidAt = body.paidAt ?? new Date();
      update.paidBy = me.sub;
      if (body.paymentMethod) update.paymentMethod = body.paymentMethod;
      if (body.externalRef) update.externalRef = body.externalRef;
    }
    const payment = await Payment.findOneAndUpdate(
      { _id: req.params.id, buildingId: me.buildingId },
      update,
      { new: true }
    );
    if (!payment) throw NotFound('Payment not found');
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

// Resident self-record (not admin gated)
router.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const payment = await Payment.findOne({
      _id: req.params.id,
      buildingId: me.buildingId,
    });
    if (!payment) throw NotFound('Payment not found');
    if (me.role !== 'admin' && payment.unitId.toString() !== me.unitId) throw Forbidden();
    if (payment.status === 'paid') throw BadRequest('Already paid');

    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.paidBy = me.sub as unknown as typeof payment.paidBy;
    payment.paymentMethod = (req.body as { paymentMethod?: 'cash' | 'transfer' | 'stripe' | 'other' }).paymentMethod ?? 'transfer';
    payment.externalRef = (req.body as { externalRef?: string }).externalRef ?? '';
    await payment.save();
    res.json({ payment });
  })
);
