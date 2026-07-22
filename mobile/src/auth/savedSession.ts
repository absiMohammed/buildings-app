import * as Keychain from 'react-native-keychain';

// Per-account "keep me signed in" token. On a successful password login we
// stash that account's refresh token here (Keychain, device-only, NOT biometric
// gated) so tapping the saved-account card on the login screen logs straight in
// without retyping the password — the behaviour users expect from other apps.
// Biometric / PIN (see biometric.ts / pin.ts) are optional stronger gates layered
// on top; this is the baseline convenience.
function sessionService(phone: string): string {
  return `com.buildingapp.session.${phone.replace(/[^0-9]/g, '')}`;
}

export async function saveSessionToken(phone: string, refreshToken: string): Promise<void> {
  try {
    await Keychain.setInternetCredentials(sessionService(phone), 'session', refreshToken, {
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    /* non-fatal */
  }
}

export async function getSessionToken(phone: string): Promise<string | null> {
  try {
    const r = await Keychain.getInternetCredentials(sessionService(phone));
    return r ? r.password : null;
  } catch {
    return null;
  }
}

export async function hasSessionToken(phone: string): Promise<boolean> {
  try {
    return !!(await Keychain.hasInternetCredentials({ server: sessionService(phone) }));
  } catch {
    return false;
  }
}

export async function clearSessionToken(phone: string): Promise<void> {
  try {
    await Keychain.resetInternetCredentials({ server: sessionService(phone) });
  } catch {
    /* non-fatal */
  }
}
