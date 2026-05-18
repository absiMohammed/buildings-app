import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AcceptInvitePage() {
  const { acceptInvite } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await acceptInvite(token, password, { firstName, lastName });
      navigate('/', { replace: true });
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not accept invite');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return <div className="p-8 text-red-700">Invalid invite link.</div>;
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white p-6 rounded-lg shadow border border-slate-200 space-y-4">
        <h1 className="text-xl font-semibold">Welcome — set up your account</h1>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-slate-700">First name</span>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 block w-full rounded border-slate-300 border p-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700">Last name</span>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 block w-full rounded border-slate-300 border p-2"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-slate-700">Choose a password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded border-slate-300 border p-2"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-60"
        >
          {submitting ? 'Activating…' : 'Activate account'}
        </button>
      </form>
    </div>
  );
}
