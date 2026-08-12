import type { StringKey } from '../i18n/strings';
import type { PaymentType, PaymentMethod } from '../api/payments';

// Every server enum that reaches the UI gets a translated label here — no
// screen may render a raw enum value or prettify one ("one_off" → "One Off").
// All maps are total over their unions so a new enum member is a type error,
// not a silent English leak.

type Translate = (k: StringKey) => string;

const PAYMENT_TYPE_KEY: Record<PaymentType, StringKey> = {
  monthly_dues: 'ptype_building_dues',
  expense_split: 'ptype_utilities',
  one_off: 'ptype_special',
  rent: 'ptype_rent',
};

export function paymentTypeLabel(t: Translate, pt: PaymentType): string {
  return t(PAYMENT_TYPE_KEY[pt]);
}

const PAYMENT_METHOD_KEY: Record<PaymentMethod, StringKey> = {
  cash: 'sub_method_cash',
  transfer: 'sub_method_transfer',
  stripe: 'sub_method_card',
  other: 'sub_method_other',
  credit: 'unit_stat_credit',
};

export function paymentMethodLabel(t: Translate, m: PaymentMethod): string {
  return t(PAYMENT_METHOD_KEY[m]);
}

export type ExpenseCategory =
  | 'maintenance'
  | 'utilities'
  | 'repairs'
  | 'cleaning'
  | 'insurance'
  | 'other';

const EXPENSE_CATEGORY_KEY: Record<ExpenseCategory, StringKey> = {
  maintenance: 'cat_maintenance',
  utilities: 'cat_utilities',
  repairs: 'cat_repairs',
  cleaning: 'cat_cleaning',
  insurance: 'cat_insurance',
  other: 'cat_other',
};

export function expenseCategoryLabel(t: Translate, cat: ExpenseCategory): string {
  return t(EXPENSE_CATEGORY_KEY[cat]);
}

export type MaintenanceCategory = 'plumbing' | 'electrical' | 'elevator' | 'common_area' | 'other';
export type MaintenancePriority = 'low' | 'normal' | 'high' | 'urgent';

const MAINT_CATEGORY_KEY: Record<MaintenanceCategory, StringKey> = {
  plumbing: 'tcat_plumbing',
  electrical: 'tcat_electrical',
  elevator: 'qa_elevator_title',
  common_area: 'maint_place_common',
  other: 'tcat_other',
};

export function maintenanceCategoryLabel(t: Translate, cat: MaintenanceCategory): string {
  return t(MAINT_CATEGORY_KEY[cat]);
}

const MAINT_PRIORITY_KEY: Record<MaintenancePriority, StringKey> = {
  urgent: 'maint_priority_urgent',
  high: 'maint_priority_high',
  normal: 'maint_priority_medium',
  low: 'maint_priority_low',
};

export function maintenancePriorityLabel(t: Translate, p: MaintenancePriority): string {
  return t(MAINT_PRIORITY_KEY[p]);
}
