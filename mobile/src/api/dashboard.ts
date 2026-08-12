import { api } from './client';
import type { PaymentStatus, PaymentType } from './payments';

export interface DashboardTrendPoint {
  year: number;
  /** 1–12 */
  month: number;
  value: number;
}

export interface DashboardRecentUser {
  _id: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'invited' | 'active' | 'suspended';
  role: string;
}

export interface DashboardSummary {
  balance: number;
  overdue: { count: number; amount: number };
  pendingCount: number;
  collectedMTD: number;
  paidYTD: number;
  paidTotal: number;
  totalRecorded: number;
  unitsWithDebt: number;
  occupiedUnits: number;
  totalUnits: number;
  activeResidents: number;
  openTickets: number;
  openPolls: number;
  nextDue: {
    remaining: number;
    dueDate: string;
    type: PaymentType;
    status: PaymentStatus;
  } | null;
  trend: DashboardTrendPoint[];
  byType: Partial<Record<PaymentType, number>>;
  recentUsers: DashboardRecentUser[];
}

/**
 * The home screen's single data call — server-aggregated, receipts-aware,
 * correct beyond the payment list's 500-row page.
 */
export async function getDashboardSummary(opts?: { scope?: 'mine' }): Promise<DashboardSummary> {
  const r = await api.get<{ summary: DashboardSummary }>('/dashboard/summary', {
    params: opts?.scope ? { scope: opts.scope } : undefined,
  });
  return r.data.summary;
}
