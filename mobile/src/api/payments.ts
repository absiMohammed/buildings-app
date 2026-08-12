import { api } from './client';

export type PaymentType = 'monthly_dues' | 'expense_split' | 'one_off' | 'rent';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'waived';
// 'credit' receipts are system-generated (credit balance auto-applied).
export type PaymentMethod = 'cash' | 'transfer' | 'stripe' | 'other' | 'credit';

/** One installment received against a charge. */
export interface PaymentReceipt {
  _id: string;
  amount: number;
  at: string;
  method: PaymentMethod;
  externalRef: string;
  note: string;
  recordedBy: string | null;
  payerId: string | null;
}

export interface Payment {
  _id: string;
  buildingId: string;
  unitId: string;
  type: PaymentType;
  amount: number;
  currency: string;
  dueDate: string;
  status: PaymentStatus;
  // Sum of receipts — partial coverage is paidAmount > 0 while status is
  // still pending/overdue ("partial" is derived, never a status value).
  paidAmount: number;
  receipts: PaymentReceipt[];
  paidAt: string | null;
  paidBy: string | null;
  paymentMethod: PaymentMethod | null;
  externalRef: string;
  expenseId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Unpaid remainder of a charge (pre-feature rows may lack paidAmount). */
export function remainingOf(p: Payment): number {
  return Math.max(0, Math.round((p.amount - (p.paidAmount ?? 0)) * 100) / 100);
}

/** Partially covered: some money in, charge still open. */
export function isPartiallyPaid(p: Payment): boolean {
  return (p.paidAmount ?? 0) > 0 && p.status !== 'paid' && p.status !== 'waived';
}

export interface UserCreditBalance {
  _id: string;
  userId: string;
  balance: number;
  currency: string;
}

export async function listPayments(params?: { status?: PaymentStatus; type?: PaymentType }): Promise<Payment[]> {
  const r = await api.get<{ payments: Payment[] }>('/payments', { params });
  return r.data.payments ?? [];
}

export async function getPayment(id: string): Promise<Payment> {
  const r = await api.get<{ payment: Payment }>(`/payments/${id}`);
  return r.data.payment;
}

/** Admin-only: create a charge against a unit. */
export async function createPayment(body: {
  unitId: string;
  type?: PaymentType;
  amount: number;
  currency?: string;
  dueDate: string;
  notes?: string;
}): Promise<Payment> {
  const r = await api.post<{ payment: Payment }>('/payments', body);
  return r.data.payment;
}

/** Admin-only: change a payment's status (mark paid/waived/etc.). */
export async function updatePayment(
  id: string,
  body: { status: PaymentStatus; paymentMethod?: PaymentMethod; externalRef?: string; paidAt?: string },
): Promise<Payment> {
  const r = await api.patch<{ payment: Payment }>(`/payments/${id}`, body);
  return r.data.payment;
}

/** Resident self-record: mark one of their own payments as paid. */
export async function payPayment(
  id: string,
  body?: { paymentMethod?: PaymentMethod; externalRef?: string },
): Promise<Payment> {
  const r = await api.post<{ payment: Payment }>(`/payments/${id}/pay`, body ?? {});
  return r.data.payment;
}

/**
 * Record money received against one unit's charges (partial amounts
 * allowed). The server waterfalls the amount oldest-first across the
 * selected charges; surplus credits the payer's balance.
 */
export async function recordReceipts(body: {
  paymentIds: string[];
  amount: number;
  paymentMethod?: Exclude<PaymentMethod, 'credit'>;
  externalRef?: string;
  note?: string;
  payerId?: string;
}): Promise<{ payments: Payment[]; surplus: { amount: number; userId: string } | null }> {
  const r = await api.post<{ payments: Payment[]; surplus: { amount: number; userId: string } | null }>(
    '/payments/receipts',
    body,
  );
  return r.data;
}

/** Credit balances: all building rows for admins, own row for members. */
export async function listCredits(params?: { userId?: string }): Promise<UserCreditBalance[]> {
  const r = await api.get<{ credits: UserCreditBalance[] }>('/payments/credits', { params });
  return r.data.credits ?? [];
}

/** Admin-only: generate this month's dues for every unit. */
export async function runMonthlyDues(): Promise<number> {
  const r = await api.post<{ generated: number }>('/payments/run-monthly', {});
  return r.data.generated ?? 0;
}
