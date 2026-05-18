// Capability ids used by both server and mobile client. When the UI asks
// "should I render widget X?", it checks whether X is in the user's
// `capabilities.widgets` array returned by the API. Same for modules and
// actions. Keep this list in sync with the mobile UI's gating checks.

export type Role = 'admin' | 'owner' | 'renter' | 'dependent';

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
  modules: RESIDENT_MODULES,
  actions: [
    ACTIONS.PAYMENT_RECORD,
    ACTIONS.POLL_VOTE,
    ACTIONS.TICKET_CREATE,
    ACTIONS.TICKET_RESOLVE, // owners fix tickets that belong to their unit
    ACTIONS.DOCUMENT_UPLOAD,
    ACTIONS.USER_INVITE, // owners can invite renters/dependents into their unit
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

const ROLE_MAP: Record<Role, Capabilities> = {
  admin: SYSTEM_ADMIN_CAPS,
  owner: OWNER_CAPS,
  renter: RENTER_CAPS,
  dependent: DEPENDENT_CAPS,
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
import type { Types } from 'mongoose';

interface UserLike {
  role: Role;
  buildingId?: Types.ObjectId | null;
  unitId?: Types.ObjectId | null;
  isBuildingAdmin?: boolean;
  toJSON(): Record<string, unknown>;
}

export async function toUserPayload(user: UserLike): Promise<Record<string, unknown>> {
  // System admins are building-agnostic — no home building or unit on their
  // payload. For other roles we hydrate both lookups in parallel.
  const [building, unit] = await Promise.all([
    user.buildingId ? Building.findById(user.buildingId).lean() : Promise.resolve(null),
    user.unitId ? Unit.findById(user.unitId).lean() : Promise.resolve(null),
  ]);
  const isBuildingAdminOwner = user.role === 'owner' && !!user.isBuildingAdmin;

  // System-admin-controlled allow-list. Undefined = no restriction. Applied
  // to non-admin users only; admin's own modules (SYSTEM_BUILDINGS) sit
  // outside any building's list.
  const buildingEnabled: string[] | null =
    user.role !== 'admin' && Array.isArray((building as { enabledModules?: string[] } | null)?.enabledModules)
      ? ((building as { enabledModules?: string[] }).enabledModules ?? null)
      : null;
  const filterCaps = (c: Capabilities): Capabilities =>
    buildingEnabled
      ? { ...c, modules: c.modules.filter((m) => buildingEnabled.includes(m)) }
      : c;

  return {
    ...user.toJSON(),
    capabilities: filterCaps(getCapabilitiesFor(user.role)),
    // Owners flagged as building admin get a second cap set; the mobile UI
    // swaps to this when the user toggles "admin view". Anyone else: null.
    adminCapabilities: isBuildingAdminOwner ? filterCaps(getBuildingAdminCapabilities()) : null,
    building: building
      ? {
          _id: String(building._id),
          name: building.name,
          currency: building.currency,
          status: (building as { status?: string }).status ?? 'active',
          enabledModules: (building as { enabledModules?: string[] }).enabledModules ?? null,
          settings: building.settings,
        }
      : null,
    unit: unit
      ? {
          _id: String(unit._id),
          number: unit.number,
          floor: unit.floor,
          monthlyDuesAmount: unit.monthlyDuesAmount,
        }
      : null,
  };
}
