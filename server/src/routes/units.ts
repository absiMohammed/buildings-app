import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, unitIdsOf, type AuthedRequest } from '../middleware/auth.js';
import { Unit } from '../models/Unit.js';
import { NotFound, Forbidden } from '../utils/errors.js';
import { assertPlanAllowsNewUnit } from '../services/plans.service.js';

export const router = Router();

const createUnitSchema = z.object({
  number: z.string().min(1).max(20),
  floor: z.number().int().optional(),
  sqft: z.number().min(0).optional(),
  bedrooms: z.number().int().min(0).optional(),
  monthlyDuesAmount: z.number().min(0).default(0),
  monthlyDuesDayOverride: z.number().int().min(1).max(28).nullable().optional(),
  monthlyRentAmount: z.number().min(0).nullable().optional(),
  notes: z.string().max(500).optional(),
});

const updateUnitSchema = createUnitSchema.partial();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const filter: Record<string, unknown> = { buildingId: me.buildingId };
    // Building admins manage the whole roster; plain residents only ever
    // see their own unit.
    if (me.role !== 'admin' && !me.isBuildingAdmin) {
      // Residents can hold several units — return all of theirs.
      const mine = unitIdsOf(me);
      if (mine.length === 0) {
        res.json({ units: [] });
        return;
      }
      filter._id = { $in: mine };
    }
    const units = await Unit.find(filter).sort({ number: 1 });
    res.json({ units });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const unit = await Unit.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!unit) throw NotFound('Unit not found');
    if (
      me.role !== 'admin' &&
      !me.isBuildingAdmin &&
      !unitIdsOf(me).includes(unit._id.toString())
    ) {
      throw Forbidden();
    }
    res.json({ unit });
  })
);

router.post(
  '/',
  requireBuildingAdmin,
  validate(createUnitSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    // Subscription tiers cap the number of units; trial is unlimited.
    await assertPlanAllowsNewUnit(String(me.buildingId));
    const unit = await Unit.create({ ...(req.body as object), buildingId: me.buildingId });
    res.status(201).json({ unit });
  })
);

router.patch(
  '/:id',
  validate(updateUnitSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const unit = await Unit.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!unit) throw NotFound('Unit not found');

    const isAdmin = me.role === 'admin' || !!me.isBuildingAdmin;
    const isOwnerOfUnit = me.role === 'owner' && unit.ownerId?.toString() === me.sub;
    if (!isAdmin && !isOwnerOfUnit) throw Forbidden();

    // Owners may only edit notes + the rent they charge; admins may edit anything.
    const body = req.body as Record<string, unknown>;
    const allowed = isAdmin
      ? body
      : Object.fromEntries(
          Object.entries(body).filter(([k]) => k === 'notes' || k === 'monthlyRentAmount'),
        );
    Object.assign(unit, allowed);
    await unit.save();
    res.json({ unit });
  })
);
