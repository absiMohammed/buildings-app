import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { Building } from '../models/Building.js';
import { User, membershipFor, membershipsForBuilding } from '../models/User.js';
import { rosterRow } from './users.js';
import { Unit } from '../models/Unit.js';
import { InviteToken } from '../models/InviteToken.js';
import { getOrCreatePricing } from '../models/FeaturePricing.js';
import { computeBuildingSubscription } from '../services/subscription.service.js';
import { TRIAL_DAYS } from '../services/plans.service.js';
import { BuildingAction, BUILDING_ACTION_TYPES } from '../models/BuildingAction.js';
import {
  SubscriptionPayment,
  SUBSCRIPTION_PAYMENT_KINDS,
  SUBSCRIPTION_PAYMENT_METHODS,
  SUBSCRIPTION_PAYMENT_STATUSES,
} from '../models/SubscriptionPayment.js';
import { NotFound, BadRequest, Forbidden, AppError } from '../utils/errors.js';
import {
  requireBuildingAdmin,
  requireSystemAdmin,
  type AuthedRequest,
} from '../middleware/auth.js';

export const router = Router();

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const building = await Building.findById((req as AuthedRequest).user.buildingId).lean();
    if (!building) throw NotFound('Building not found');
    res.json({ building });
  })
);

const ALLOWED_CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'JOD'] as const;

const accessControlSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().max(60).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  address: z.string().max(500).optional(),
  currency: z.enum(ALLOWED_CURRENCIES).optional(),
  // System-admin allow-list. Pass an array to restrict the building to that
  // subset of modules; pass null to clear the restriction (= every role's
  // full module set is active). Omit the field to leave the current value
  // untouched. Validators here don't enforce a known-module list — clients
  // ship invalid ids at their own risk and the filter will simply hide them.
  enabledModules: z.array(z.string().min(1).max(80)).nullable().optional(),
  settings: z
    .object({
      monthlyDuesDay: z.number().int().min(1).max(28).optional(),
      defaultMonthlyDues: z.number().min(0).optional(),
      timezone: z.string().min(1).max(60).optional(),
      geoCenter: z
        .object({
          lat: z.number().min(-90).max(90).nullable().optional(),
          lng: z.number().min(-180).max(180).nullable().optional(),
        })
        .nullable()
        .optional(),
      access: z
        .object({
          gate: accessControlSchema.optional(),
          door: accessControlSchema.optional(),
          elevator: accessControlSchema.optional(),
        })
        .optional(),
    })
    .optional(),
});

router.patch(
  '/me',
  requireBuildingAdmin,
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof updateSchema>;
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.address !== undefined) updates.address = body.address;
    if (body.currency !== undefined) updates.currency = body.currency;
    // Building admin cannot toggle features — that's a system-admin-only
    // knob, so we intentionally ignore enabledModules from /me.
    if (body.settings) {
      const existing = await Building.findById(me.buildingId).lean();
      const merged: Record<string, unknown> = { ...(existing?.settings ?? {}), ...body.settings };
      // Deep-merge access so toggling one control doesn't wipe the others.
      if (body.settings.access) {
        const prev = (existing?.settings as { access?: Record<string, unknown> } | undefined)?.access ?? {};
        merged.access = { ...prev, ...body.settings.access };
      }
      updates.settings = merged;
    }
    const building = await Building.findByIdAndUpdate(me.buildingId, updates, { new: true });
    if (!building) throw NotFound('Building not found');
    res.json({ building });
  })
);

// ── System-admin CRUD over Buildings ────────────────────────────────────────
// These routes operate above any single building; only the system admin role
// reaches them. Building admins manage *their* building via /buildings/me.

const createBuildingSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(500).optional(),
  currency: z.enum(ALLOWED_CURRENCIES).default('ILS'),
  timezone: z.string().min(1).max(60).optional(),
  // Optional location pin for the building.
  geoCenter: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
});

