import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { DashboardPage } from './pages/DashboardPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RequireAuth } from './auth/RequireAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/accept" element={<AcceptInvitePage />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="expenses" element={<PlaceholderPage title="Expenses" />} />
        <Route path="polls" element={<PlaceholderPage title="Polls" />} />
        <Route path="maintenance" element={<PlaceholderPage title="Maintenance" />} />
        <Route path="documents" element={<PlaceholderPage title="Documents" />} />
        <Route
          path="units"
          element={
            <RequireAuth roles={['admin']}>
              <PlaceholderPage title="Units" />
            </RequireAuth>
          }
        />
        <Route
          path="users"
          element={
            <RequireAuth roles={['admin']}>
              <PlaceholderPage title="Users" />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
