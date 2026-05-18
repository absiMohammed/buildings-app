import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Payment {
  _id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'overdue' | 'waived';
  dueDate: string;
  type: string;
  unitId: string;
}

export function PaymentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ payments: Payment[] }>({
    queryKey: ['payments'],
    queryFn: async () => (await api.get('/payments')).data,
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch(`/payments/${id}`, { status: 'paid', paymentMethod: 'transfer' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });

  const pay = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/payments/${id}/pay`, { paymentMethod: 'transfer' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Payments</h1>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Type</th>
              <th className="p-3">Due</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.payments ?? []).map((p) => (
              <tr key={p._id}>
                <td className="p-3">{p.type.replace('_', ' ')}</td>
                <td className="p-3">{new Date(p.dueDate).toLocaleDateString()}</td>
                <td className="p-3">
                  {p.currency} {p.amount.toFixed(2)}
                </td>
                <td className="p-3 capitalize">{p.status}</td>
                <td className="p-3 text-right">
                  {p.status !== 'paid' && p.status !== 'waived' && (
                    <button
                      className="text-blue-700 hover:underline"
                      onClick={() => (user?.role === 'admin' ? markPaid.mutate(p._id) : pay.mutate(p._id))}
                    >
                      {user?.role === 'admin' ? 'Mark paid' : 'Record payment'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(data?.payments ?? []).length === 0 && (
              <tr>
                <td className="p-3 text-slate-500" colSpan={5}>
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
