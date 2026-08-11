// Capability ids used by both server and mobile client. When the UI asks
// "should I render widget X?", it checks whether X is in the user's
// `capabilities.widgets` array returned by the API. Same for modules and
// actions. Keep this list in sync with the mobile UI's gating checks.

export type Role = 'admin' | 'owner' | 'renter' | 'dependent' | 'independent';

export type Capabilities = {
  widgets: string[];
  modules: string[];
  actions: string[];
};

// Widget ids — units of UI shown on the Dashboard.
export const WIDGETS = {
  STAT_BALANCE: 'dashboard.stat.balance',
  STAT_NEXT_DUE: 'dashboard.stat.next_due',
  STAT_OPEN_POLLS: 'dashboard.stat.open_polls',
  STAT_MTD_COLLECTED: 'dashboard.stat.mtd_collected',
  STAT_OUTSTANDING: 'dashboard.stat.outstanding',
  STAT_ACTIVE_UNITS: 'dashboard.stat.active_units',
  STAT_OPEN_TICKETS: 'dashboard.stat.open_tickets',
  STAT_YOUR_UNIT: 'dashboard.stat.your_unit',

  CHART_COLLECTIONS: 'dashboard.chart.collections',
  CHART_PAYMENTS_BY_CATEGORY: 'dashboard.chart.payments_by_category',
  CHART_PAYMENT_HISTORY: 'dashboard.chart.payment_history',
  CHART_POLLS: 'dashboard.chart.polls',

  SECTION_NEEDS_ATTENTION: 'dashboard.section.needs_attention',
  SECTION_RECENT_ACTIVITY: 'dashboard.section.recent_activity',
  SECTION_PAYMENT_SUMMARY: 'dashboard.section.payment_summary',
  SECTION_OPEN_POLLS: 'dashboard.section.open_polls',
} as const;

// Module ids — top-level navigation entries.
export const MODULES = {
  PAYMENTS: 'module.payments',
  EXPENSES: 'module.expenses',
  POLLS: 'module.polls',
  MAINTENANCE: 'module.maintenance',
  DOCUMENTS: 'module.documents',
  UNITS: 'module.units',
  USERS: 'module.users',
  HOUSEHOLD: 'module.household',
  // System-level buildings list (CRUD), only visible to role='admin'.
  SYSTEM_BUILDINGS: 'module.system.buildings',
  // System-admin's cross-building user roster.
  SYSTEM_USERS: 'module.system.users',
  // System-admin feature pricing config + cross-building subscription
  // payments. Two separate tabs in the admin UI but a single capability
  // — they go hand-in-hand and are always visible together.
  SYSTEM_PRICING: 'module.system.pricing',
  SYSTEM_PAYMENTS: 'module.system.payments',
} as const;

// Action ids — discrete things a user can trigger.
export const ACTIONS = {
  PAYMENT_CREATE: 'action.payment.create',
  PAYMENT_MARK_PAID: 'action.payment.mark_paid',
  PAYMENT_RECORD: 'action.payment.record',
  POLL_CREATE: 'action.poll.create',
  POLL_VOTE: 'action.poll.vote',
  TICKET_CREATE: 'action.ticket.create',
  TICKET_APPROVE: 'action.ticket.approve',
  TICKET_RESOLVE: 'action.ticket.resolve',
  USER_INVITE: 'action.user.invite',
  EXPENSE_CREATE: 'action.expense.create',
  DOCUMENT_UPLOAD: 'action.document.upload',
  BUILDING_SETTINGS: 'action.building.settings',
  UNIT_CREATE: 'action.unit.create',
  UNIT_UPDATE: 'action.unit.update',
  USER_MANAGE: 'action.user.manage', // activate/deactivate
  USER_PROMOTE: 'action.user.promote', // change role (e.g. owner → admin)
  // Owner-scoped roster powers: manage the renters/dependents living in
  // units the caller OWNS (create, edit name/phone, reset creds, suspend).
  // Server routes narrow every mutation to the caller's own units.
  TENANT_MANAGE: 'action.user.manage_tenants',
  // Owner-scoped rent: set a unit's monthly rent, create rent charges and
  // mark them paid — only on units the caller owns.
  RENT_MANAGE: 'action.rent.manage',
  // System-admin only: full CRUD over the Buildings collection.
  BUILDING_CRUD: 'action.building.crud',
  // System-admin (or existing building admin): toggle an owner's
  // isBuildingAdmin flag for a building.
  BUILDING_ADMIN_ASSIGN: 'action.building.admin_assign',
} as const;

