import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Payment {
  _id: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'waived';
  dueDate: string;
  type: string;
  currency: string;
}
interface Poll {
  _id: string;
  title: string;
  status: 'draft' | 'open' | 'closed';
  closesAt: string;
}

export function DashboardPage() {
  const { user } = useAuth();

  const paymentsQ = useQuery<{ payments: Payment[] }>({
    queryKey: ['payments'],
    queryFn: async () => (await api.get('/payments')).data,
  });

  const pollsQ = useQuery<{ polls: Poll[] }>({
    queryKey: ['polls'],
    queryFn: async () => (await api.get('/polls')).data,
  });

  const outstanding = (paymentsQ.data?.payments ?? []).filter(
    (p) => p.status === 'pending' || p.status === 'overdue'
  );
  const openPolls = (pollsQ.data?.polls ?? []).filter((p) => p.status === 'open');
  const balance = outstanding.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Welcome{user?.firstName ? `, ${user.firstName}` : ''}
        </h1>
        <p className="text-slate-500 text-sm capitalize">Signed in as {user?.role}</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Outstanding balance" value={`${balance.toFixed(2)}`} hint={`${outstanding.length} unpaid`} />
        <Card title="Open polls" value={String(openPolls.length)} hint="awaiting votes" />
        <Card title="Role" value={user?.role ?? '—'} hint={user?.unitId ? `Unit ${user.unitId}` : ''} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Recent payments</h2>
        <div className="bg-white rounded border border-slate-200 divide-y divide-slate-100">
          {(paymentsQ.data?.payments ?? []).slice(0, 6).map((p) => (
            <div key={p._id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="font-medium">{p.type.replace('_', ' ')}</div>
                <div className="text-slate-500">Due {new Date(p.dueDate).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                <div>
                  {p.currency} {p.amount.toFixed(2)}
                </div>
                <div className={`text-xs ${p.status === 'paid' ? 'text-emerald-700' : p.status === 'overdue' ? 'text-red-700' : 'text-slate-500'}`}>
                  {p.status}
                </div>
              </div>
            </div>
          ))}
          {(paymentsQ.data?.payments ?? []).length === 0 && (
            <div className="p-3 text-sm text-slate-500">No payments yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
