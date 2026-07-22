import { api } from './client';

export type PaymentType = 'monthly_dues' | 'expense_split' | 'one_off';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'waived';
export type PaymentMethod = 'cash' | 'transfer' | 'stripe' | 'other';

export interface Payment {
  _id: string;
  buildingId: string;
  unitId: string;
  type: PaymentType;
  amount: number;
  currency: string;
  dueDate: string;
  status: PaymentStatus;
  paidAt: string | null;
  paidBy: string | null;
  paymentMethod: PaymentMethod | null;
  externalRef: string;
  expenseId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
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

/** Admin-only: generate this month's dues for every unit. */
export async function runMonthlyDues(): Promise<number> {
  const r = await api.post<{ generated: number }>('/payments/run-monthly', {});
  return r.data.generated ?? 0;
}
