import type { BuildingDoc } from '../models/Building.js';

/**
 * The three self-service subscription plans, sold as monthly auto-renewing
 * in-app purchases (StoreKit / Play Billing product ids below), plus the
 * implicit 1-month trial every new self-service building starts on.
 *
 * Mirrored on mobile in `mobile/src/data/plans.ts` — keep ids, limits and
 * modules in sync. Prices here are display metadata; the store is the
 * source of truth for what the user is actually charged.
 */

export type PaidPlanId = 'basic' | 'pro' | 'premium';

export interface PlanLimits {
  /** null = unlimited */
  maxUnits: number | null;
  maxUsers: number | null;
  maxStories: number | null;
  /** Per-unit dependents cap. 1 owner + 1 tenant per unit is a global
   *  rule (enforced in createInvite) — plans only vary the dependents. */
  maxDependentsPerUnit: number | null;
}

export interface PlanDef {
  id: PaidPlanId;
  /** Auto-renewing subscription product id registered in both stores. */
  productId: string;
  /** Display price (USD/month); the store receipt is authoritative. */
  priceMonthly: number;
  limits: PlanLimits;
  /** Module ids (MODULES.*) enabled on this plan. null = all modules. */
  modules: string[] | null;
}

// Literal MODULES.* ids (see capabilities.service.ts). Kept as literals so
// this module has no import edge into capabilities.service — that file
// imports plans.service for the user payload, and a cycle would bite at
// module-init time.
const CORE_MODULES = [
  'module.payments',
  'module.expenses',
  'module.maintenance',
  'module.documents',
];

export const PLANS: Record<PaidPlanId, PlanDef> = {
  basic: {
    id: 'basic',
    productId: 'com.absitech.buildingapp.plan.basic.monthly',
    priceMonthly: 29.99,
    limits: { maxUnits: 8, maxUsers: null, maxStories: 4, maxDependentsPerUnit: 0 },
    modules: CORE_MODULES,
  },
  pro: {
    id: 'pro',
    productId: 'com.absitech.buildingapp.plan.pro.monthly',
    priceMonthly: 59.99,
    limits: { maxUnits: 14, maxUsers: null, maxStories: 7, maxDependentsPerUnit: 1 },
    modules: [
      ...CORE_MODULES,
      'module.polls',
      'module.units',
      'module.users',
      'module.household',
    ],
  },
  premium: {
    id: 'premium',
    productId: 'com.absitech.buildingapp.plan.premium.monthly',
    priceMonthly: 99.99,
    limits: { maxUnits: null, maxUsers: null, maxStories: null, maxDependentsPerUnit: null },
    modules: null,
  },
};

export const TRIAL_DAYS = 31;

const UNLIMITED: PlanLimits = {
  maxUnits: null,
  maxUsers: null,
  maxStories: null,
  maxDependentsPerUnit: null,
};

/**
 * Effective limits for a building's current subscription state. Trials get
 * everything unlimited (that's the pitch); a lapsed/absent subscription
 * falls back to the strictest paid tier so reads still work while the
 * paywall blocks growth.
 */
export function limitsFor(building: Pick<BuildingDoc, 'subscription'>): PlanLimits {
  const sub = building.subscription;
  if (!sub || sub.status === 'trial') return UNLIMITED;
  if (sub.status === 'active' && sub.plan && sub.plan !== 'trial') {
    return PLANS[sub.plan as PaidPlanId]?.limits ?? UNLIMITED;
  }
  return PLANS.basic.limits;
}

/** Module allow-list for the building's plan. null = no restriction. */
export function planModulesFor(building: Pick<BuildingDoc, 'subscription'>): string[] | null {
  const sub = building.subscription;
  if (!sub || sub.status === 'trial') return null;
  if (sub.status === 'active' && sub.plan && sub.plan !== 'trial') {
    return PLANS[sub.plan as PaidPlanId]?.modules ?? null;
  }
  return null;
}

export function isSuspended(building: Pick<BuildingDoc, 'status'>): boolean {
  return building.status === 'suspended';
}

/** Days of trial remaining (0 when lapsed or not on trial). */
export function trialDaysLeft(building: Pick<BuildingDoc, 'subscription'>): number {
  const ends = building.subscription?.trialEndsAt;
  if (!ends || building.subscription?.status !== 'trial') return 0;
  return Math.max(0, Math.ceil((+ends - Date.now()) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Limit enforcement — called from the unit-create and invite paths. Throws a
// distinct PLAN_LIMIT error code so clients can route the admin to the
// upgrade paywall instead of showing a generic failure.
// ---------------------------------------------------------------------------

import { Building } from '../models/Building.js';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/errors.js';

function planLimitError(what: 'units' | 'users'): AppError {
  return new AppError(
    403,
    'PLAN_LIMIT',
    `Your current plan has reached its ${what} limit. Upgrade to add more.`,
  );
}

export async function assertPlanAllowsNewUnit(buildingId: string): Promise<void> {
  const building = await Building.findById(buildingId).select('subscription').lean();
  if (!building) return;
  const { maxUnits } = limitsFor(building);
  if (maxUnits === null) return;
  const count = await Unit.countDocuments({ buildingId });
  if (count >= maxUnits) throw planLimitError('units');
}

export async function assertPlanAllowsNewUser(buildingId: string): Promise<void> {
  const building = await Building.findById(buildingId).select('subscription').lean();
  if (!building) return;
  const { maxUsers } = limitsFor(building);
  if (maxUsers === null) return;
  const count = await User.countDocuments({
    memberships: { $elemMatch: { buildingId } },
    status: { $in: ['active', 'invited'] },
  });
  if (count >= maxUsers) throw planLimitError('users');
}

/**
 * Per-unit dependents cap (basic: none, pro: 1, premium: unlimited).
 * Owner/tenant caps (1 each per unit) are global rules enforced in
 * createInvite regardless of plan.
 */
export async function assertPlanAllowsNewDependent(
  buildingId: string,
  unitId: string
): Promise<void> {
  const building = await Building.findById(buildingId).select('subscription').lean();
  if (!building) return;
  const cap = limitsFor(building).maxDependentsPerUnit;
  if (cap === null) return;
  const count = await User.countDocuments({
    memberships: { $elemMatch: { unitIds: unitId, role: 'dependent' } },
    status: { $in: ['active', 'invited'] },
  });
  if (count >= cap) {
    throw new AppError(
      403,
      'PLAN_LIMIT',
      cap === 0
        ? 'Your current plan does not include dependents. Upgrade to add them.'
        : `Your current plan allows ${cap} dependent(s) per unit. Upgrade to add more.`,
    );
  }
}
