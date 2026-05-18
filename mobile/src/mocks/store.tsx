import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  ALL_PAYMENTS,
  filterPaymentsByRole,
  initialPolls,
  initialTickets,
  isPaymentOpen,
  paymentOwed,
  units as seedUnits,
  usersList as seedUsers,
  expensesFor,
  type MockExpense,
  type MockPayment,
  type MockPoll,
  type MockTicket,
  type MockUnit,
  type MockUser,
  type PaymentType,
} from './fixtures';
import type { Role } from '../auth/AuthContext';

export interface RecordPaymentResult {
  appliedTo: { paymentId: string; amount: number; type: PaymentType; fullyPaid: boolean }[];
  credited: number; // surplus left over → unit balance
}

export class InsufficientPaymentError extends Error {
  constructor(public selectedTotal: number, public provided: number) {
    super(
      `The amount provided (${provided}) does not fully cover the selected items (${selectedTotal}). Deselect one or increase the amount.`
    );
    this.name = 'InsufficientPaymentError';
  }
}

interface MockStore {
  units: MockUnit[];
  users: MockUser[];
  expenses: MockExpense[];
  payments: MockPayment[];
  polls: MockPoll[];
  tickets: MockTicket[];
  unitBalances: Record<string, number>;

  addUnit(input: Omit<MockUnit, '_id'>): void;
  updateUnitStatus(unitNumber: string, status: MockUnit['occupancyStatus']): void;
  updateUnit(unitNumber: string, patch: Partial<Omit<MockUnit, '_id' | 'number'>>): void;

  setUserStatus(userId: string, status: MockUser['status']): void;
  setUserRole(userId: string, role: Role): void;
  removeUser(userId: string): void;

  addExpense(input: Omit<MockExpense, '_id' | 'date'>): void;

  createPoll(input: { title: string; description: string; closesInDays: number }): void;
  voteOnPoll(pollId: string, choice: 'yes' | 'no'): void;

  createTicket(input: {
    title: string;
    description: string;
    priority: MockTicket['priority'];
    category: MockTicket['category'];
    scope: 'unit' | 'common';
    unit: string;
    reporterEmail: string;
  }): void;
  approveTicket(id: string): void;
  rejectTicket(id: string, reason?: string): void;
  setTicketStatus(id: string, status: MockTicket['status']): void;

  // Bulk-create a new outstanding charge across one or more units. Used for
  // special assessments (e.g. "New main door"), one-off utility bills, etc.
  createCharge(input: {
    unitNumbers: string[];
    amountPerUnit: number;
    type: PaymentType;
    description?: string;
    dueDate: string; // ISO
    currency?: string;
  }): { created: number };

  // Apply a received payment for a unit.
  //   - selectedPaymentIds must be provided when calling from the UI; the
  //     amount must fully cover those items (sum of their remaining owed).
  //     If it doesn't, InsufficientPaymentError is thrown so the caller can
  //     surface the error and ask the admin to deselect one.
  //   - If selectedPaymentIds is omitted, all open items are walked oldest
  //     first (used by automation/back-fills).
  // Any leftover credits the unit's balance.
  recordPaymentForUnit(
    unitNumber: string,
    amount: number,
    options?: { selectedPaymentIds?: string[]; note?: string }
  ): RecordPaymentResult;

  paymentsForUnit(unitNumber: string): MockPayment[];
  paymentsForRole(role: Role): MockPayment[];
  unitBalance(unitNumber: string): number;
}