router.get(
  '/',
  requireSystemAdmin,
  asyncHandler(async (_req, res) => {
    const buildings = await Building.find().sort({ createdAt: -1 }).lean();
    res.json({ buildings });
  })
);

// ─────────────────────── Feature pricing (admin) ───────────────────────
// Single global doc keyed by module id → annual price. Admin edits via
// PATCH; PATCH accepts a partial map and merges into the current state.
router.get(
  '/admin/pricing',
  requireSystemAdmin,
  asyncHandler(async (_req, res) => {
    const doc = await getOrCreatePricing();
    res.json({
      pricing: {
        prices: { ...(doc.prices as Record<string, number>) },
        currency: doc.currency,
        updatedAt: doc.updatedAt,
      },
    });
  })
);

const pricingPatchSchema = z.object({
  prices: z.record(z.string().min(1).max(80), z.number().nonnegative()).optional(),
  currency: z.string().min(3).max(8).optional(),
});

router.patch(
  '/admin/pricing',
  requireSystemAdmin,
  validate(pricingPatchSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof pricingPatchSchema>;
    const doc = await getOrCreatePricing();
    if (body.prices) {
      // Merge partial updates into the existing object. We can't use a
      // Mongoose Map here because module ids contain `.` which Maps reject;
      // the field is `Schema.Types.Mixed` and we mark it modified so the
      // change persists.
      const current = (doc.prices as Record<string, number> | null | undefined) ?? {};
      doc.prices = { ...current, ...body.prices };
      doc.markModified('prices');
    }
    if (body.currency) doc.currency = body.currency;
    await doc.save();
    res.json({
      pricing: {
        prices: { ...(doc.prices as Record<string, number>) },
        currency: doc.currency,
        updatedAt: doc.updatedAt,
      },
    });
  })
);

// Per-building subscription preview. Sums the annual price of every enabled
// feature × the building's current `enabledModules` allow-list. Doesn't
// persist anything — this is the projection used by AdminPaymentsPage and
// AdminDashboardPage revenue cards.
router.get(
  '/admin/subscriptions',
  requireSystemAdmin,
  asyncHandler(async (_req, res) => {
    const buildings = await Building.find().lean();
    const lines = await Promise.all(
      buildings.map(async (b) => {
        const sub = await computeBuildingSubscription(b);
        return {
          _id: String(b._id),
          name: b.name,
          status: b.status ?? 'active',
          subscription: sub,
        };
      })
    );
    const totals = lines.reduce(
      (acc, l) => {
        if (l.status !== 'active') return acc;
        acc.annual += l.subscription.annual;
        acc.monthly += l.subscription.monthly;
        return acc;
      },
      { annual: 0, monthly: 0 }
    );
    res.json({
      buildings: lines,
      totals: {
        annual: Math.round(totals.annual * 100) / 100,
        monthly: Math.round(totals.monthly * 100) / 100,
      },
    });
  })
);

