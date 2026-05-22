import * as Keychain from 'react-native-keychain';

// We store only the refresh token, gated by the device's current biometric
// enrollment. If the user changes their face/fingerprint, the keychain
// item becomes inaccessible and the user falls back to password — which
// is the right behavior, since a new biometric enrollment may not be the
// original owner.
const SERVICE = 'com.buildingapp.refresh';

export type BiometryKind = 'face' | 'fingerprint' | 'iris' | null;

/**
 * What kind of biometric this device supports right now. null when there's
 * no biometric hardware OR the user hasn't enrolled anything OR the OS is
 * too old. The Login screen uses this to label the button correctly.
 */
export async function supportedBiometry(): Promise<BiometryKind> {
  try {
    const t = await Keychain.getSupportedBiometryType();
    if (t === Keychain.BIOMETRY_TYPE.FACE_ID || t === Keychain.BIOMETRY_TYPE.FACE) return 'face';
    if (
      t === Keychain.BIOMETRY_TYPE.TOUCH_ID ||
      t === Keychain.BIOMETRY_TYPE.FINGERPRINT
    )
      return 'fingerprint';
    if (t === Keychain.BIOMETRY_TYPE.IRIS) return 'iris';
    return null;
  } catch {
    return null;
  }
}

/**
 * True if a biometric-gated refresh token is stored. Checked without
 * prompting — used to decide whether to show the biometric button.
 */
export async function hasBiometricCredentials(): Promise<boolean> {
  try {
    const exists = await Keychain.hasInternetCredentials({ server: SERVICE });
    return !!exists;
  } catch {
    return false;
  }
}

/**
 * Persist the refresh token behind biometry. Subsequent `tryBiometricLogin`
 * calls will prompt the user and return this token. Throws if storage
 * fails (e.g., user declined the system biometric setup prompt).
 */
export async function enableBiometricLogin(refreshToken: string): Promise<void> {
  await Keychain.setInternetCredentials(SERVICE, 'refresh', refreshToken, {
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
  });
}

/**
 * Prompt the user for biometric, return the stored refresh token on
 * success, null on cancel / failure. Caller then exchanges the refresh
 * token for an access token via /auth/refresh.
 */
export async function tryBiometricLogin(promptTitle: string): Promise<string | null> {
  try {
    const result = await Keychain.getInternetCredentials(SERVICE, {
      authenticationPrompt: { title: promptTitle },
    });
    if (!result) return null;
    return result.password; // the refresh token
  } catch {
    return null;
  }
}

/** Drop the biometric-gated credential. Call on logout. */
export async function disableBiometricLogin(): Promise<void> {
  try {
    await Keychain.resetInternetCredentials({ server: SERVICE });
  } catch {
    /* swallow */
  }
}
