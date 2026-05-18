import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearTokens, getAccessToken, setTokens } from '../api/client';

export type Role = 'admin' | 'owner' | 'renter' | 'dependent';

export interface CurrentUser {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  buildingId: string;
  unitId?: string | null;
  status: 'invited' | 'active' | 'suspended';
}

interface AuthCtx {
  user: CurrentUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  acceptInvite(token: string, password: string, names: { firstName?: string; lastName?: string }): Promise<void>;
  refreshMe(): Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(getAccessToken()));

  async function refreshMe(): Promise<void> {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const r = await api.get('/me');
      setUser(r.data.user);
    } catch {
      setUser(null);
      clearTokens();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshMe();
  }, []);

  async function login(email: string, password: string) {
    const r = await api.post('/auth/login', { email, password });
    setTokens(r.data.accessToken, r.data.refreshToken);
    setUser(r.data.user);
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* noop */
    }
    clearTokens();
    setUser(null);
  }

  async function acceptInvite(
    token: string,
    password: string,
    names: { firstName?: string; lastName?: string }
  ) {
    const r = await api.post('/auth/invite/accept', { token, password, ...names });
    setTokens(r.data.accessToken, r.data.refreshToken);
    setUser(r.data.user);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, acceptInvite, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