// System-admin dashboard stats. One endpoint = one round trip; the mobile
// AdminDashboardPage renders the result as a grid of stat cards + two
// charts (role mix + top buildings by user count).
router.get(
  '/admin/stats',
  requireSystemAdmin,
  asyncHandler(async (_req, res) => {
    const [
      buildings,
      totalUsers,
      adminCount,
      ownerCount,
      renterCount,
      dependentCount,
      buildingAdminCount,
      totalUnits,
      pendingInvites,
      topBuildingsAgg,
    ] = await Promise.all([
      Building.find({}, { name: 1, status: 1 }).lean(),
      // Super-admins are application managers, not residents — exclude them
      // from the user total and role breakdown.
      User.countDocuments({ systemRole: 'member' }),
      User.countDocuments({ systemRole: 'admin' }),
      User.countDocuments({ 'memberships.role': 'owner' }),
      User.countDocuments({ 'memberships.role': 'renter' }),
      User.countDocuments({ 'memberships.role': 'dependent' }),
      User.countDocuments({ 'memberships.isBuildingAdmin': true, status: { $in: ['active', 'invited'] } }),
      Unit.countDocuments({}),
      InviteToken.countDocuments({ usedAt: null }),
      User.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $unwind: '$memberships' },
        { $group: { _id: '$memberships.buildingId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);
    const buildingsById = new Map(buildings.map((b) => [String(b._id), b]));
    const active = buildings.filter((b) => (b.status ?? 'active') === 'active').length;
    const inactive = buildings.length - active;
    // Count buildings missing an appointed admin (counts active-or-invited
    // building-admin owners, so a building with a pending appointment is
    // still considered "covered").
    const buildingAdminByBuildingAgg = await User.aggregate<{ _id: Types.ObjectId | null }>([
      { $match: { status: { $in: ['active', 'invited'] } } },
      { $unwind: '$memberships' },
      { $match: { 'memberships.isBuildingAdmin': true } },
      { $group: { _id: '$memberships.buildingId' } },
    ]);
    const buildingsWithAdmin = new Set(
      buildingAdminByBuildingAgg.map((r) => (r._id ? String(r._id) : null)).filter(Boolean)
    );
    const withoutAdmin = buildings.filter(
      (b) => (b.status ?? 'active') === 'active' && !buildingsWithAdmin.has(String(b._id))
    ).length;
    res.json({
      buildings: { total: buildings.length, active, inactive, withoutAdmin },
      users: {
        total: totalUsers,
        byRole: {
          admin: adminCount,
          owner: ownerCount,
          renter: renterCount,
          dependent: dependentCount,
        },
        buildingAdmins: buildingAdminCount,
      },
      units: { total: totalUnits },
      invites: { pending: pendingInvites },
      topBuildings: topBuildingsAgg.map((b) => ({
        _id: String(b._id),
        name: buildingsById.get(String(b._id))?.name ?? '—',
        userCount: b.count,
      })),
    });
  })
);

// System-admin's flat cross-building user roster. Each row carries the
// minimal building summary the mobile UI needs to render the building
// filter without a second roundtrip.
router.get(
  '/users/all',
  requireSystemAdmin,
  asyncHandler(async (_req, res) => {
    const [users, buildings] = await Promise.all([
      // Exclude system super-admins — they aren't building residents and must
      // not appear in the user roster.
      User.find({ systemRole: 'member' }).sort({ createdAt: -1 }),
      Building.find({}, { name: 1, status: 1 }).lean(),
    ]);
    const buildingById = new Map(buildings.map((b) => [String(b._id), b]));
    // Resolve unit numbers for every unit referenced across all memberships.
    const allUnitIds = users.flatMap((u) => u.memberships.flatMap((m) => m.unitIds));
    const units = allUnitIds.length
      ? await Unit.find({ _id: { $in: allUnitIds } }, { number: 1 }).lean()
      : [];
    const unitNumberById = new Map(units.map((u) => [String(u._id), u.number]));

    // One row PER USER, regardless of building. Each row carries a summary of
    // every building the user belongs to (with that building's role + units).
    const rows = users.map((u) => ({
      _id: String(u._id),
      phone: u.phone,
      email: u.email ?? null,
      firstName: u.firstName,
      lastName: u.lastName,
      status: u.status,
      memberships: u.memberships.map((m) => {
        const b = buildingById.get(String(m.buildingId));
        return {
          buildingId: String(m.buildingId),
          buildingName: b?.name ?? '—',
          buildingStatus: b?.status ?? 'active',
          role: m.role,
          isBuildingAdmin: !!m.isBuildingAdmin,
          unitIds: (m.unitIds ?? []).map((x) => String(x)),
          unitNumbers: (m.unitIds ?? []).map((x) => unitNumberById.get(String(x))).filter(Boolean),
        };
      }),
    }));
    res.json({ users: rows });
  })
);

router.post(
  '/',
  requireSystemAdmin,
  validate(createBuildingSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBuildingSchema>;
    const building = await Building.create({
      name: body.name,
      address: body.address ?? '',
      currency: body.currency,
      // New buildings start INACTIVE and can only be activated once a
      // building admin has been assigned (enforced on PATCH /:id/status).
      status: 'inactive',
      // Every building must hold a subscription: admin-created ones start
      // on the same 1-month trial as self-service signups.
      subscription: {
        plan: 'trial',
        status: 'trial',
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        currentPeriodEnd: null,
      },
      settings: {
        timezone: body.timezone ?? 'UTC',
        ...(body.geoCenter ? { geoCenter: body.geoCenter } : {}),
      },
    });
    res.status(201).json({ building });
  })
);

router.patch(
  '/:id',
  requireSystemAdmin,
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = await Building.findById(req.params.id).lean();
    if (!existing) throw NotFound('Building not found');
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.address !== undefined) updates.address = body.address;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.enabledModules !== undefined) {
      // null clears the restriction; an array sets the allow-list.
      updates.enabledModules = body.enabledModules === null ? undefined : body.enabledModules;
    }
    if (body.settings) updates.settings = { ...(existing.settings ?? {}), ...body.settings };
    const building = await Building.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ building });
  })
);

