import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireBuildingAdmin, requireSystemAdmin, type AuthedRequest } from '../middleware/auth.js';
import {
  User,
  GEO_FENCE_ACTIONS,
  membershipFor,
  membershipsForBuilding,
  primaryMembership,
  type UserDoc,
} from '../models/User.js';
import { Building } from '../models/Building.js';
import { Unit } from '../models/Unit.js';
import { NotFound, BadRequest, Conflict, Forbidden } from '../utils/errors.js';
import {
  createSystemAdmin,
  updateUserByAdmin,
  resetUserCredentials,
  loginShareLink,
} from '../services/auth.service.js';

export const router = Router();

// System-admin-only: create another super-admin (application manager). No
// building/unit — returns a generated initial password to share.
const createAdminSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(4).max(40).optional(),
    firstName: z.string().max(80).optional(),
    lastName: z.string().max(80).optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), { message: 'email or phone is required', path: ['phone'] });

router.post(
  '/system-admin',
  requireSystemAdmin,
  validate(createAdminSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createAdminSchema>;
    const result = await createSystemAdmin(body);
    res.status(201).json(result);
  })
);

// Flatten a user to a roster row for ONE building — surfacing that building's
// membership (role / units / admin flag) as top-level fields the client reads.
export function rosterRow(u: UserDoc, buildingId: string) {
  const ms = membershipsForBuilding(u, buildingId);
  const primary = primaryMembership(u, buildingId);
  // A user may hold several roles across this building's units; the roster row
  // shows the primary role, the union of their units, and per-unit roles.
  const unitIds = [...new Set(ms.flatMap((m) => m.unitIds.map((x) => String(x))))];
  return {
    _id: String(u._id),
    phone: u.phone,
    email: u.email ?? null,
    firstName: u.firstName,
    lastName: u.lastName,
    status: u.status,
    role: primary?.role ?? 'independent',
    unitId: unitIds[0] ?? null,
    unitIds,
    // Per-role breakdown for this building (e.g. owner:[1A], renter:[2B]).
    roles: ms.map((m) => ({ role: m.role, unitIds: m.unitIds.map((x) => String(x)) })),
    isBuildingAdmin: ms.some((m) => m.isBuildingAdmin),
    createdAt: u.get('createdAt'),
    updatedAt: u.get('updatedAt'),
  };
}

// Every unit in the caller's active building that the caller OWNS.
// `Unit.ownerId` is the canonical owner marker (kept in sync by
// createInvite/updateUserByAdmin), so it's the source of truth here.
async function unitIdsOwnedBy(me: AuthedRequest['user']): Promise<string[]> {
  if (!me.buildingId) return [];
  const units = await Unit.find({ buildingId: me.buildingId, ownerId: me.sub })
    .select('_id')
    .lean();
  return units.map((u) => String(u._id));
}

/** True when `target` is a renter/dependent living in a unit `me` owns (and
 *  not a building admin — owners never manage their building's admins). */
async function ownerManages(me: AuthedRequest['user'], target: UserDoc): Promise<boolean> {
  if (me.role !== 'owner' || !me.buildingId) return false;
  if (target.systemRole === 'admin') return false;
  const ms = membershipsForBuilding(target, me.buildingId);
  if (ms.some((m) => m.isBuildingAdmin)) return false;
  const mine = await unitIdsOwnedBy(me);
  return ms.some(
    (m) =>
      (m.role === 'renter' || m.role === 'dependent') &&
      m.unitIds.some((u) => mine.includes(String(u))),
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const buildingId = me.buildingId;
    if (!buildingId) throw Forbidden('Building context required');

    // Building admins see the whole roster.
    if (me.isBuildingAdmin) {
      const users = await User.find({ 'memberships.buildingId': buildingId }).sort({ createdAt: -1 });
      res.json({ users: users.map((u) => rosterRow(u, buildingId)) });
      return;
    }

    // Plain owners see the renters/dependents living in units they own.
    if (me.role === 'owner') {
      const mine = await unitIdsOwnedBy(me);
      if (mine.length === 0) {
        res.json({ users: [] });
        return;
      }
      const users = await User.find({
        memberships: {
          $elemMatch: {
            buildingId,
            role: { $in: ['renter', 'dependent'] },
            unitIds: { $in: mine },
          },
        },
      }).sort({ createdAt: -1 });
      res.json({ users: users.map((u) => rosterRow(u, buildingId)) });
      return;
    }

    throw Forbidden('Not allowed');
  })
);

// Edit a user. The system admin can change name, login phone, and the full set
// of building/unit/role memberships (same power as creation). A building admin
// may edit the display name only, and only for a user in their own building.
const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(4).max(40).optional(),
  memberships: z
    .array(
      z.object({
        buildingId: z.string(),
        role: z.enum(['owner', 'renter', 'dependent', 'independent']),
        unitIds: z.array(z.string()).optional(),
        isBuildingAdmin: z.boolean().optional(),
      }),
    )
    .optional(),
});

