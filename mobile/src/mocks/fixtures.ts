import type { Role } from '../auth/AuthContext';

export type PaymentType = 'rent' | 'building_dues' | 'utilities' | 'special_assessment';

export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'waived' | 'partially_paid';

export interface MockPayment {
  _id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  dueDate: string;
  type: PaymentType;
  unitId: string;
  paidDate?: string;
  // Sum of partial receipts so far. Equal to `amount` when fully paid.
  paidAmount?: number;
  // Direction perspective for the viewer:
  //  - admin sees building_dues / special_assessment (owners → building).
  //  - owner sees rent (renter → owner, incoming) and building_dues (owner → building, outgoing).
  //  - renter sees rent (renter → owner, outgoing).
  payer?: 'owner' | 'renter';
  payee?: 'owner' | 'building';
}

export interface MockPoll {
  _id: string;
  title: string;
  description: string;
  status: 'draft' | 'open' | 'closed';
  closesAt: string;
  totalVotes: number;
  yesVotes: number;
  noVotes: number;
  hasVoted: boolean;
}

export interface MockExpense {
  _id: string;
  category: 'maintenance' | 'utilities' | 'cleaning' | 'security' | 'landscaping' | 'insurance';
  amount: number;
  description: string;
  date: string;
  vendor: string;
}

export type TicketStatus =
  | 'submitted'
  | 'rejected'
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export interface MockTicket {
  _id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  unit: string; // 'Common' = public/building, otherwise unit number
  category: 'plumbing' | 'electrical' | 'hvac' | 'general';
  scope: 'unit' | 'common';
  reporterEmail: string;
  rejectionReason?: string;
}

export interface MockDocument {
  _id: string;
  name: string;
  type: 'pdf' | 'image' | 'spreadsheet' | 'doc';
  size: string;
  uploadedAt: string;
  uploadedBy: string;
  category: 'lease' | 'minutes' | 'bylaws' | 'invoice' | 'notice';
}

export interface MockUnit {
  _id: string;
  number: string;
  floor: number;
  bedrooms: number;
  // Admin doesn't manage unit-level maintenance — that's between renter/owner.
  // The only states admin cares about are: occupied, vacant, or still being built.
  occupancyStatus: 'occupied' | 'vacant' | 'under_construction';
  ownerName?: string;
  // null/undefined ⇒ inherit building-wide settings.defaultMonthlyDues
  monthlyDue: number | null;
  // null/undefined ⇒ inherit building-wide settings.monthlyDuesDay
  duesDayOverride?: number | null;
}

export function effectiveMonthlyDue(unit: MockUnit, buildingDefault: number): number {
  return unit.monthlyDue ?? buildingDefault;
}

export function paymentOwed(p: MockPayment): number {
  if (p.status === 'paid' || p.status === 'waived') return 0;
  return Math.max(0, p.amount - (p.paidAmount ?? 0));
}

export function isPaymentOpen(p: MockPayment): boolean {
  return p.status === 'pending' || p.status === 'overdue' || p.status === 'partially_paid';
}

// Admin handles building-side flow only. Rent (renter→owner) is between
// the renter and owner and never appears in an admin's view.
export function filterPaymentsForAdmin(payments: MockPayment[]): MockPayment[] {
  return payments.filter((p) => p.payee === 'building');
}

export interface MockUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  unit?: string;
  status: 'active' | 'invited' | 'suspended';
  /** Owner-only flag: when true, this owner sees the "View as admin" chip
   * and gets the building-management overlay capabilities. Server side this
   * is enforced as at-most-one per building. */
  isBuildingAdmin?: boolean;
}

const today = new Date();
const dayMs = 86_400_000;
function dateOffset(days: number): string {
  return new Date(today.getTime() + days * dayMs).toISOString();
}

