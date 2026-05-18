import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, clearTokens, getAccessToken, loadTokens, setTokens } from '../api/client';
import type { Capabilities } from './capabilities';
import { EMPTY_CAPABILITIES } from './capabilities';

const VIEW_MODE_STORAGE_KEY = 'ba_view_mode';
export type ViewMode = 'owner' | 'admin';

export type Role = 'admin' | 'owner' | 'renter' | 'dependent';

export interface BuildingSummary {
  _id: string;
  name: string;
  currency: string;
  settings?: {
    monthlyDuesDay?: number;
    // Fallback used by any unit that doesn't set its own monthlyDue.
    defaultMonthlyDues?: number;
    timezone?: string;
    lateFee?: { gracePeriodDays?: number; flatAmount?: number; percent?: number };
    // Anchor for per-user geo-fences. Per-user UserSettings only stores
    // radiusMeters + allowedActions; the center is read from here.
    geoCenter?: { lat?: number | null; lng?: number | null };
  };
}

export interface UnitSummary {
  _id: string;
  number: string;
  floor?: number;
  monthlyDuesAmount?: number | null;
}

export type GeoAction = 'open_gate' | 'close_gate' | 'open_door' | 'call_elevator';

export interface UserSettings {
  /** Cap on dependents this user (owner/renter) may invite. null = none allowed. */
  maxDependents?: number | null;
  /** Recurring per-month utility lines (utility name → amount). */
  monthlyUtilities?: Record<string, number>;
  /** Allowed remote-action distance from the building. */
  geoFence?: {
    centerLat?: number | null;
    centerLng?: number | null;
    radiusMeters?: number | null;
    allowedActions?: GeoAction[];
  };
  /** Free-form admin-set preferences for forward-compat. */
  custom?: Record<string, string>;
}

export interface CurrentUser {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  // System admin (role==='admin') is building-agnostic; for every other
  // role this is guaranteed to be a non-null id.
  buildingId: string | null;
  unitId?: string | null;
  status: 'invited' | 'active' | 'suspended';
  capabilities?: Capabilities;
  /** Building-admin overlay capabilities. Non-null only when role==='owner'
   * AND isBuildingAdmin===true. Mobile swaps to these when the user toggles
   * "view as admin" via the persistent header chip. */
  adminCapabilities?: Capabilities | null;
  /** True when this user is the owner-flagged-as-building-admin. */
  isBuildingAdmin?: boolean;
  building?: BuildingSummary | null;
  unit?: UnitSummary | null;
  settings?: UserSettings;
}

interface AuthCtx {
  user: CurrentUser | null;
  building: BuildingSummary | null;
  loading: boolean;
  login(identifier: string, password: string): Promise<void>;
  logout(): Promise<void>;
  acceptInvite(token: string, password: string, names: { firstName?: string; lastName?: string }): Promise<void>;
  refreshMe(): Promise<void>;
  updateBuilding(b: BuildingSummary): void;
  /**
   * Current view mode for building-admin owners. `'owner'` by default;
   * flips to `'admin'` when the user taps the header chip. Persisted so it
   * survives reloads. Always `'owner'` for users without an admin overlay.
   */
  viewMode: ViewMode;
  /**
   * Effective capability set after applying the view-mode overlay. UI
   * checks (hasModule, hasAction, hasWidget) should read from this instead
   * of `user.capabilities` so they react to view-mode flips automatically.
   */
  capabilities: Capabilities;
  /** True when this user has an admin overlay available to toggle into. */
  canToggleAdminView: boolean;
  /** Flip between owner and admin view. No-op for users without an overlay. */
  setViewMode(mode: ViewMode): void;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [building, setBuilding] = useState<BuildingSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewModeState] = useState<ViewMode>('owner');

  function applyUser(payload: CurrentUser | null) {
    setUser(payload);
    setBuilding(payload?.building ?? null);
    // Reset to owner view when the identity changes. Persist no view mode
    // for a non-building-admin user (they can't toggle anyway).
    setViewModeState('owner');
    void AsyncStorage.removeItem(VIEW_MODE_STORAGE_KEY).catch(() => undefined);
  }

  // Restore last view mode for a building-admin owner. Skipped if the saved
  // mode no longer makes sense (e.g. their admin flag was revoked).
  useEffect(() => {
    if (!user?.isBuildingAdmin || !user.adminCapabilities) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY)) as ViewMode | null;
        if (!cancelled && (saved === 'admin' || saved === 'owner')) {
          setViewModeState(saved);
        }
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?._id, user?.isBuildingAdmin, user?.adminCapabilities]);

  // Safety net: if the cached user payload pre-dates the role-model refactor
  // (no `adminCapabilities` field at all, not even null), force a refresh
  // once so building admins get their overlay without needing to log out.
  // Only triggers for owners; other roles never have an overlay.
  useEffect(() => {
    if (!user || user.role !== 'owner') return;
    if (user.adminCapabilities !== undefined) return;
    void refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  const canToggleAdminView = !!user?.isBuildingAdmin && !!user?.adminCapabilities;

  function setViewMode(mode: ViewMode): void {
    if (!canToggleAdminView && mode === 'admin') return;
    setViewModeState(mode);
    void AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, mode).catch(() => undefined);
  }

  const capabilities: Capabilities = useMemo(() => {
    if (!user) return EMPTY_CAPABILITIES;
    if (viewMode === 'admin' && canToggleAdminView && user.adminCapabilities) {
      return user.adminCapabilities;
    }
    return user.capabilities ?? EMPTY_CAPABILITIES;
  }, [user, viewMode, canToggleAdminView]);

  async function refreshMe(): Promise<void> {
    if (!getAccessToken()) {
      applyUser(null);
      setLoading(false);
      return;
    }
    try {
      const r = await api.get('/me');
      applyUser(r.data.user);
    } catch {
      applyUser(null);
      await clearTokens();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadTokens();
      await refreshMe();
    })();
  }, []);

  async function login(identifier: string, password: string) {
    const r = await api.post('/auth/login', { identifier: identifier.trim(), password });
    await setTokens(r.data.accessToken, r.data.refreshToken);
    applyUser(r.data.user);
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* noop */
    }
    await clearTokens();
    applyUser(null);
  }

  async function acceptInvite(
    token: string,
    password: string,
    names: { firstName?: string; lastName?: string }
  ) {
    const r = await api.post('/auth/invite/accept', { token, password, ...names });
    await setTokens(r.data.accessToken, r.data.refreshToken);
    applyUser(r.data.user);
  }

  function updateBuilding(b: BuildingSummary) {
    setBuilding(b);
    setUser((u) => (u ? { ...u, building: b } : u));
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        building,
        loading,
        login,
        logout,
        acceptInvite,
        refreshMe,
        updateBuilding,
        viewMode,
        capabilities,
        canToggleAdminView,
        setViewMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

export function useCurrency(): string {
  const ctx = useContext(AuthContext);
  return ctx?.building?.currency ?? 'ILS';
}

export const _capabilities = { EMPTY_CAPABILITIES };