const RESIDENT_WIDGETS = [
  WIDGETS.STAT_BALANCE,
  WIDGETS.STAT_NEXT_DUE,
  WIDGETS.STAT_OPEN_POLLS,
  WIDGETS.SECTION_PAYMENT_SUMMARY,
];

const RESIDENT_MODULES = [
  MODULES.PAYMENTS,
  MODULES.EXPENSES,
  MODULES.POLLS,
  MODULES.MAINTENANCE,
  MODULES.DOCUMENTS,
];

// System admin (role==='admin') — operates above any single building. Manages
// the Buildings collection and appoints building admins. Doesn't show up on
// the resident dashboard; their entry point is the Buildings list page.
const SYSTEM_ADMIN_CAPS: Capabilities = {
  widgets: [],
  modules: [
    MODULES.SYSTEM_BUILDINGS,
    MODULES.SYSTEM_USERS,
    MODULES.SYSTEM_PRICING,
    MODULES.SYSTEM_PAYMENTS,
  ],
  actions: [
    ACTIONS.BUILDING_CRUD,
    ACTIONS.BUILDING_ADMIN_ASSIGN,
    ACTIONS.USER_MANAGE,
    ACTIONS.USER_PROMOTE,
  ],
};

// Building admin (an owner with `isBuildingAdmin=true` viewing in admin
// mode) — manages the day-to-day of a specific building. Same surface as
// the resident-facing pages plus units/users admin tooling.
const BUILDING_ADMIN_CAPS: Capabilities = {
  widgets: [
    WIDGETS.STAT_MTD_COLLECTED,
    WIDGETS.STAT_OUTSTANDING,
    WIDGETS.STAT_ACTIVE_UNITS,
    WIDGETS.STAT_OPEN_TICKETS,
    WIDGETS.CHART_COLLECTIONS,
    WIDGETS.SECTION_NEEDS_ATTENTION,
    WIDGETS.SECTION_RECENT_ACTIVITY,
  ],
  modules: [
    MODULES.PAYMENTS,
    MODULES.EXPENSES,
    MODULES.POLLS,
    MODULES.MAINTENANCE,
    MODULES.DOCUMENTS,
    MODULES.UNITS,
    MODULES.USERS,
  ],
  actions: [
    ACTIONS.PAYMENT_CREATE,
    ACTIONS.PAYMENT_MARK_PAID,
    ACTIONS.POLL_CREATE,
    ACTIONS.TICKET_CREATE,
    ACTIONS.TICKET_APPROVE,
    ACTIONS.TICKET_RESOLVE,
    ACTIONS.USER_INVITE,
    ACTIONS.EXPENSE_CREATE,
    ACTIONS.DOCUMENT_UPLOAD,
    ACTIONS.BUILDING_SETTINGS,
    ACTIONS.UNIT_CREATE,
    ACTIONS.UNIT_UPDATE,
    ACTIONS.USER_MANAGE,
    ACTIONS.BUILDING_ADMIN_ASSIGN,
  ],
};

const OWNER_CAPS: Capabilities = {
  widgets: [
    ...RESIDENT_WIDGETS,
    WIDGETS.CHART_PAYMENTS_BY_CATEGORY,
  ],
  // Owners get the Units + Users surfaces scoped to THEIR OWN units: the
  // server only returns units they hold and the renters/dependents living
  // in units they own.
  modules: [...RESIDENT_MODULES, MODULES.UNITS, MODULES.USERS],
  // No PAYMENT_RECORD: recording/creating building payments is exclusively a
  // building-admin action — plain owners only view their payment state.
  // RENT_MANAGE is the exception: rent on their own units is the owner's
  // business (set the amount, create charges, mark them paid).
  actions: [
    ACTIONS.POLL_VOTE,
    ACTIONS.TICKET_CREATE,
    ACTIONS.TICKET_RESOLVE, // owners fix tickets that belong to their unit
    ACTIONS.DOCUMENT_UPLOAD,
    ACTIONS.USER_INVITE, // owners can invite renters/dependents into their unit
    ACTIONS.TENANT_MANAGE,
    ACTIONS.RENT_MANAGE,
  ],
};

