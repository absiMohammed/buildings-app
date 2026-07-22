import { api } from './client';

export type ExpenseCategory =
  | 'maintenance'
  | 'utilities'
  | 'repairs'
  | 'cleaning'
  | 'insurance'
  | 'other';
export type SplitMode = 'equal' | 'by_sqft' | 'none';

export interface Expense {
  _id: string;
  buildingId: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  description: string;
  vendor: string;
  incurredAt: string;
  receiptUrl: string | null;
  splitMode: SplitMode;
  splitGenerated: boolean;
  createdBy: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listExpenses(params?: {
  category?: ExpenseCategory;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Expense[]> {
  const r = await api.get<{ expenses: Expense[] }>('/expenses', { params });
  return r.data.expenses ?? [];
}

/** Admin-only. */
export async function createExpense(body: {
  category: ExpenseCategory;
  amount: number;
  currency?: string;
  description?: string;
  vendor?: string;
  incurredAt: string;
  receiptUrl?: string;
  splitMode?: SplitMode;
}): Promise<Expense> {
  const r = await api.post<{ expense: Expense }>('/expenses', body);
  return r.data.expense;
}

/** Admin-only. */
export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/expenses/${id}`);
}

/** Admin-only: split an expense into per-unit payments. */
export async function splitExpense(id: string): Promise<number> {
  const r = await api.post<{ generated: number }>(`/expenses/${id}/split`, {});
  return r.data.generated ?? 0;
}