router.patch(
  '/:id',
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof profileSchema>;

    // System admin: full edit (name + phone + memberships) on any user.
    if (me.role === 'admin') {
      const user = await updateUserByAdmin(req.params.id ?? '', body);
      res.json({ user: user.toJSON() });
      return;
    }

    // Building admin: full edit (name, phone, and memberships) for a user in
    // their own building — same power as when creating one. Membership edits
    // are confined to their building; memberships the target holds in OTHER
    // buildings are carried through untouched.
    if (me.isBuildingAdmin && me.buildingId) {
      const myBuildingId = me.buildingId;
      const target = await User.findById(req.params.id);
      if (!target) throw NotFound('User not found');
      if (target.systemRole === 'admin') throw Forbidden('Not allowed');
      if (!membershipFor(target, myBuildingId)) throw Forbidden('Building admin required');

      let memberships = body.memberships;
      if (memberships) {
        if (memberships.some((m) => String(m.buildingId) !== myBuildingId)) {
          throw Forbidden('You can only manage memberships of your own building.');
        }
        const others = target.memberships
          .filter((m) => String(m.buildingId) !== myBuildingId)
          .map((m) => ({
            buildingId: String(m.buildingId),
            role: m.role as 'owner' | 'renter' | 'dependent' | 'independent',
            unitIds: m.unitIds.map((u) => String(u)),
            isBuildingAdmin: !!m.isBuildingAdmin,
          }));
        memberships = [...memberships, ...others];
      }

      const user = await updateUserByAdmin(req.params.id ?? '', { ...body, memberships });
      res.json({ user: rosterRow(user, myBuildingId) });
      return;
    }

    // Plain owner: name/phone edits only, and only for the renters/dependents
    // of units they own. Memberships stay admin-only territory.
    if (me.role === 'owner' && me.buildingId) {
      const target = await User.findById(req.params.id);
      if (!target) throw NotFound('User not found');
      if (!(await ownerManages(me, target))) {
        throw Forbidden('You can only manage tenants and dependents of your own units.');
      }
      if (body.memberships) throw Forbidden('Only an admin can change memberships.');
      const user = await updateUserByAdmin(req.params.id ?? '', {
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
      });
      res.json({ user: rosterRow(user, me.buildingId) });
      return;
    }

    throw Forbidden('Not allowed');
  })
);

// Guard: system admin (any user), building admin (own building, not the
// super-admin), or a plain owner acting on the renters/dependents of units
// they own. Returns the target for reuse.
async function assertCanManage(req: AuthedRequest) {
  const me = req.user;
  const target = await User.findById(req.params.id);
  if (!target) throw NotFound('User not found');
  if (me.role === 'admin') return target;
  if (me.isBuildingAdmin && me.buildingId) {
    if (target.systemRole === 'admin') throw Forbidden('Not allowed');
    if (!membershipFor(target, me.buildingId)) throw Forbidden('Building admin required');
    return target;
  }
  if (await ownerManages(me, target)) return target;
  throw Forbidden('Not allowed');
}

// Reset a user's password and return a wa.me link to re-share the new login.
router.patch(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    await assertCanManage(req as AuthedRequest);
    res.json(await resetUserCredentials(req.params.id ?? ''));
  })
);

// Get a wa.me link to (re)send the user's login info (no password reset).
router.get(
  '/:id/whatsapp-link',
  asyncHandler(async (req, res) => {
    await assertCanManage(req as AuthedRequest);
    res.json(await loginShareLink(req.params.id ?? ''));
  })
);

const statusSchema = z.object({ status: z.enum(['active', 'suspended']) });

router.patch(
  '/:id/status',
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const nextStatus = (req.body as { status: 'active' | 'suspended' }).status;
    const user = await User.findById(req.params.id);
    if (!user) throw NotFound('User not found');

    // System admin acts on any user; a building admin only on users in their
    // own building (never the system admin); a plain owner only on the
    // renters/dependents of units they own.
    if (me.role === 'admin') {
      // allowed
    } else if (me.isBuildingAdmin && me.buildingId) {
      if (user.systemRole === 'admin') throw Forbidden('Not allowed');
      if (!membershipFor(user, me.buildingId)) throw Forbidden('Building admin required');
    } else if (await ownerManages(me, user)) {
      // allowed
    } else {
      throw Forbidden('Not allowed');
    }

    user.status = nextStatus;
    if (nextStatus === 'suspended') {
      // Kill the refresh token + bump sessionsRevokedAt so in-flight access
      // tokens are rejected on the next request.
      user.refreshTokenHash = null;
      user.sessionsRevokedAt = new Date();
    }
    await user.save();

    // Suspending the last building admin of a building leaves it unmanaged —
    // deactivate that building (reactivatable once an admin is reassigned).
    if (nextStatus === 'suspended') {
      const buildingsWhereAdmin = user.memberships.filter((m) => m.isBuildingAdmin).map((m) => m.buildingId);
      for (const bId of buildingsWhereAdmin) {
        const remaining = await User.countDocuments({
          _id: { $ne: user._id },
          memberships: { $elemMatch: { buildingId: bId, isBuildingAdmin: true } },
          status: { $in: ['active', 'invited'] },
        });
        if (remaining === 0) await Building.findByIdAndUpdate(bId, { status: 'inactive' });
      }
    }

    // Building-admin callers get the roster row for their building; the system
    // admin gets the full user JSON.
    res.json({ user: me.buildingId ? rosterRow(user, me.buildingId) : user.toJSON() });
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
    const nextRole = (req.body as { role: 'admin' | 'owner' }).role;
    const target = await User.findById(req.params.id);
    if (!target) throw NotFound('User not found');
    if (nextRole === 'admin') {
      if (target.systemRole === 'admin') throw BadRequest('Already a system admin.');
      // Becoming a system super-admin drops all building memberships.
      target.systemRole = 'admin';
      target.memberships.splice(0, target.memberships.length);
    } else {
      if (target.systemRole !== 'admin') throw BadRequest('Only a system admin can be demoted.');
      target.systemRole = 'member';
    }
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
    const target = await User.findOne({ _id: req.params.id, 'memberships.buildingId': me.buildingId });
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