// Activate or deactivate a building. Deactivation is a soft kill — historical
// data stays, but residents lose access (route guards reject sessions whose
// building is inactive — see auth middleware).
const statusBodySchema = z.object({ status: z.enum(['active', 'inactive']) });
router.patch(
  '/:id/status',
  requireSystemAdmin,
  validate(statusBodySchema),
  asyncHandler(async (req, res) => {
    const next = (req.body as z.infer<typeof statusBodySchema>).status;
    // A building can only be activated once it has at least one building admin.
    if (next === 'active') {
      const adminCount = await User.countDocuments({
        buildingId: req.params.id,
        isBuildingAdmin: true,
        status: { $in: ['active', 'invited'] },
      });
      if (adminCount === 0) {
        // Distinct code so the client can show a localized message instead of
        // this English fallback.
        throw new AppError(
          400,
          'BUILDING_NEEDS_ADMIN',
          'Assign a building admin before activating this building.',
        );
      }
    }
    const building = await Building.findByIdAndUpdate(
      req.params.id,
      { status: next },
      { new: true }
    );
    if (!building) throw NotFound('Building not found');
    res.json({ building });
  })
);

// List users belonging to a target building. System-admin-only — building
// admins use `/users` (which is scoped to their own building automatically).
router.get(
  '/:id/users',
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const buildingId = req.params.id ?? '';
    if (!Types.ObjectId.isValid(buildingId)) throw BadRequest('Invalid id');
    const users = await User.find({ 'memberships.buildingId': buildingId }).sort({ createdAt: -1 });
    res.json({ users: users.map((u) => rosterRow(u, buildingId)) });
  })
);

// List units belonging to a target building. System-admin-only counterpart
// to GET /units (which is implicitly scoped to the caller's own building).
router.get(
  '/:id/units',
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const buildingId = req.params.id ?? '';
    if (!Types.ObjectId.isValid(buildingId)) throw BadRequest('Invalid id');
    const units = await Unit.find({ buildingId }).sort({ number: 1 });
    res.json({ units });
  })
);

// System-admin unit management for a target building. Lets the platform admin
// fully set up a building (units + admin) before handing it off — the building
// admin manages units for their own building via /units.
const unitInputSchema = z.object({
  number: z.string().min(1).max(20),
  floor: z.number().int().optional(),
  sqft: z.number().min(0).optional(),
  bedrooms: z.number().int().min(0).optional(),
  monthlyDuesAmount: z.number().min(0).optional(),
  monthlyDuesDayOverride: z.number().int().min(1).max(28).nullable().optional(),
  notes: z.string().max(500).optional(),
});