// One canonical list of payment records. We filter per role below so each
// persona sees only the payments relevant to them.
export const ALL_PAYMENTS: MockPayment[] = [
  // Building dues — owners owe the building (admin manages these).
  { _id: 'bd1', amount: 1200, status: 'paid',    dueDate: dateOffset(-12), paidDate: dateOffset(-10), type: 'building_dues', unitId: '12A', payer: 'owner', payee: 'building' },
  { _id: 'bd2', amount: 1450, status: 'paid',    dueDate: dateOffset(-10), paidDate: dateOffset(-8),  type: 'building_dues', unitId: '8B',  payer: 'owner', payee: 'building' },
  { _id: 'bd3', amount: 320,  status: 'pending', dueDate: dateOffset(3),                                type: 'building_dues', unitId: '5C',  payer: 'owner', payee: 'building' },
  { _id: 'bd4', amount: 980,  status: 'overdue', dueDate: dateOffset(-5),                               type: 'building_dues', unitId: '3A',  payer: 'owner', payee: 'building' },
  { _id: 'bd5', amount: 1100, status: 'pending', dueDate: dateOffset(7),                                type: 'building_dues', unitId: '7D',  payer: 'owner', payee: 'building' },
  { _id: 'bd6', amount: 1200, status: 'overdue', dueDate: dateOffset(-9),                               type: 'building_dues', unitId: '2B',  payer: 'owner', payee: 'building' },
  { _id: 'sa1', amount: 350,  status: 'pending', dueDate: dateOffset(14),                               type: 'special_assessment', unitId: '8B', payer: 'owner', payee: 'building' },

  // Rent — renter → owner.
  { _id: 'r1', amount: 1200, status: 'paid',    dueDate: dateOffset(-8),  paidDate: dateOffset(-7), type: 'rent', unitId: '12A', payer: 'renter', payee: 'owner' },
  { _id: 'r2', amount: 1200, status: 'overdue', dueDate: dateOffset(-3),                              type: 'rent', unitId: '12A', payer: 'renter', payee: 'owner' },
  { _id: 'r3', amount: 1200, status: 'pending', dueDate: dateOffset(25),                              type: 'rent', unitId: '12A', payer: 'renter', payee: 'owner' },

  // Utilities — visible to whoever pays them. Treat as building-billed for both unit residents.
  { _id: 'u1', amount: 180,  status: 'paid',    dueDate: dateOffset(-22), paidDate: dateOffset(-20), type: 'utilities', unitId: '8B',  payer: 'owner',  payee: 'building' },
  { _id: 'u2', amount: 140,  status: 'paid',    dueDate: dateOffset(-32), paidDate: dateOffset(-30), type: 'utilities', unitId: '12A', payer: 'renter', payee: 'building' },
].map((p) => ({ ...p, currency: 'ILS' })) as MockPayment[];

export function filterPaymentsByRole(payments: MockPayment[], role: Role): MockPayment[] {
  switch (role) {
    case 'admin':
      return payments.filter((p) => p.payee === 'building');
    case 'owner':
      return payments.filter(
        (p) =>
          (p.type === 'rent' && p.payee === 'owner') ||
          ((p.type === 'building_dues' || p.type === 'utilities' || p.type === 'special_assessment') &&
            p.payer === 'owner' &&
            p.unitId === '8B')
      );
    case 'renter':
      return payments.filter((p) => p.payer === 'renter');
    case 'dependent':
      return [];
  }
}

// Back-compat: kept for any caller that still reads the raw fixture array.
export function paymentsFor(role: Role): MockPayment[] {
  return filterPaymentsByRole(ALL_PAYMENTS, role);
}

// --------- Monthly trend (6 months) ---------
export interface MonthlyPoint {
  label: string;
  value: number;
}

export function paymentsTrendFor(role: Role): MonthlyPoint[] {
  const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const seed: Record<Role, number[]> = {
    admin: [8200, 9100, 8700, 9400, 10200, 9800],
    owner: [1670, 1670, 1670, 1670, 1670, 1670],
    renter: [1200, 1200, 1200, 1200, 1200, 1200],
    dependent: [0, 0, 0, 0, 0, 0],
  };
  return months.map((label, i) => ({ label, value: seed[role][i] }));
}