const RENTER_CAPS: Capabilities = {
  widgets: [
    ...RESIDENT_WIDGETS,
    WIDGETS.CHART_PAYMENT_HISTORY,
  ],
  // Renters get the Household surface so they can manage dependents
  // (rule 7). Other roles don't need it: owners use UnitDetail, admins
  // use the Users page.
  modules: [...RESIDENT_MODULES, MODULES.HOUSEHOLD],
  // Renters can't act on payment records — their rent is settled with the
  // owner offline and the owner records the receipt on their side.
  // USER_INVITE is granted so a renter can invite dependents into their own
  // unit (rule 7); POST /invites further restricts the renter to dependent
  // role and their own unit, capped by the admin-set maxDependents.
  actions: [
    ACTIONS.POLL_VOTE,
    ACTIONS.TICKET_CREATE,
    ACTIONS.USER_INVITE,
  ],
};

const DEPENDENT_CAPS: Capabilities = {
  widgets: [
    WIDGETS.STAT_OPEN_POLLS,
    WIDGETS.STAT_YOUR_UNIT,
    WIDGETS.CHART_POLLS,
    WIDGETS.SECTION_OPEN_POLLS,
  ],
  modules: [
    MODULES.POLLS,
    MODULES.DOCUMENTS,
    MODULES.MAINTENANCE,
  ],
  // Dependents can see polls + results but cannot vote. They can however
  // report tickets on behalf of their unit (or for common areas).
  actions: [ACTIONS.TICKET_CREATE],
};

// Building staff with no apartment (guard, cleaner, etc.). Minimal surface:
// notices/documents and maintenance reporting; primary use is the building
// access controls (door/gate) which are governed by building settings, not caps.
const INDEPENDENT_CAPS: Capabilities = {
  widgets: [],
  modules: [MODULES.DOCUMENTS, MODULES.MAINTENANCE],
  actions: [ACTIONS.TICKET_CREATE],
};

const ROLE_MAP: Record<Role, Capabilities> = {
  admin: SYSTEM_ADMIN_CAPS,
  owner: OWNER_CAPS,
  renter: RENTER_CAPS,
  dependent: DEPENDENT_CAPS,
  independent: INDEPENDENT_CAPS,
};

export function getCapabilitiesFor(role: Role): Capabilities {
  return ROLE_MAP[role] ?? { widgets: [], modules: [], actions: [] };
}

/**
 * Capability set granted when a building-admin owner toggles into admin view.
 * Exposed separately from `capabilities` so the mobile client can swap based
 * on the user's current view mode without re-authenticating.
 */
export function getBuildingAdminCapabilities(): Capabilities {
  return BUILDING_ADMIN_CAPS;
}

import { Building } from '../models/Building.js';
import { Unit } from '../models/Unit.js';
import { primaryMembership, membershipsForBuilding, type UserDoc } from '../models/User.js';
import { planModulesFor, trialDaysLeft } from './plans.service.js';

/**
 * Build the /me + login payload for a user, scoped to ONE active membership
 * (or the system-admin context). Includes a `memberships` summary of every
 * building the user belongs to so the client can offer a building switcher.
 */