router.post(
  '/:id/units',
  requireSystemAdmin,
  validate(unitInputSchema),
  asyncHandler(async (req, res) => {
    const buildingId = req.params.id ?? '';
    if (!Types.ObjectId.isValid(buildingId)) throw BadRequest('Invalid id');
    const b = await Building.findById(buildingId);
    if (!b) throw NotFound('Building not found');
    const unit = await Unit.create({ ...(req.body as z.infer<typeof unitInputSchema>), buildingId });
    res.status(201).json({ unit });
  })
);

router.patch(
  '/:id/units/:unitId',
  requireSystemAdmin,
  validate(unitInputSchema.partial()),
  asyncHandler(async (req, res) => {
    const { id, unitId } = req.params;
    if (!Types.ObjectId.isValid(id ?? '') || !Types.ObjectId.isValid(unitId ?? '')) throw BadRequest('Invalid id');
    const unit = await Unit.findOneAndUpdate({ _id: unitId, buildingId: id }, req.body, { new: true });
    if (!unit) throw NotFound('Unit not found');
    res.json({ unit });
  })
);

router.delete(
  '/:id/units/:unitId',
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const { id, unitId } = req.params;
    if (!Types.ObjectId.isValid(id ?? '') || !Types.ObjectId.isValid(unitId ?? '')) throw BadRequest('Invalid id');
    const unit = await Unit.findOneAndDelete({ _id: unitId, buildingId: id });
    if (!unit) throw NotFound('Unit not found');
    res.status(204).end();
  })
);

router.delete(
  '/:id',
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    // Refuse to delete a building that still has users or units attached.
    // System admin must drain it first; this prevents orphan data.
    const [userCount, unitCount] = await Promise.all([
      User.countDocuments({ 'memberships.buildingId': id }),
      Unit.countDocuments({ buildingId: id }),
    ]);
    if (userCount > 0 || unitCount > 0) {
      throw BadRequest(
        `Building still has ${userCount} user(s) and ${unitCount} unit(s); move or remove them first.`
      );
    }
    const building = await Building.findByIdAndDelete(id);
    if (!building) throw NotFound('Building not found');
    res.status(204).end();
  })
);

// Nominate (or revoke) an owner as the building admin. Allowed for the
// system admin always; allowed for the current building admin within their
// own building so they can hand off the role before stepping down.
const nominateSchema = z.object({ isBuildingAdmin: z.boolean() });
router.patch(
  '/:buildingId/admin/:userId',
  validate(nominateSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const buildingId = req.params.buildingId ?? '';
    const userId = req.params.userId ?? '';
    if (!Types.ObjectId.isValid(buildingId) || !Types.ObjectId.isValid(userId)) {
      throw BadRequest('Invalid id');
    }

    if (me.role === 'admin') {
      // System admin — allowed.
    } else if (me.isBuildingAdmin && me.buildingId === buildingId) {
      // Current building admin — allowed to hand off within their building.
    } else {
      throw BadRequest('Only the current building admin can hand off the role.');
    }

    const target = await User.findOne({ _id: userId, 'memberships.buildingId': buildingId });
    if (!target) throw NotFound('User not found in this building');
    if (target.systemRole === 'admin') {
      throw BadRequest('The system administrator cannot be a building admin.');
    }
    const memberships = membershipsForBuilding(target, buildingId);
    if (!memberships.length) throw NotFound('User not found in this building');
    const next = (req.body as z.infer<typeof nominateSchema>).isBuildingAdmin;
    // Building-admin is a building-level flag — apply across all the user's
    // roles/units in this building.
    for (const m of memberships) m.isBuildingAdmin = next;
    await target.save();

    // A building can't stay active without a manager: if this removed the last
    // building admin, deactivate the building.
    if (!next) {
      const remaining = await User.countDocuments({
        memberships: { $elemMatch: { buildingId, isBuildingAdmin: true } },
        status: { $in: ['active', 'invited'] },
      });
      if (remaining === 0) {
        await Building.findByIdAndUpdate(buildingId, { status: 'inactive' });
      }
    }

    res.json({ user: rosterRow(target, buildingId) });
  })
);