// --------- Polls (everyone sees the same set; voting gated by capability) ---------
export const initialPolls: MockPoll[] = [
  {
    _id: 'pl1',
    title: 'Approve rooftop garden renovation',
    description: 'Annual cost: 8,400 split across all units. Adds shared lounge + planters.',
    status: 'open',
    closesAt: dateOffset(4),
    totalVotes: 14,
    yesVotes: 10,
    noVotes: 4,
    hasVoted: false,
  },
  {
    _id: 'pl2',
    title: 'New cleaning vendor',
    description: 'Switch to BrightHome Co. — 15% lower monthly cost than current vendor.',
    status: 'open',
    closesAt: dateOffset(9),
    totalVotes: 8,
    yesVotes: 5,
    noVotes: 3,
    hasVoted: true,
  },
  {
    _id: 'pl3',
    title: 'Quiet hours extension to 11pm',
    description: 'Change quiet hours window from 10pm–7am to 11pm–7am on weekends.',
    status: 'closed',
    closesAt: dateOffset(-3),
    totalVotes: 22,
    yesVotes: 13,
    noVotes: 9,
    hasVoted: true,
  },
];

export function pollsFor(_role: Role): MockPoll[] {
  return initialPolls;
}

// --------- Expenses (admin sees full list; others see a teaser) ---------
const adminExpenses: MockExpense[] = [
  { _id: 'e1', category: 'utilities', amount: 1840, description: 'Building electricity – April', date: dateOffset(-12), vendor: 'CityPower' },
  { _id: 'e2', category: 'cleaning', amount: 920, description: 'Common areas weekly', date: dateOffset(-8), vendor: 'BrightHome Co.' },
  { _id: 'e3', category: 'maintenance', amount: 540, description: 'Elevator service', date: dateOffset(-15), vendor: 'OtisCare' },
  { _id: 'e4', category: 'security', amount: 1200, description: 'Front gate camera replacement', date: dateOffset(-20), vendor: 'SecureCam' },
  { _id: 'e5', category: 'landscaping', amount: 380, description: 'Garden trimming', date: dateOffset(-22), vendor: 'GreenScape' },
  { _id: 'e6', category: 'insurance', amount: 2200, description: 'Q2 property insurance', date: dateOffset(-29), vendor: 'GuardianIns' },
];

export function expensesFor(role: Role): MockExpense[] {
  return role === 'admin' ? adminExpenses : adminExpenses.slice(0, 3);
}

export function expensesTrend(): MonthlyPoint[] {
  return [
    { label: 'Dec', value: 6200 },
    { label: 'Jan', value: 5800 },
    { label: 'Feb', value: 7100 },
    { label: 'Mar', value: 6400 },
    { label: 'Apr', value: 6900 },
    { label: 'May', value: 7080 },
  ];
}

