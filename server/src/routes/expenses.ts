import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, type AuthedRequest } from '../middleware/auth.js';
import { Expense } from '../models/Expense.js';
import { Unit } from '../models/Unit.js';
import { Payment, type PaymentDoc } from '../models/Payment.js';
import { applyCreditToCharge } from '../services/payments.service.js';
import { BadRequest, NotFound } from '../utils/errors.js';

export const router = Router();

const createExpenseSchema = z.object({
  category: z.enum(['maintenance', 'utilities', 'repairs', 'cleaning', 'insurance', 'other']),
  amount: z.number().min(0),
  currency: z.string().default('USD'),
  description: z.string().max(500).optional(),
  vendor: z.string().max(200).optional(),
  incurredAt: z.coerce.date(),
  receiptUrl: z.string().url().optional(),
  splitMode: z.enum(['equal', 'by_sqft', 'none']).default('none'),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const { category, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = { buildingId: me.buildingId, deletedAt: null };
    if (category) filter.category = category;
    if (dateFrom || dateTo) {
      filter.incurredAt = {} as Record<string, Date>;
      if (dateFrom) (filter.incurredAt as Record<string, Date>).$gte = new Date(dateFrom);
      if (dateTo) (filter.incurredAt as Record<string, Date>).$lte = new Date(dateTo);
    }
    const expenses = await Expense.find(filter).sort({ incurredAt: -1 });
    res.json({ expenses });
  })
);

router.post(
  '/',
  requireBuildingAdmin,
  validate(createExpenseSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const expense = await Expense.create({
      ...(req.body as object),
      buildingId: me.buildingId,
      createdBy: me.sub,
    });
    res.status(201).json({ expense });
  })
);

router.patch(
  '/:id',
  requireBuildingAdmin,
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, buildingId: me.buildingId, deletedAt: null },
      req.body,
      { new: true }
    );
    if (!expense) throw NotFound('Expense not found');
    res.json({ expense });
  })
);

router.delete(
  '/:id',
  requireBuildingAdmin,
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    await Expense.findOneAndUpdate(
      { _id: req.params.id, buildingId: me.buildingId },
      { deletedAt: new Date() }
    );
    res.status(204).end();
  })
);

router.post(
  '/:id/split',
  requireBuildingAdmin,
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    // Admins are building-agnostic — they can't run a building-scoped split
    // without first picking a building. Building admins always have one.
    if (!me.buildingId) {
      throw BadRequest('Admin must impersonate a building to run this action.');
    }
    const buildingId = me.buildingId;
    const expense = await Expense.findOne({
      _id: req.params.id,
      buildingId,
      deletedAt: null,
    });
    if (!expense) throw NotFound('Expense not found');
    if (expense.splitGenerated) throw BadRequest('Already split');
    if (expense.splitMode === 'none') throw BadRequest('Expense splitMode is "none"');

    const units = await Unit.find({ buildingId });
    if (units.length === 0) throw BadRequest('No units to split across');

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const docs: Array<{
      buildingId: Types.ObjectId | string;
      unitId: Types.ObjectId;
      type: 'expense_split';
      amount: number;
      currency: string;
      dueDate: Date;
      expenseId: Types.ObjectId;
      notes: string;
    }> = [];

    if (expense.splitMode === 'equal') {
      const each = Math.round((expense.amount / units.length) * 100) / 100;
      for (const u of units) {
        docs.push({
          buildingId,
          unitId: u._id,
          type: 'expense_split',
          amount: each,
          currency: expense.currency,
          dueDate,
          expenseId: expense._id,
          notes: `Split: ${expense.description || expense.category}`,
        });
      }
    } else if (expense.splitMode === 'by_sqft') {
      const totalSqft = units.reduce((s, u) => s + (u.sqft ?? 0), 0);
      if (totalSqft <= 0) throw BadRequest('No sqft on units to split by');
      for (const u of units) {
        const amt = Math.round((expense.amount * ((u.sqft ?? 0) / totalSqft)) * 100) / 100;
        docs.push({
          buildingId,
          unitId: u._id,
          type: 'expense_split',
          amount: amt,
          currency: expense.currency,
          dueDate,
          expenseId: expense._id,
          notes: `Split: ${expense.description || expense.category}`,
        });
      }
    } else {
      throw BadRequest(`splitMode "${expense.splitMode}" not implemented yet`);
    }

    const created = await Payment.insertMany(docs);
    // Cover freshly split charges from the unit owners' credit balances.
    // (insertMany's return type is narrowed to the input docs' shape, so the
    // hydrated documents need re-widening to PaymentDoc.)
    const unitById = new Map(units.map((u) => [u._id.toString(), u]));
    for (const p of created) {
      const unit = unitById.get(p.unitId.toString());
      if (unit) await applyCreditToCharge(p as unknown as PaymentDoc, unit);
    }
    expense.splitGenerated = true;
    await expense.save();

    res.json({ generated: docs.length });
  })
);