// ─────────────────────── Building actions (admin) ───────────────────────
// Configurable per-building "actions" (open_gate, call_elevator, etc.) with
// their own credentials + annual price. Authored by the system admin from
// BuildingDetailPage. Listed read-only by building admins on their own
// building (so they can see what's wired without being able to edit the
// integration credentials).

const actionInputSchema = z.object({
  type: z.enum(BUILDING_ACTION_TYPES),
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  config: z.record(z.string().min(1).max(80), z.string().max(2000)).optional(),
  annualPrice: z.number().nonnegative().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// List — admin always; building admin within their own building.
router.get(
  '/:id/actions',
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const buildingId = req.params.id;
    if (!buildingId || !Types.ObjectId.isValid(buildingId)) throw BadRequest('Invalid id');
    if (me.role !== 'admin') {
      // Building admins can only list their own building's actions.
      if (!me.isBuildingAdmin || me.buildingId !== buildingId) throw Forbidden();
    }
    const actions = await BuildingAction.find({ buildingId }).sort({ createdAt: -1 });
    res.json({ actions: actions.map((a) => a.toJSON()) });
  })
);

router.post(
  '/:id/actions',
  requireSystemAdmin,
  validate(actionInputSchema),
  asyncHandler(async (req, res) => {
    const buildingId = req.params.id;
    if (!buildingId || !Types.ObjectId.isValid(buildingId)) throw BadRequest('Invalid id');
    const exists = await Building.exists({ _id: buildingId });
    if (!exists) throw NotFound('Building not found');
    const body = req.body as z.infer<typeof actionInputSchema>;
    const action = await BuildingAction.create({
      buildingId,
      type: body.type,
      name: body.name,
      description: body.description ?? '',
      config: body.config ?? {},
      annualPrice: body.annualPrice ?? 0,
      status: body.status ?? 'active',
    });
    res.status(201).json({ action: action.toJSON() });
  })
);

router.patch(
  '/:id/actions/:actionId',
  requireSystemAdmin,
  validate(actionInputSchema.partial()),
  asyncHandler(async (req, res) => {
    const { id: buildingId, actionId } = req.params;
    if (
      !buildingId || !Types.ObjectId.isValid(buildingId) ||
      !actionId || !Types.ObjectId.isValid(actionId)
    ) {
      throw BadRequest('Invalid id');
    }
    const body = req.body as Partial<z.infer<typeof actionInputSchema>>;
    const action = await BuildingAction.findOne({ _id: actionId, buildingId });
    if (!action) throw NotFound('Action not found');
    if (body.type !== undefined) action.type = body.type;
    if (body.name !== undefined) action.name = body.name;
    if (body.description !== undefined) action.description = body.description;
    if (body.config !== undefined) {
      action.config = body.config as typeof action.config;
      action.markModified('config');
    }
    if (body.annualPrice !== undefined) action.annualPrice = body.annualPrice;
    if (body.status !== undefined) action.status = body.status;
    await action.save();
    res.json({ action: action.toJSON() });
  })
);

router.delete(
  '/:id/actions/:actionId',
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const { id: buildingId, actionId } = req.params;
    if (
      !buildingId || !Types.ObjectId.isValid(buildingId) ||
      !actionId || !Types.ObjectId.isValid(actionId)
    ) {
      throw BadRequest('Invalid id');
    }
    const action = await BuildingAction.findOneAndDelete({ _id: actionId, buildingId });
    if (!action) throw NotFound('Action not found');
    res.status(204).end();
  })
);

