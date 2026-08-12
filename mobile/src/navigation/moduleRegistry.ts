import { MODULES } from '../auth/capabilities';
import type { IconName } from '../components/Icon';
import type { StringKey } from '../i18n/strings';
import type { MainTabParamList } from './types';

/**
 * Single source of truth for every navigable module: bottom-tab slots, the
 * "More" sheet tiles, and anywhere else that needs the module → icon →
 * label → route → color mapping. Home is not a module — the tab bar pins it.
 */
export interface ModuleEntry {
  /** Capability module id (auth/capabilities MODULES.*). */
  capability: string;
  icon: IconName;
  /** Full name — module tiles (More sheet). */
  labelKey: StringKey;
  /** Short name for the cramped bottom bar; defaults to labelKey. */
  tabLabelKey?: StringKey;
  // A bottom-tab route — navigating to the tab (not a leaf screen) is what
  // makes cross-section navigation work from anywhere.
  route: keyof MainTabParamList;
  tone: ModuleTone;
}

export type ModuleTone = 'accent' | 'positive' | 'warning' | 'danger' | 'neutral';

/** Two-stop gradients that give each module tile's icon chip its energy. */
export const TONE_GRADIENTS: Record<ModuleTone, [string, string]> = {
  accent: ['#818cf8', '#4f46e5'],
  positive: ['#34d399', '#059669'],
  warning: ['#fbbf24', '#d97706'],
  danger: ['#f87171', '#dc2626'],
  neutral: ['#94a3b8', '#475569'],
};

// Order matters: it drives both the bottom-bar slot fill and the More sheet.
export const MODULE_REGISTRY: ModuleEntry[] = [
  { capability: MODULES.PAYMENTS, icon: 'payments', labelKey: 'nav_payments', route: 'PaymentsTab', tone: 'accent' },
  { capability: MODULES.POLLS, icon: 'polls', labelKey: 'nav_polls', route: 'PollsTab', tone: 'positive' },
  { capability: MODULES.DOCUMENTS, icon: 'documents', labelKey: 'nav_documents', tabLabelKey: 'nav_docs', route: 'DocumentsTab', tone: 'neutral' },
  { capability: MODULES.MAINTENANCE, icon: 'maintenance', labelKey: 'nav_maintenance', route: 'MaintenanceTab', tone: 'warning' },
  { capability: MODULES.EXPENSES, icon: 'expenses', labelKey: 'nav_expenses', route: 'ExpensesTab', tone: 'warning' },
  { capability: MODULES.UNITS, icon: 'units', labelKey: 'nav_units', route: 'UnitsTab', tone: 'accent' },
  { capability: MODULES.USERS, icon: 'users', labelKey: 'nav_users', route: 'UsersTab', tone: 'neutral' },
  { capability: MODULES.HOUSEHOLD, icon: 'household', labelKey: 'nav_household', route: 'HouseholdTab', tone: 'positive' },
  // System-admin surfaces.
  { capability: MODULES.SYSTEM_BUILDINGS, icon: 'buildings', labelKey: 'nav_buildings', route: 'BuildingsTab', tone: 'accent' },
  { capability: MODULES.SYSTEM_USERS, icon: 'users', labelKey: 'nav_users', route: 'AllUsersTab', tone: 'neutral' },
  { capability: MODULES.SYSTEM_PRICING, icon: 'pricing', labelKey: 'nav_pricing', route: 'PricingTab', tone: 'positive' },
  { capability: MODULES.SYSTEM_PAYMENTS, icon: 'payments', labelKey: 'nav_admin_payments', route: 'AdminPaymentsTab', tone: 'accent' },
];