// --------- Tickets ---------
//  scope='common' → public/building facility, admin resolves.
//  scope='unit'   → unit-internal, the unit's owner resolves.
// Every ticket starts as 'submitted' and only moves out of that state once an
// admin approves it. We seed a mix below so the demo has stuff to triage.
export const initialTickets: MockTicket[] = [
  { _id: 't1', title: 'Kitchen sink leaking',  description: 'Slow drip under the sink, sealing has failed.', status: 'open',         priority: 'high',   createdAt: dateOffset(-1),  unit: '12A',    category: 'plumbing',   scope: 'unit',   reporterEmail: 'renter@example.com' },
  { _id: 't2', title: 'Hallway light flickering', description: '3rd floor west hallway, intermittent.',     status: 'in_progress',  priority: 'medium', createdAt: dateOffset(-3),  unit: 'Common', category: 'electrical', scope: 'common', reporterEmail: 'owner@example.com' },
  { _id: 't3', title: 'AC not cooling',        description: 'Unit 8B AC blowing warm air.',                 status: 'open',         priority: 'high',   createdAt: dateOffset(-2),  unit: '8B',     category: 'hvac',       scope: 'unit',   reporterEmail: 'dependent@example.com' },
  { _id: 't4', title: 'Broken intercom',       description: 'Lobby intercom does not connect to 5C.',       status: 'resolved',     priority: 'low',    createdAt: dateOffset(-12), unit: 'Common', category: 'electrical', scope: 'common', reporterEmail: 'admin@example.com' },
  { _id: 't5', title: 'Garage door delay',     description: 'Takes 8s to close after press.',               status: 'open',         priority: 'low',    createdAt: dateOffset(-6),  unit: 'Common', category: 'general',    scope: 'common', reporterEmail: 'owner@example.com' },
  { _id: 't6', title: 'Bedroom outlet dead',   description: 'No power to the master bedroom outlet.',       status: 'open',         priority: 'medium', createdAt: dateOffset(-4),  unit: '8B',     category: 'electrical', scope: 'unit',   reporterEmail: 'renter@example.com' },
  // Awaiting admin moderation:
  { _id: 't7', title: 'Loud pipe noise at night', description: 'Loud knocking sound from pipes around 11pm.', status: 'submitted',   priority: 'medium', createdAt: dateOffset(0),   unit: '8B',     category: 'plumbing',   scope: 'unit',   reporterEmail: 'renter@example.com' },
  { _id: 't8', title: 'Lobby door not locking',   description: 'Front lobby door does not auto-lock.',        status: 'submitted',   priority: 'high',   createdAt: dateOffset(0),   unit: 'Common', category: 'general',    scope: 'common', reporterEmail: 'owner@example.com' },
];

export function ticketsFor(role: Role): MockTicket[] {
  if (role === 'admin') return initialTickets.filter((t) => t.scope === 'common');
  if (role === 'owner' || role === 'renter') return initialTickets.filter((t) => t.unit === '8B' || t.unit === '12A');
  return initialTickets.filter((t) => t.scope === 'common');
}

// --------- Documents ---------
const docs: MockDocument[] = [
  { _id: 'd1', name: 'Building bylaws v3.pdf', type: 'pdf', size: '420 KB', uploadedAt: dateOffset(-60), uploadedBy: 'Admin', category: 'bylaws' },
  { _id: 'd2', name: 'April board minutes.pdf', type: 'pdf', size: '180 KB', uploadedAt: dateOffset(-14), uploadedBy: 'Admin', category: 'minutes' },
  { _id: 'd3', name: 'Lease – Unit 12A.pdf', type: 'pdf', size: '310 KB', uploadedAt: dateOffset(-200), uploadedBy: 'Owner 12A', category: 'lease' },
  { _id: 'd4', name: 'Quiet hours notice.pdf', type: 'pdf', size: '90 KB', uploadedAt: dateOffset(-21), uploadedBy: 'Admin', category: 'notice' },
  { _id: 'd5', name: 'Q1 financials.xlsx', type: 'spreadsheet', size: '52 KB', uploadedAt: dateOffset(-45), uploadedBy: 'Admin', category: 'invoice' },
  { _id: 'd6', name: 'Roof photos.jpg', type: 'image', size: '1.2 MB', uploadedAt: dateOffset(-3), uploadedBy: 'Maintenance', category: 'notice' },
];

export function documentsFor(role: Role): MockDocument[] {
  if (role === 'admin') return docs;
  if (role === 'owner' || role === 'renter') return docs.filter((d) => d.category !== 'invoice');
  return docs.filter((d) => d.category === 'notice' || d.category === 'minutes');
}

// --------- Units ---------
export const units: MockUnit[] = [
  { _id: 'u1', number: '12A', floor: 12, bedrooms: 2, occupancyStatus: 'occupied', ownerName: 'Jordan Lee', monthlyDue: 1200 },
  { _id: 'u2', number: '8B', floor: 8, bedrooms: 3, occupancyStatus: 'occupied', ownerName: 'Pat Kim', monthlyDue: 1450 },
  { _id: 'u3', number: '5C', floor: 5, bedrooms: 1, occupancyStatus: 'occupied', ownerName: 'Sam Ortiz', monthlyDue: 920 },
  { _id: 'u4', number: '3A', floor: 3, bedrooms: 2, occupancyStatus: 'occupied', ownerName: 'Riley Chen', monthlyDue: 1180 },
  { _id: 'u5', number: '7D', floor: 7, bedrooms: 2, occupancyStatus: 'vacant', monthlyDue: 1100 },
  { _id: 'u6', number: '2B', floor: 2, bedrooms: 1, occupancyStatus: 'under_construction', monthlyDue: 900 },
];