// ─────────────────────── Subscription payments (admin) ───────────────────────
// One row per installment the admin records against a building's
// subscription. Distinct from resident dues — see SubscriptionPayment model.
const paymentInputSchema = z.object({
  buildingId: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string().min(3).max(8).optional(),
  periodKind: z.enum(SUBSCRIPTION_PAYMENT_KINDS),
  periodLabel: z.string().min(1).max(32),
  dueDate: z.string().datetime().or(z.string().min(8)),
  paidAt: z.string().datetime().or(z.string().min(8)).nullable().optional(),
  status: z.enum(SUBSCRIPTION_PAYMENT_STATUSES).optional(),
  method: z.enum(SUBSCRIPTION_PAYMENT_METHODS).nullable().optional(),
  externalRef: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

// List subscription payments with optional filters + cursor pagination.
// Query params:
//   status     'pending' | 'paid' | 'cancelled' | 'overdue'  (overdue =
//              pending && dueDate < now, computed at query time)
//   buildingId restrict to a single building
//   period     exact periodLabel match (e.g. '2026-05')
//   limit      default 50, max 200
//   before     cursor: returns rows with dueDate < this ISO timestamp.
//              Combined with the sort by dueDate desc, you get the next
//              page by passing the oldest row's dueDate from the prior
//              response.
// Response always includes { payments, nextBefore } where `nextBefore`
// is the last-page-row's dueDate, or null when the page is short.
router.get(
  '/admin/payments',
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    const status = q.status;
    const now = new Date();
    if (status === 'overdue') {
      filter.status = 'pending';
      filter.dueDate = { $lt: now };
    } else if (status === 'pending' || status === 'paid' || status === 'cancelled') {
      filter.status = status;
    }
    if (q.buildingId && Types.ObjectId.isValid(q.buildingId)) {
      filter.buildingId = q.buildingId;
    }
    if (q.period) {
      filter.periodLabel = q.period;
    }
    if (q.before) {
      const cursor = new Date(q.before);
      if (!Number.isNaN(cursor.getTime())) {
        const existing = (filter.dueDate as Record<string, unknown>) ?? {};
        filter.dueDate = { ...existing, $lt: cursor };
      }
    }
    const requestedLimit = parseInt(q.limit ?? '', 10);
    const limit = Math.min(
      200,
      Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50)
    );

    const [payments, buildings] = await Promise.all([
      SubscriptionPayment.find(filter).sort({ dueDate: -1 }).limit(limit),
      Building.find({}, { name: 1 }).lean(),
    ]);
    const nameById = new Map(buildings.map((b) => [String(b._id), b.name]));
    const enriched = payments.map((p) => {
      const obj = p.toJSON() as Record<string, unknown>;
      const bid = String(p.buildingId);
      return { ...obj, buildingName: nameById.get(bid) ?? '—' };
    });
    const last = payments[payments.length - 1];
    const nextBefore =
      payments.length === limit && last ? last.dueDate.toISOString() : null;
    res.json({ payments: enriched, nextBefore });
  })
);

router.post(
  '/admin/payments',
  requireSystemAdmin,
  validate(paymentInputSchema),
  asyncHandler(async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body as z.infer<typeof paymentInputSchema>;
    if (!Types.ObjectId.isValid(body.buildingId)) throw BadRequest('Invalid buildingId');
    const b = await Building.findById(body.buildingId).lean();
    if (!b) throw NotFound('Building not found');
    const payment = await SubscriptionPayment.create({
      buildingId: body.buildingId,
      amount: Math.round(body.amount * 100) / 100,
      currency: body.currency ?? b.currency ?? 'USD',
      periodKind: body.periodKind,
      periodLabel: body.periodLabel,
      dueDate: new Date(body.dueDate),
      paidAt: body.paidAt ? new Date(body.paidAt) : null,
      status: body.status ?? (body.paidAt ? 'paid' : 'pending'),
      method: body.method ?? null,
      externalRef: body.externalRef ?? '',
      notes: body.notes ?? '',
      createdBy: new Types.ObjectId(me.sub),
    });
    res.status(201).json({ payment: payment.toJSON() });
  })
);