const Ctx = createContext<MockStore | undefined>(undefined);

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<MockUnit[]>(seedUnits);
  const [users, setUsers] = useState<MockUser[]>(seedUsers);
  const [expenses, setExpenses] = useState<MockExpense[]>(() => expensesFor('admin'));
  const [payments, setPayments] = useState<MockPayment[]>(ALL_PAYMENTS);
  const [polls, setPolls] = useState<MockPoll[]>(initialPolls);
  const [tickets, setTickets] = useState<MockTicket[]>(initialTickets);
  const [unitBalances, setUnitBalances] = useState<Record<string, number>>({});

  const addUnit = useCallback((input: Omit<MockUnit, '_id'>) => {
    setUnits((arr) => [{ ...input, _id: `u-${Date.now()}` } as MockUnit, ...arr]);
  }, []);

  const updateUnitStatus = useCallback((unitNumber: string, status: MockUnit['occupancyStatus']) => {
    setUnits((arr) => arr.map((u) => (u.number === unitNumber ? { ...u, occupancyStatus: status } : u)));
  }, []);

  const updateUnit = useCallback((unitNumber: string, patch: Partial<Omit<MockUnit, '_id' | 'number'>>) => {
    setUnits((arr) => arr.map((u) => (u.number === unitNumber ? { ...u, ...patch } : u)));
  }, []);

  const setUserStatus = useCallback((userId: string, status: MockUser['status']) => {
    setUsers((arr) => arr.map((u) => (u._id === userId ? { ...u, status } : u)));
  }, []);

  const setUserRole = useCallback((userId: string, role: Role) => {
    setUsers((arr) => arr.map((u) => (u._id === userId ? { ...u, role } : u)));
  }, []);

  const removeUser = useCallback((userId: string) => {
    setUsers((arr) => arr.filter((u) => u._id !== userId));
  }, []);

  const addExpense = useCallback((input: Omit<MockExpense, '_id' | 'date'>) => {
    setExpenses((arr) => [
      { ...input, _id: `e-${Date.now()}`, date: new Date().toISOString() } as MockExpense,
      ...arr,
    ]);
  }, []);

  const createPoll = useCallback(
    (input: { title: string; description: string; closesInDays: number }) => {
      const id = `pl-${Date.now()}`;
      const closesAt = new Date(Date.now() + input.closesInDays * 86_400_000).toISOString();
      setPolls((arr) => [
        {
          _id: id,
          title: input.title,
          description: input.description,
          status: 'open',
          closesAt,
          totalVotes: 0,
          yesVotes: 0,
          noVotes: 0,
          hasVoted: false,
        },
        ...arr,
      ]);
    },
    []
  );

  const createTicket = useCallback(
    (input: {
      title: string;
      description: string;
      priority: MockTicket['priority'];
      category: MockTicket['category'];
      scope: 'unit' | 'common';
      unit: string;
      reporterEmail: string;
    }) => {
      const id = `tk-${Date.now()}`;
      setTickets((arr) => [
        {
          _id: id,
          title: input.title,
          description: input.description,
          priority: input.priority,
          category: input.category,
          scope: input.scope,
          unit: input.unit,
          reporterEmail: input.reporterEmail,
          status: 'submitted',
          createdAt: new Date().toISOString(),
        },
        ...arr,
      ]);
    },
    []
  );

  const approveTicket = useCallback((id: string) => {
    setTickets((arr) =>
      arr.map((t) => (t._id === id && t.status === 'submitted' ? { ...t, status: 'open' } : t))
    );
  }, []);

  const rejectTicket = useCallback((id: string, reason?: string) => {
    setTickets((arr) =>
      arr.map((t) =>
        t._id === id && t.status === 'submitted'
          ? { ...t, status: 'rejected', rejectionReason: reason }
          : t
      )
    );
  }, []);

  const setTicketStatus = useCallback((id: string, status: MockTicket['status']) => {
    setTickets((arr) => arr.map((t) => (t._id === id ? { ...t, status } : t)));
  }, []);

  const voteOnPoll = useCallback((pollId: string, choice: 'yes' | 'no') => {
    setPolls((arr) =>
      arr.map((p) =>
        p._id === pollId && !p.hasVoted && p.status === 'open'
          ? {
              ...p,
              hasVoted: true,
              totalVotes: p.totalVotes + 1,
              yesVotes: choice === 'yes' ? p.yesVotes + 1 : p.yesVotes,
              noVotes: choice === 'no' ? p.noVotes + 1 : p.noVotes,
            }
          : p
      )
    );
  }, []);

  const createCharge = useCallback(
    (input: {
      unitNumbers: string[];
      amountPerUnit: number;
      type: PaymentType;
      description?: string;
      dueDate: string;
      currency?: string;
    }) => {
      if (!input.unitNumbers.length || input.amountPerUnit <= 0) return { created: 0 };
      const baseId = Date.now();
      const newRows: MockPayment[] = input.unitNumbers.map((unitNumber, i) => ({
        _id: `c-${baseId}-${i}`,
        amount: input.amountPerUnit,
        currency: input.currency ?? 'ILS',
        status: 'pending',
        dueDate: input.dueDate,
        type: input.type,
        unitId: unitNumber,
        payer: 'owner',
        payee: 'building',
      }));
      setPayments((arr) => [...newRows, ...arr]);
      return { created: newRows.length };
    },
    []
  );

  const recordPaymentForUnit = useCallback(
    (
      unitNumber: string,
      amount: number,
      options?: { selectedPaymentIds?: string[]; note?: string }
    ): RecordPaymentResult => {
      const todayIso = new Date().toISOString();
      const result: RecordPaymentResult = { appliedTo: [], credited: 0 };
      const selected = options?.selectedPaymentIds;

      // When the caller picked specific payments, validate that the money
      // fully covers their combined remaining owed before applying anything.
      if (selected && selected.length > 0) {
        const set = new Set(selected);
        const selectedTotal = payments
          .filter((p) => p.unitId === unitNumber && set.has(p._id) && isPaymentOpen(p))
          .reduce((s, p) => s + paymentOwed(p), 0);
        if (amount + 1e-6 < selectedTotal) {
          throw new InsufficientPaymentError(selectedTotal, amount);
        }
      }

      setPayments((arr) => {
        const next = [...arr];
        const indexedOpen = next
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.unitId === unitNumber && isPaymentOpen(p));

        const queue =
          selected && selected.length > 0
            ? indexedOpen
                .filter(({ p }) => selected.includes(p._id))
                .sort((a, b) => +new Date(a.p.dueDate) - +new Date(b.p.dueDate))
            : [...indexedOpen].sort((a, b) => +new Date(a.p.dueDate) - +new Date(b.p.dueDate));

        let remaining = amount;
        for (const { p, i } of queue) {
          if (remaining <= 0) break;
          const owed = paymentOwed(p);
          if (owed <= 0) continue;
          if (remaining >= owed) {
            next[i] = { ...p, status: 'paid', paidDate: todayIso, paidAmount: p.amount };
            result.appliedTo.push({ paymentId: p._id, amount: owed, type: p.type, fullyPaid: true });
            remaining -= owed;
          } else {
            // Reached only with the auto-allocation path (no selected ids),
            // since the validation above would have rejected an undercover
            // selection.
            next[i] = {
              ...p,
              status: 'partially_paid',
              paidAmount: (p.paidAmount ?? 0) + remaining,
            };
            result.appliedTo.push({ paymentId: p._id, amount: remaining, type: p.type, fullyPaid: false });
            remaining = 0;
            break;
          }
        }

        result.credited = remaining;
        return next;
      });

      if (result.credited > 0) {
        setUnitBalances((m) => ({ ...m, [unitNumber]: (m[unitNumber] ?? 0) + result.credited }));
      }
      return result;
    },
    [payments]
  );

  const paymentsForUnit = useCallback(
    (unitNumber: string) => payments.filter((p) => p.unitId === unitNumber),
    [payments]
  );

  const paymentsForRole = useCallback(
    (role: Role) => filterPaymentsByRole(payments, role),
    [payments]
  );

  const unitBalance = useCallback((unitNumber: string) => unitBalances[unitNumber] ?? 0, [unitBalances]);

  const value = useMemo<MockStore>(
    () => ({
      units,
      users,
      expenses,
      payments,
      polls,
      tickets,
      unitBalances,
      addUnit,
      updateUnitStatus,
      updateUnit,
      setUserStatus,
      setUserRole,
      removeUser,
      addExpense,
      createPoll,
      voteOnPoll,
      createTicket,
      approveTicket,
      rejectTicket,
      setTicketStatus,
      createCharge,
      recordPaymentForUnit,
      paymentsForUnit,
      paymentsForRole,
      unitBalance,
    }),
    [
      units,
      users,
      expenses,
      payments,
      polls,
      tickets,
      unitBalances,
      addUnit,
      updateUnitStatus,
      updateUnit,
      setUserStatus,
      setUserRole,
      removeUser,
      addExpense,
      createPoll,
      voteOnPoll,
      createTicket,
      approveTicket,
      rejectTicket,
      setTicketStatus,
      createCharge,
      recordPaymentForUnit,
      paymentsForUnit,
      paymentsForRole,
      unitBalance,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMockStore(): MockStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMockStore must be used inside MockStoreProvider');
  return ctx;
}
