// Types shared between client and server.
// Keep this file dependency-free.

// 'independent' = a building-scoped user with no apartment (guard, staff, etc.).
export type Role = 'admin' | 'owner' | 'renter' | 'dependent' | 'independent';

// System-level role. 'admin' is the application super-admin (no buildings);
// 'member' is any normal user, whose per-building roles live in `memberships`.
export type SystemRole = 'admin' | 'member';

// Building-scoped roles a membership can carry (never the system super-admin).
export type BuildingRole = 'owner' | 'renter' | 'dependent' | 'independent';

// One user ↔ one building relationship. A user can hold many memberships:
// different buildings, and/or several units within a building, with a role
// (and building-admin flag) per building.
export interface Membership {
  buildingId: string;
  role: BuildingRole;
  unitIds: string[];
  isBuildingAdmin: boolean;
  linkedOwnerId?: string | null;
}

export type UserStatus = 'invited' | 'active' | 'suspended';

export type ExpenseCategory =
  | 'maintenance'
  | 'utilities'
  | 'repairs'
  | 'cleaning'
  | 'insurance'
  | 'other';

export type SplitMode = 'equal' | 'by_sqft' | 'none';

export type PaymentType = 'monthly_dues' | 'expense_split' | 'one_off';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'waived';
export type PaymentMethod = 'cash' | 'transfer' | 'stripe' | 'other';

export type PollStatus = 'draft' | 'open' | 'closed';

export type MaintenanceCategory =
  | 'plumbing'
  | 'electrical'
  | 'elevator'
  | 'common_area'
  | 'other';
export type MaintenancePriority = 'low' | 'normal' | 'high' | 'urgent';
export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type DocumentCategory =
  | 'bylaws'
  | 'meeting_minutes'
  | 'notice'
  | 'contract'
  | 'other';
export type DocumentVisibility = 'all' | 'owners_only' | 'admin_only';

export type NotificationType =
  | 'payment_due'
  | 'payment_overdue'
  | 'poll_open'
  | 'announcement'
  | 'maintenance_update';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
