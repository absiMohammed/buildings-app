// Capability ids — mirror of server/src/services/capabilities.service.ts.
// Use these constants in components instead of magic strings.

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

export const MODULES = {
  PAYMENTS: 'module.payments',
  EXPENSES: 'module.expenses',
  POLLS: 'module.polls',
  MAINTENANCE: 'module.maintenance',
  DOCUMENTS: 'module.documents',
  UNITS: 'module.units',
  USERS: 'module.users',
  HOUSEHOLD: 'module.household',
  SYSTEM_BUILDINGS: 'module.system.buildings',
  SYSTEM_USERS: 'module.system.users',
  SYSTEM_PRICING: 'module.system.pricing',
  SYSTEM_PAYMENTS: 'module.system.payments',
} as const;

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
  USER_MANAGE: 'action.user.manage',
  USER_PROMOTE: 'action.user.promote',
  // Owner-scoped: manage renters/dependents living in units the user owns.
  TENANT_MANAGE: 'action.user.manage_tenants',
  // Owner-scoped: set unit rent, create rent charges, mark them paid.
  RENT_MANAGE: 'action.rent.manage',
} as const;

export interface Capabilities {
  widgets: string[];
  modules: string[];
  actions: string[];
}

export const EMPTY_CAPABILITIES: Capabilities = { widgets: [], modules: [], actions: [] };

export function hasWidget(caps: Capabilities | undefined, id: string): boolean {
  return !!caps && caps.widgets.includes(id);
}
export function hasModule(caps: Capabilities | undefined, id: string): boolean {
  return !!caps && caps.modules.includes(id);
}
export function hasAction(caps: Capabilities | undefined, id: string): boolean {
  return !!caps && caps.actions.includes(id);
}
