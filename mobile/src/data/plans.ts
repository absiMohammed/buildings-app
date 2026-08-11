// Mirror of server/src/services/plans.service.ts — keep ids, limits and
// modules in sync. Display strings live in i18n; store product ids are the
// contract with StoreKit / Play Billing.

export type PaidPlanId = 'basic' | 'pro' | 'premium';

export interface PlanLimits {
  /** null = unlimited */
  maxUnits: number | null;
  maxUsers: number | null;
  maxStories: number | null;
  /** Per-unit dependents cap. 1 owner + 1 tenant per unit is a global
   *  rule — plans only vary the dependents. */
  maxDependentsPerUnit: number | null;
}

export interface PlanDef {
  id: PaidPlanId;
  productId: string;
  /** Display price (USD/month); the store is authoritative at purchase time. */
  priceMonthly: number;
  limits: PlanLimits;
  /** MODULES.* ids enabled on this plan. null = all modules. */
  modules: string[] | null;
}

export const TRIAL_DAYS = 31;

export const PLAN_IDS: PaidPlanId[] = ['basic', 'pro', 'premium'];

export const PLANS: Record<PaidPlanId, PlanDef> = {
  basic: {
    id: 'basic',
    productId: 'com.absitech.buildingapp.plan.basic.monthly',
    priceMonthly: 29.99,
    limits: { maxUnits: 8, maxUsers: null, maxStories: 4, maxDependentsPerUnit: 0 },
    modules: ['module.payments', 'module.expenses', 'module.maintenance', 'module.documents'],
  },
  pro: {
    id: 'pro',
    productId: 'com.absitech.buildingapp.plan.pro.monthly',
    priceMonthly: 59.99,
    limits: { maxUnits: 14, maxUsers: null, maxStories: 7, maxDependentsPerUnit: 1 },
    modules: [
      'module.payments',
      'module.expenses',
      'module.maintenance',
      'module.documents',
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
