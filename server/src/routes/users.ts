import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, requireSystemAdmin, type AuthedRequest } from '../middleware/auth.js';
import { User, GEO_FENCE_ACTIONS } from '../models/User.js';
import { NotFound, BadRequest, Conflict } from '../utils/errors.js';

export const router = Router();

router.get(
  '/',
  requireBuildingAdmin,
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const users = await User.find({ buildingId: me.buildingId }).sort({ createdAt: -1 });
    res.json({ users: users.map((u) => u.toJSON()) });
  })
);

const statusSchema = z.object({ status: z.enum(['active', 'suspended']) });

router.patch(
  '/:id/status',
  requireBuildingAdmin,
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const nextStatus = (req.body as { status: 'active' | 'suspended' }).status;
    // On suspension, kill the refresh token and bump sessionsRevokedAt so
    // any access tokens already in flight are rejected on next request.
    const suspensionUpdates =
      nextStatus === 'suspended'
        ? { refreshTokenHash: null, sessionsRevokedAt: new Date() }
        : {};
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, buildingId: me.buildingId },
      { status: nextStatus, ...suspensionUpdates },
      { new: true }
    );
    if (!user) throw NotFound('User not found');
    res.json({ user: user.toJSON() });
  })
);

// Promote an owner to system admin (or demote back to owner). The `admin`
// role is system-level (cross-building CRUD); only an existing system admin
// can mint another system admin. Designating an owner as building admin is
// a separate flag — use PATCH /:id/building-admin for that.
const roleSchema = z.object({ role: z.enum(['admin', 'owner']) });
router.patch(
  '/:id/role',
  requireSystemAdmin,
  validate(roleSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const nextRole = (req.body as { role: 'admin' | 'owner' }).role;
    const target = await User.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!target) throw NotFound('User not found');
    if (nextRole === 'admin' && target.role !== 'owner') {
      throw BadRequest('Only an owner can be promoted to admin.');
    }
    if (nextRole === 'owner' && target.role !== 'admin') {
      throw BadRequest('Demotion is only allowed from admin back to owner.');
    }
    target.role = nextRole;
    await target.save();
    res.json({ user: target.toJSON() });
  })
);

// Per-user policy settings — admin-only. Accepts a partial update; omitting
// a field leaves it untouched, passing null clears it.
const settingsSchema = z.object({
  maxDependents: z.number().int().min(0).nullable().optional(),
  monthlyUtilities: z.record(z.string(), z.number().nonnegative()).nullable().optional(),
  geoFence: z
    .object({
      centerLat: z.number().min(-90).max(90).nullable().optional(),
      centerLng: z.number().min(-180).max(180).nullable().optional(),
      radiusMeters: z.number().nonnegative().nullable().optional(),
      allowedActions: z.array(z.enum(GEO_FENCE_ACTIONS)).optional(),
    })
    .nullable()
    .optional(),
  custom: z.record(z.string(), z.string().max(500)).nullable().optional(),
});

// Note: nominating/revoking a building admin lives at
// PATCH /buildings/:buildingId/admin/:userId — see routes/buildings.ts.

router.patch(
  '/:id/settings',
  requireBuildingAdmin,
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof settingsSchema>;
    const target = await User.findOne({ _id: req.params.id, buildingId: me.buildingId });
    if (!target) throw NotFound('User not found');
    target.settings = target.settings ?? ({} as typeof target.settings);
    if (body.maxDependents !== undefined) target.settings.maxDependents = body.maxDependents;
    if (body.monthlyUtilities !== undefined) {
      target.settings.monthlyUtilities = body.monthlyUtilities
        ? (new Map(Object.entries(body.monthlyUtilities)) as typeof target.settings.monthlyUtilities)
        : undefined;
    }
    if (body.geoFence !== undefined) {
      target.settings.geoFence = body.geoFence
        ? ({
            centerLat: body.geoFence.centerLat ?? null,
            centerLng: body.geoFence.centerLng ?? null,
            radiusMeters: body.geoFence.radiusMeters ?? null,
            allowedActions: body.geoFence.allowedActions ?? [],
          } as typeof target.settings.geoFence)
        : undefined;
    }
    if (body.custom !== undefined) {
      target.settings.custom = body.custom
        ? (new Map(Object.entries(body.custom)) as typeof target.settings.custom)
        : undefined;
    }
    await target.save();
    res.json({ user: target.toJSON() });
  })
);