// --------- Per-unit helpers ---------
export function usersForUnit(unitNumber: string): MockUser[] {
  return usersList.filter((u) => u.unit === unitNumber);
}

export function paymentsForUnit(unitNumber: string): MockPayment[] {
  return ALL_PAYMENTS.filter((p) => p.unitId === unitNumber);
}

// Synthesize a 6-month payment history for the unit. Used by the admin's
// unit-detail chart so each unit has its own per-month dues record even
// though our seed fixtures only carry 1–2 rows per unit.
export interface UnitMonthlyPoint {
  label: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
}

export function unitDuesHistory(unitNumber: string, buildingDefault = 1000): UnitMonthlyPoint[] {
  const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const unit = units.find((u) => u.number === unitNumber);
  const due = unit?.monthlyDue ?? buildingDefault;
  // Deterministic pattern per unit so the chart isn't random across renders.
  const seed = unitNumber.charCodeAt(0) + (unitNumber.charCodeAt(1) ?? 0);
  return months.map((label, i) => {
    const slot = (seed + i) % 7;
    const status: UnitMonthlyPoint['status'] =
      i >= 4 && slot < 2 ? 'overdue' : i === 5 && slot < 4 ? 'pending' : 'paid';
    return { label, amount: due, status };
  });
}

// --------- Users ---------
// These four match the seeded demo accounts (auth/login emails) so that
// per-screen logic that does `users.find(u => u.email === currentUser.email)`
// can resolve the active user's unit and role.
export const usersList: MockUser[] = [
  { _id: 'u-1', firstName: 'Admin',    lastName: 'User',  email: 'admin@example.com',     role: 'admin',     status: 'active' },
  // Pat is the building admin — owner role + isBuildingAdmin flag. They see
  // the resident UX by default and toggle to admin view via the header chip.
  { _id: 'u-2', firstName: 'Pat',      lastName: 'Kim',   email: 'owner@example.com',     role: 'owner',     unit: '8B',  status: 'active', isBuildingAdmin: true },
  { _id: 'u-3', firstName: 'Jordan',   lastName: 'Lee',   email: 'renter@example.com',    role: 'renter',    unit: '12A', status: 'active' },
  { _id: 'u-4', firstName: 'Taylor',   lastName: 'Brown', email: 'dependent@example.com', role: 'dependent', unit: '8B',  status: 'invited' },
  // A few extra non-demo accounts so the admin's Users screen feels populated.
  { _id: 'u-5', firstName: 'Sam',      lastName: 'Ortiz', email: 'sam@example.com',     role: 'renter', unit: '5C', status: 'active' },
  { _id: 'u-6', firstName: 'Riley',    lastName: 'Chen',  email: 'riley@example.com',   role: 'owner',  unit: '3A', status: 'active' },
  { _id: 'u-7', firstName: 'Casey',    lastName: 'Rivera', email: 'casey@example.com',  role: 'owner',  unit: '2B', status: 'suspended' },
];

// --------- Currency helpers (currency is now passed in from building context) ---------
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ILS: '₪',
  JOD: 'JD ',
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

export function fmtMoney(amount: number, currency = 'ILS'): string {
  const sym = currencySymbol(currency);
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtMoneyCompact(amount: number, currency = 'ILS'): string {
  const sym = currencySymbol(currency);
  if (amount >= 1000) return `${sym}${(amount / 1000).toFixed(1)}k`;
  return `${sym}${amount.toFixed(0)}`;
}

export function relativeDay(iso: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / dayMs);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 0) return `in ${diff}d`;
  return `${Math.abs(diff)}d ago`;
}
