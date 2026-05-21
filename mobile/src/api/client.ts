import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ACCESS_KEY = 'ba_access';
const REFRESH_KEY = 'ba_refresh';

// Dev: server listens on :4000 (server/src/config/env.ts). iOS sim hits
// localhost; Android emulator routes host localhost via 10.0.2.2.
// Release builds talk to the Render-hosted API.
const DEV_HOST = Platform.select({ ios: 'http://localhost:4000', android: 'http://10.0.2.2:4000' });
const PROD_HOST = 'https://building-app-server.onrender.com';
export const API_BASE_URL = `${__DEV__ ? DEV_HOST : PROD_HOST}/api/v1`;

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}
export function getRefreshToken(): string | null {
  return refreshToken;
}

export async function loadTokens(): Promise<void> {
  const [a, r] = await AsyncStorage.multiGet([ACCESS_KEY, REFRESH_KEY]);
  accessToken = a[1];
  refreshToken = r[1];
}

export async function setTokens(access: string | null, refresh?: string | null): Promise<void> {
  accessToken = access;
  if (access) await AsyncStorage.setItem(ACCESS_KEY, access);
  else await AsyncStorage.removeItem(ACCESS_KEY);
  if (refresh !== undefined) {
    refreshToken = refresh;
    if (refresh) await AsyncStorage.setItem(REFRESH_KEY, refresh);
    else await AsyncStorage.removeItem(REFRESH_KEY);
  }
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<string> | null = null;

async function refreshAccess(): Promise<string> {
  if (!refreshToken) throw new Error('No refresh token');
  const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
  const access = res.data.accessToken as string;
  await setTokens(access);
  return access;
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as (typeof err.config) & { _retry?: boolean };
    if (
      err.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/')
    ) {
      original._retry = true;
      try {
        if (!refreshing) refreshing = refreshAccess().finally(() => (refreshing = null));
        const newAccess = await refreshing;
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`;
        return api.request(original);
      } catch {
        await clearTokens();
      }
    }
    return Promise.reject(err);
  }
);
