import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', roles: ['admin', 'owner', 'renter', 'dependent'] },
  { to: '/payments', label: 'Payments', roles: ['admin', 'owner', 'renter', 'dependent'] },
  { to: '/expenses', label: 'Expenses', roles: ['admin', 'owner', 'renter', 'dependent'] },
  { to: '/polls', label: 'Polls', roles: ['admin', 'owner', 'renter', 'dependent'] },
  { to: '/maintenance', label: 'Maintenance', roles: ['admin', 'owner', 'renter', 'dependent'] },
  { to: '/documents', label: 'Documents', roles: ['admin', 'owner', 'renter', 'dependent'] },
  { to: '/units', label: 'Units', roles: ['admin'] },
  { to: '/users', label: 'Users', roles: ['admin'] },
];

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-white border-r border-slate-200 p-4">
        <h1 className="text-lg font-semibold mb-6">Building App</h1>
        <nav className="space-y-1">
          {navItems
            .filter((n) => n.roles.includes(user.role))
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
        </nav>
        <div className="mt-8 text-xs text-slate-500">
          <div>{user.email}</div>
          <div className="uppercase tracking-wide mt-1">{user.role}</div>
          <button
            onClick={() => void logout()}
            className="mt-4 text-slate-700 hover:text-slate-900 underline"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