router.patch(
  '/admin/payments/:id',
  requireSystemAdmin,
  validate(paymentInputSchema.partial()),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) throw BadRequest('Invalid id');
    const body = req.body as Partial<z.infer<typeof paymentInputSchema>>;
    const payment = await SubscriptionPayment.findById(id);
    if (!payment) throw NotFound('Payment not found');
    if (body.amount !== undefined) payment.amount = Math.round(body.amount * 100) / 100;
    if (body.currency !== undefined) payment.currency = body.currency;
    if (body.periodKind !== undefined) payment.periodKind = body.periodKind;
    if (body.periodLabel !== undefined) payment.periodLabel = body.periodLabel;
    if (body.dueDate !== undefined) payment.dueDate = new Date(body.dueDate);
    if (body.paidAt !== undefined) payment.paidAt = body.paidAt ? new Date(body.paidAt) : null;
    if (body.status !== undefined) payment.status = body.status;
    if (body.method !== undefined) payment.method = body.method ?? null;
    if (body.externalRef !== undefined) payment.externalRef = body.externalRef;
    if (body.notes !== undefined) payment.notes = body.notes;
    await payment.save();
    res.json({ payment: payment.toJSON() });
  })
);

router.delete(
  '/admin/payments/:id',
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) throw BadRequest('Invalid id');
    const payment = await SubscriptionPayment.findByIdAndDelete(id);
    if (!payment) throw NotFound('Payment not found');
    res.status(204).end();
  })
);

// Aggregated revenue summary — used by the AdminDashboardPage. Combines
// projected ARR/MRR (from computed subscriptions) with actual collected
// amounts (from SubscriptionPayment rows) so the dashboard can show both
// "what we should earn" and "what we did earn".
router.get(
  '/admin/revenue/summary',
  requireSystemAdmin,
  asyncHandler(async (_req, res) => {
    const buildings = await Building.find().lean();
    const subs = await Promise.all(buildings.map((b) => computeBuildingSubscription(b)));
    let arr = 0;
    let mrr = 0;
    let activeArr = 0;
    let activeMrr = 0;
    const perBuilding = buildings.map((b, i) => {
      const s = subs[i]!;
      arr += s.annual;
      mrr += s.monthly;
      if ((b.status ?? 'active') === 'active') {
        activeArr += s.annual;
        activeMrr += s.monthly;
      }
      return {
        _id: String(b._id),
        name: b.name,
        status: b.status ?? 'active',
        currency: b.currency,
        annual: s.annual,
        monthly: s.monthly,
        featuresAnnual: s.featuresAnnual,
        actionsAnnual: s.actionsAnnual,
      };
    });

    // Month-to-date collected vs outstanding (across all buildings).
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [paidAgg, outstandingAgg] = await Promise.all([
      SubscriptionPayment.aggregate<{ _id: null; total: number }>([
        {
          $match: {
            status: 'paid',
            paidAt: { $gte: monthStart, $lt: nextMonthStart },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      SubscriptionPayment.aggregate<{ _id: null; total: number }>([
        {
          $match: { status: 'pending', dueDate: { $lt: nextMonthStart } },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    const paidMtd = paidAgg[0]?.total ?? 0;
    const outstanding = outstandingAgg[0]?.total ?? 0;

    // Top 5 buildings by ARR (only active buildings).
    const topByArr = [...perBuilding]
      .filter((b) => b.status === 'active')
      .sort((a, b) => b.annual - a.annual)
      .slice(0, 5)
      .map(({ _id, name, annual }) => ({ _id, name, annual }));

    res.json({
      totals: {
        arr: round2(arr),
        mrr: round2(mrr),
        activeArr: round2(activeArr),
        activeMrr: round2(activeMrr),
        paidMtd: round2(paidMtd),
        outstanding: round2(outstanding),
      },
      buildings: perBuilding,
      topByArr,
    });
  })
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
