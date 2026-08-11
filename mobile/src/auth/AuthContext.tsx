import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {
  api,
  API_BASE_URL,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  loadTokens,
  setSessionExpiredHandler,
  setTokens,
} from '../api/client';
import {
  disableBiometricLogin,
  enableBiometricLogin as storeBiometricToken,
  tryBiometricLogin,
} from './biometric';
import type { Capabilities } from './capabilities';
import { EMPTY_CAPABILITIES } from './capabilities';

const VIEW_MODE_STORAGE_KEY = 'ba_view_mode';
export type ViewMode = 'owner' | 'admin';

export type Role = 'admin' | 'owner' | 'renter' | 'dependent' | 'independent';

export interface BuildingSubscription {
  plan: 'trial' | 'basic' | 'pro' | 'premium' | null;
  status: 'trial' | 'active' | 'suspended' | 'none';
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  /** Server-computed days remaining on the trial (0 when lapsed/not on trial). */
  trialDaysLeft?: number;
}

export interface BuildingSummary {
  _id: string;
  name: string;
  currency: string;
  status?: 'active' | 'inactive' | 'suspended';
  stories?: number;
  subscription?: BuildingSubscription | null;
  settings?: {
    monthlyDuesDay?: number;
    // Fallback used by any unit that doesn't set its own monthlyDue.
    defaultMonthlyDues?: number;
    timezone?: string;
    lateFee?: { gracePeriodDays?: number; flatAmount?: number; percent?: number };
    // Anchor for per-user geo-fences. Per-user UserSettings only stores
    // radiusMeters + allowedActions; the center is read from here.
    geoCenter?: { lat?: number | null; lng?: number | null };
    // Admin-configurable building access controls.
    access?: {
      gate?: { enabled?: boolean; label?: string };
      door?: { enabled?: boolean; label?: string };
      elevator?: { enabled?: boolean; label?: string };
    };
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

/** One building the user belongs to — used to render the building switcher. */
export interface MembershipSummary {
  buildingId: string;
  buildingName: string;
  role: Role;
  isBuildingAdmin: boolean;
  unitIds: string[];
}

export interface CurrentUser {
  _id: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  /** Every building the user belongs to (empty for the system admin). */
  memberships?: MembershipSummary[];
  /** The building the session is currently scoped to. */
  activeBuildingId?: string | null;
  // System admin (role==='admin') is building-agnostic; for every other
  // role this is guaranteed to be a non-null id.
  buildingId: string | null;
  unitId?: string | null;
  status: 'invited' | 'active' | 'suspended';
  /** Set on admin-created / reset accounts; the app forces a password change
   *  on first login until the user picks their own. */
  mustChangePassword?: boolean;
  capabilities?: Capabilities;
  /** Building-admin overlay capabilities. Non-null only when role==='owner'
   * AND isBuildingAdmin===true. Mobile swaps to these when the user toggles
   * "view as admin" via the persistent header chip. */
  adminCapabilities?: Capabilities | null;
  /** True when this user is the owner-flagged-as-building-admin. */
  isBuildingAdmin?: boolean;
  building?: BuildingSummary | null;
  unit?: UnitSummary | null;
  /** Every unit the user holds in the active building (owner of one,
   *  tenant of another, …). `unit` is the primary/first of these. */
  units?: UnitSummary[];
  settings?: UserSettings;
}

/** Payload for the self-service building signup (stepper form). */
export interface RegisterBuildingPayload {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  password: string;
  building: { name: string; address?: string; currency?: string; stories: number };
  apartment: { number: string; floor?: number };
}

interface AuthCtx {
  user: CurrentUser | null;
  building: BuildingSummary | null;
  loading: boolean;
  login(identifier: string, password: string): Promise<CurrentUser>;
  /** Self-service signup: creates building + founder account, signs in. */
  registerBuilding(payload: RegisterBuildingPayload): Promise<CurrentUser>;
  /** Prompt biometrics and sign in using the keychain-stored refresh token.
   * Returns true on success, false if the prompt was cancelled or the
   * stored token was rejected (in which case caller should fall back to
   * the password form). */
  loginWithBiometric(promptTitle: string): Promise<boolean>;
  /** Exchange a stored refresh token (per-account biometric/PIN) for a session. */
  loginWithRefreshToken(refreshToken: string): Promise<boolean>;
  /** Move the current session's refresh token into the OS keychain behind
   * biometrics so future launches can quick-unlock. */
  enableBiometric(): Promise<void>;
  logout(): Promise<void>;
  acceptInvite(token: string, password: string, names: { firstName?: string; lastName?: string }): Promise<void>;
  refreshMe(): Promise<void>;
  updateBuilding(b: BuildingSummary): void;
  /** Re-scope the session to another building the user belongs to. */
  switchBuilding(buildingId: string): Promise<void>;
  /** Change own password (also clears the must-change flag server-side). */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
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

  // The saved view mode is keyed per user so it survives app relaunches and
  // never leaks from one account to the next on the same device.
  const viewModeKey = (userId: string) => `${VIEW_MODE_STORAGE_KEY}:${userId}`;
  const lastUserIdRef = useRef<string | null>(null);

  function applyUser(payload: CurrentUser | null) {
    setUser(payload);
    setBuilding(payload?.building ?? null);
    // Reset to owner view only when the identity actually changes — a plain
    // /me refresh for the same user must not wipe their chosen mode (the
    // restore effect below re-reads it right after).
    const nextId = payload?._id ?? null;
    if (nextId !== lastUserIdRef.current) {
      lastUserIdRef.current = nextId;
      setViewModeState('owner');
    }
  }

  // Restore last view mode for a building-admin owner. Skipped if the saved
  // mode no longer makes sense (e.g. their admin flag was revoked).
  useEffect(() => {
    if (!user?._id || !user.isBuildingAdmin || !user.adminCapabilities) return;
    const key = viewModeKey(user._id);
    let cancelled = false;
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(key)) as ViewMode | null;
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
    if (user?._id) {
      void AsyncStorage.setItem(viewModeKey(user._id), mode).catch(() => undefined);
    }
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
    } catch (err) {
      applyUser(null);
      // Only wipe the session when the server rejected it. A network
      // failure (offline launch, backend blip) keeps the tokens so the
      // session survives until connectivity returns.
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401 || status === 403) {
        await clearTokens();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadTokens();
      await refreshMe();
    })();
    // Mount-only bootstrap; refreshMe is re-created each render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the API client's refresh attempt fails (refresh token expired,
  // revoked, or never existed), drop the user state. RootNavigator gates
  // on `user`, so this flips the UI back to the login stack instantly.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      applyUser(null);
      // Refresh token is dead; the biometric-stored copy is too.
      disableBiometricLogin().catch(() => undefined);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  async function login(identifier: string, password: string): Promise<CurrentUser> {
    const r = await api.post('/auth/login', { identifier: identifier.trim(), password });
    await setTokens(r.data.accessToken, r.data.refreshToken);
    applyUser(r.data.user);
    return r.data.user as CurrentUser;
  }

  async function registerBuilding(payload: RegisterBuildingPayload): Promise<CurrentUser> {
    const r = await api.post('/auth/register-building', payload);
    await setTokens(r.data.accessToken, r.data.refreshToken);
    applyUser(r.data.user);
    return r.data.user as CurrentUser;
  }

  // Biometric login: pull the keychain-stored refresh token, exchange it
  // for a fresh access token via /auth/refresh, then load the user. Uses
  // plain axios (not the api instance) so the response interceptor
  // doesn't recursively try to refresh on a 401.
  async function loginWithBiometric(promptTitle: string): Promise<boolean> {
    const refreshToken = await tryBiometricLogin(promptTitle);
    if (!refreshToken) return false;
    try {
      const r = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      // Refresh endpoint may rotate the refresh token; if it doesn't,
      // keep the one we just used.
      await setTokens(r.data.accessToken, r.data.refreshToken ?? refreshToken);
      await refreshMe();
      return true;
    } catch {
      // Token rejected — most likely revoked or expired. Clear the
      // keychain so the user isn't stuck offering an invalid credential.
      await disableBiometricLogin();
      return false;
    }
  }

  // Exchange a stored refresh token (from a per-account biometric or PIN
  // credential) for a live session. Returns false if the token is rejected.
  async function loginWithRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const r = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      await setTokens(r.data.accessToken, r.data.refreshToken ?? refreshToken);
      await refreshMe();
      return true;
    } catch {
      return false;
    }
  }

  async function enableBiometric(): Promise<void> {
    const rt = getRefreshToken();
    if (!rt) throw new Error('No active session');
    await storeBiometricToken(rt);
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* noop */
    }
    await clearTokens();
    await disableBiometricLogin();
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

  async function switchBuilding(buildingId: string) {
    const r = await api.post('/auth/switch-building', { buildingId });
    // Only the access token changes; the refresh token stays valid.
    await setTokens(r.data.accessToken, getRefreshToken());
    applyUser(r.data.user);
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const r = await api.post('/me/password', { currentPassword, newPassword });
    // Server rotates sessions; adopt the fresh pair so we stay logged in.
    if (r.data?.accessToken) await setTokens(r.data.accessToken, r.data.refreshToken ?? getRefreshToken());
    await refreshMe();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        building,
        loading,
        login,
        registerBuilding,
        loginWithBiometric,
        loginWithRefreshToken,
        enableBiometric,
        logout,
        acceptInvite,
        refreshMe,
        updateBuilding,
        switchBuilding,
        changePassword,
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
