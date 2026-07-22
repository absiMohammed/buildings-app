import * as Keychain from 'react-native-keychain';

// PIN-gated quick login, as an alternative to biometrics. The refresh token
// and the PIN are stored together in the Keychain (encrypted at rest by the
// OS), keyed per account. Entering the correct PIN returns the refresh token,
// which is then exchanged for a session. After 5 wrong attempts the stored
// credential is wiped so a lost device can't be brute-forced offline.
const MAX_ATTEMPTS = 5;

function pinService(phone: string): string {
  return `com.buildingapp.pin.${phone.replace(/[^0-9]/g, '')}`;
}

interface PinRecord {
  pin: string;
  refreshToken: string;
  attempts: number;
}

async function read(phone: string): Promise<PinRecord | null> {
  try {
    const r = await Keychain.getInternetCredentials(pinService(phone));
    if (!r) return null;
    return JSON.parse(r.password) as PinRecord;
  } catch {
    return null;
  }
}

async function write(phone: string, rec: PinRecord): Promise<void> {
  await Keychain.setInternetCredentials(pinService(phone), 'pin', JSON.stringify(rec), {
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function setPinForAccount(phone: string, pin: string, refreshToken: string): Promise<void> {
  await write(phone, { pin, refreshToken, attempts: 0 });
}

export async function hasPinForAccount(phone: string): Promise<boolean> {
  try {
    return !!(await Keychain.hasInternetCredentials({ server: pinService(phone) }));
  } catch {
    return false;
  }
}

export async function disablePinForAccount(phone: string): Promise<void> {
  try {
    await Keychain.resetInternetCredentials({ server: pinService(phone) });
  } catch {
    /* swallow */
  }
}

export type PinResult =
  | { ok: true; refreshToken: string }
  | { ok: false; reason: 'no_pin' | 'wrong' | 'locked_out' };

/** Verify a PIN; on success returns the stored refresh token. */
export async function verifyPin(phone: string, pin: string): Promise<PinResult> {
  const rec = await read(phone);
  if (!rec) return { ok: false, reason: 'no_pin' };
  if (rec.pin === pin) {
    if (rec.attempts !== 0) await write(phone, { ...rec, attempts: 0 });
    return { ok: true, refreshToken: rec.refreshToken };
  }
  const attempts = rec.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await disablePinForAccount(phone);
    return { ok: false, reason: 'locked_out' };
  }
  await write(phone, { ...rec, attempts });
  return { ok: false, reason: 'wrong' };
}