export async function toUserPayload(
  user: UserDoc,
  activeBuildingId?: string | null,
): Promise<Record<string, unknown>> {
  const isAdmin = user.systemRole === 'admin';
  const activeBid = activeBuildingId ?? user.memberships[0]?.buildingId ?? null;
  const active = isAdmin ? null : primaryMembership(user, activeBid) ?? null;
  const role: Role = isAdmin ? 'admin' : ((active?.role as Role) ?? 'independent');
  const isBuildingAdmin = !isAdmin && !!active?.isBuildingAdmin;

  // Units for the active building = the union across all the user's roles in
  // that building (they might be owner of one unit and tenant of another).
  const activeUnitIds = active
    ? membershipsForBuilding(user, activeBid).flatMap((m) => m.unitIds)
    : [];

  // Hydrate the active building + its units, and every building the user
  // belongs to (for the switcher), in parallel.
  const allBuildingIds = user.memberships.map((m) => m.buildingId);
  const [building, activeUnits, allBuildings] = await Promise.all([
    active ? Building.findById(active.buildingId).lean() : Promise.resolve(null),
    activeUnitIds.length ? Unit.find({ _id: { $in: activeUnitIds } }).lean() : Promise.resolve([]),
    allBuildingIds.length ? Building.find({ _id: { $in: allBuildingIds } }).lean() : Promise.resolve([]),
  ]);
  const buildingName = new Map(allBuildings.map((b) => [String(b._id), b.name]));

  // Two independent module restrictions can apply: the system-admin-set
  // allow-list on the building, and the building's subscription plan tier.
  // The effective set is the intersection of whichever are present.
  const buildingEnabled: string[] | null =
    !isAdmin && Array.isArray((building as { enabledModules?: string[] } | null)?.enabledModules)
      ? ((building as { enabledModules?: string[] }).enabledModules ?? null)
      : null;
  const planEnabled: string[] | null = !isAdmin && building ? planModulesFor(building) : null;
  const filterCaps = (c: Capabilities): Capabilities => {
    let modules = c.modules;
    if (buildingEnabled) modules = modules.filter((m) => buildingEnabled.includes(m));
    if (planEnabled) modules = modules.filter((m) => planEnabled.includes(m));
    return modules === c.modules ? c : { ...c, modules };
  };

  const memberships = user.memberships.map((m) => ({
    buildingId: String(m.buildingId),
    buildingName: buildingName.get(String(m.buildingId)) ?? '',
    role: m.role,
    isBuildingAdmin: !!m.isBuildingAdmin,
    unitIds: (m.unitIds ?? []).map((u) => String(u)),
  }));

  const firstUnit = activeUnits[0];

  return {
    ...user.toJSON(),
    // Compat fields the client reads for the ACTIVE building context.
    role,
    buildingId: active ? String(active.buildingId) : null,
    isBuildingAdmin,
    activeBuildingId: active ? String(active.buildingId) : null,
    memberships,
    capabilities: filterCaps(getCapabilitiesFor(role)),
    adminCapabilities: isBuildingAdmin ? filterCaps(getBuildingAdminCapabilities()) : null,
    building: building
      ? {
          _id: String(building._id),
          name: building.name,
          currency: building.currency,
          status: (building as { status?: string }).status ?? 'active',
          stories: (building as { stories?: number }).stories ?? 1,
          enabledModules: (building as { enabledModules?: string[] }).enabledModules ?? null,
          settings: building.settings,
          subscription: (() => {
            const sub = (building as {
              subscription?: {
                plan?: string;
                status?: string;
                trialEndsAt?: Date | null;
                currentPeriodEnd?: Date | null;
              };
            }).subscription;
            if (!sub) return null;
            return {
              plan: sub.plan ?? null,
              status: sub.status ?? 'none',
              trialEndsAt: sub.trialEndsAt ?? null,
              currentPeriodEnd: sub.currentPeriodEnd ?? null,
              trialDaysLeft: trialDaysLeft(building),
            };
          })(),
        }
      : null,
    unit: firstUnit
      ? {
          _id: String(firstUnit._id),
          number: firstUnit.number,
          floor: firstUnit.floor,
          monthlyDuesAmount: firstUnit.monthlyDuesAmount,
        }
      : null,
    units: activeUnits.map((u) => ({
      _id: String(u._id),
      number: u.number,
      floor: u.floor,
      monthlyDuesAmount: u.monthlyDuesAmount,
    })),
  };
}
