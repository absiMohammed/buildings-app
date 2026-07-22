import AsyncStorage from '@react-native-async-storage/async-storage';

// Lightweight, non-secret record of recently used logins so users can tap to
// re-login. No passwords/tokens here — biometric secrets stay in the Keychain.
const KEY = 'ba_recent_accounts';
const MAX = 3;

export interface RecentAccount {
  /** E.164 phone, e.g. +972500000001 — the login identifier. */
  phone: string;
  /** ISO country code for restoring the picker selection. */
  iso: string;
  dial: string;
  /** National part (digits after the dial code) for prefilling the field. */
  national: string;
  /** Display name if known (falls back to the phone). */
  name?: string;
  savedAt: number;
}

export async function listRecentAccounts(): Promise<RecentAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentAccount[];
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export async function rememberAccount(acc: Omit<RecentAccount, 'savedAt'>): Promise<void> {
  try {
    const existing = await listRecentAccounts();
    const deduped = existing.filter((a) => a.phone !== acc.phone);
    const next = [{ ...acc, savedAt: Date.now() }, ...deduped].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* non-fatal */
  }
}

export async function forgetAccount(phone: string): Promise<void> {
  try {
    const existing = await listRecentAccounts();
    await AsyncStorage.setItem(KEY, JSON.stringify(existing.filter((a) => a.phone !== phone)));
  } catch {
    /* non-fatal */
  }
}
