import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import {
  hasBiometricCredentials,
  supportedBiometry,
  enableBiometricForAccount,
  hasBiometricForAccount,
  tryBiometricForAccount,
  type BiometryKind,
} from '../auth/biometric';
import { hasPinForAccount, verifyPin } from '../auth/pin';
import { saveSessionToken, getSessionToken, hasSessionToken, clearSessionToken } from '../auth/savedSession';
import { getRefreshToken } from '../api/client';
import { Button, Card } from '../components/ui';
import { PinModal } from '../components/PinModal';
import { Icon } from '../components/Icon';
import { useConfirm } from '../components/ConfirmProvider';
import { CountryPicker } from '../components/CountryPicker';
import { DEFAULT_COUNTRY, findCountryByIso, type Country } from '../data/countries';
import {
  forgetAccount,
  listRecentAccounts,
  rememberAccount,
  type RecentAccount,
} from '../data/recentAccounts';
import { ltrPhone, palette, radii, shadow, spacing, type } from '../components/theme';
import { useT } from '../i18n';
import type { StringKey } from '../i18n/strings';

const digitsOnly = (s: string) => s.replace(/[^0-9]/g, '');

export function LoginPage() {
  const { login, loginWithBiometric, loginWithRefreshToken } = useAuth();
  const { confirm } = useConfirm();
  const t = useT();
  const passwordRef = useRef<TextInput>(null);

  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [touched, setTouched] = useState<{ phone?: boolean; password?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [biometry, setBiometry] = useState<BiometryKind>(null);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [recent, setRecent] = useState<RecentAccount[]>([]);
  // Which quick-login credentials each saved account has: phone → {bio, pin, session}.
  const [creds, setCreds] = useState<Record<string, { bio: boolean; pin: boolean; session: boolean }>>({});
  const [pinTarget, setPinTarget] = useState<RecentAccount | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const refreshCreds = async (accounts: RecentAccount[]) => {
    const entries = await Promise.all(
      accounts.map(async (a) => [a.phone, {
        bio: await hasBiometricForAccount(a.phone),
        pin: await hasPinForAccount(a.phone),
        session: await hasSessionToken(a.phone),
      }] as const),
    );
    setCreds(Object.fromEntries(entries));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [kind, enrolled, accounts] = await Promise.all([
        supportedBiometry(),
        hasBiometricCredentials(),
        listRecentAccounts(),
      ]);
      if (cancelled) return;
      setBiometry(kind);
      setBiometricEnrolled(enrolled);
      setRecent(accounts);
      await refreshCreds(accounts);
      // Restore the most recent account's country so the picker starts sensibly.
      if (accounts[0]) {
        const c = findCountryByIso(accounts[0].iso);
        if (c) setCountry(c);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function biometricLabelKey(kind: BiometryKind): StringKey {
    return kind === 'face' ? 'biometric_sign_in_face' : 'biometric_sign_in_fingerprint';
  }

  const nationalDigits = digitsOnly(national);
  const phoneValid = nationalDigits.length >= 6;
  const identifier = `${country.dial}${nationalDigits}`;
  const passwordLongEnough = password.length >= 3;
  const canSubmit = phoneValid && passwordLongEnough && !submitting;

  async function onBiometricSubmit() {
    setError(null);
    const ok = await loginWithBiometric(t('biometric_prompt_title'));
    if (!ok) {
      setBiometricEnrolled(false);
      setError(t('sign_in_failed'));
    }
  }

  // Quick-login a specific saved account via its per-account biometric.
  async function quickBiometric(acc: RecentAccount) {
    setError(null);
    const token = await tryBiometricForAccount(acc.phone, t('biometric_prompt_title'));
    if (!token) return;
    const ok = await loginWithRefreshToken(token);
    if (!ok) setError(t('sign_in_failed'));
  }

  // Verify an entered PIN for the target account, then exchange its token.
  async function onPinSubmit(pin: string) {
    if (!pinTarget) return;
    setPinError(null);
    const res = await verifyPin(pinTarget.phone, pin);
    if (!res.ok) {
      if (res.reason === 'locked_out') {
        setPinTarget(null);
        setError(t('pin_locked_out'));
        await refreshCreds(await listRecentAccounts());
      } else {
        setPinError(t('pin_wrong'));
      }
      return;
    }
    const ok = await loginWithRefreshToken(res.refreshToken);
    setPinTarget(null);
    if (!ok) setError(t('sign_in_failed'));
  }

  // After a password login, offer to enable per-account biometric quick-login.
  async function maybePromptEnrollment() {
    if (!biometry) return;
    if (await hasBiometricForAccount(identifier)) return;
    const messageKey: StringKey =
      biometry === 'face'
        ? 'biometric_enroll_message_face'
        : 'biometric_enroll_message_fingerprint';
    const ok = await confirm({
      title: t('biometric_enroll_title'),
      message: t(messageKey),
      confirmLabel: t('biometric_enroll_yes'),
      cancelLabel: t('biometric_enroll_no'),
    });
    if (ok) {
      try {
        const rt = getRefreshToken();
        if (rt) await enableBiometricForAccount(identifier, rt);
      } catch {
        /* user cancelled the system prompt */
      }
    }
  }

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(identifier, password);
      // The system super-admin is a cross-application account — never cache it
      // in the device's recent-accounts card or offer biometric/PIN quick-login
      // for it. Only building-scoped users get the saved-login convenience.
      if (signedIn.role !== 'admin') {
        const name = `${signedIn.firstName ?? ''} ${signedIn.lastName ?? ''}`.trim() || undefined;
        await rememberAccount({ phone: identifier, iso: country.iso, dial: country.dial, national: nationalDigits, name });
        // Persist a "keep me signed in" token so a tap on this account re-logs
        // in directly next time (no password), like other apps.
        const rt = getRefreshToken();
        if (rt) await saveSessionToken(identifier, rt);
        await maybePromptEnrollment();
      } else {
        // Never keep the super-admin in the device's saved logins — purge any
        // stale entry left over from before this rule existed.
        await forgetAccount(identifier);
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('sign_in_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  // Tapping a saved account signs in directly when a credential is stored
  // (biometric prompt or PIN entry). If nothing is saved for it, fall back to
  // prefilling the phone and focusing the password field.
  function selectRecent(acc: RecentAccount) {
    const cred = creds[acc.phone];
    if (cred?.bio && biometry) {
      void quickBiometric(acc);
      return;
    }
    if (cred?.pin) {
      setPinError(null);
      setPinTarget(acc);
      return;
    }
    if (cred?.session) {
      void directSessionLogin(acc);
      return;
    }
    const c = findCountryByIso(acc.iso) ?? country;
    setCountry(c);
    setNational(acc.national);
    setError(null);
    setTimeout(() => passwordRef.current?.focus(), 50);
  }

  // Sign in straight away using the stored per-account session token.
  async function directSessionLogin(acc: RecentAccount) {
    setError(null);
    const token = await getSessionToken(acc.phone);
    if (!token) return;
    const ok = await loginWithRefreshToken(token);
    if (!ok) {
      // Token expired/revoked — clear it and fall back to password entry.
      await clearSessionToken(acc.phone);
      await refreshCreds(await listRecentAccounts());
      const c = findCountryByIso(acc.iso) ?? country;
      setCountry(c);
      setNational(acc.national);
      setError(t('session_expired_sign_in'));
      setTimeout(() => passwordRef.current?.focus(), 50);
    }
  }

  async function removeRecent(phone: string) {
    await forgetAccount(phone);
    await clearSessionToken(phone);
    setRecent(await listRecentAccounts());
    await refreshCreds(await listRecentAccounts());
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kb}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image
              source={require('../../assets/logo-full.png')}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityLabel={t('app_name')}
            />
          </View>

          {recent.length > 0 ? (
            <Card style={styles.card}>
              <Text style={[type.title, styles.cardTitle]}>{t('login_recent_title')}</Text>
              <Text style={type.small}>{t('login_recent_subtitle')}</Text>
              <View style={styles.recentList}>
                {recent.map((acc) => {
                  const c = findCountryByIso(acc.iso);
                  const cred = creds[acc.phone];
                  const hasName = !!acc.name?.trim();
                  const display = hasName ? acc.name!.trim() : ltrPhone(acc.phone);
                  const initials = (acc.name?.trim() || '')
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <TouchableOpacity
                      key={acc.phone}
                      style={styles.recentRow}
                      activeOpacity={0.75}
                      onPress={() => selectRecent(acc)}
                    >
                      <View style={styles.recentAvatar}>
                        {initials ? (
                          <Text style={styles.recentInitials}>{initials}</Text>
                        ) : (
                          <Icon name="user" size={22} color={palette.accent} />
                        )}
                      </View>
                      <View style={styles.recentInfo}>
                        <View style={styles.recentSub}>
                          <Text style={styles.recentFlag}>{c?.flag ?? ''}</Text>
                          <Text style={styles.recentName} numberOfLines={1}>{display}</Text>
                        </View>
                        {hasName ? (
                          <Text style={styles.recentPhone} numberOfLines={1}>{ltrPhone(acc.phone)}</Text>
                        ) : null}
                      </View>
                      {cred?.bio && biometry ? (
                        <View style={styles.recentAction}>
                          <Icon name={biometry === 'face' ? 'faceId' : 'fingerprint'} size={22} color={palette.accent} />
                        </View>
                      ) : cred?.pin ? (
                        <View style={styles.recentPinChip}>
                          <Text style={styles.recentPinText}>{t('login_pin_button')}</Text>
                        </View>
                      ) : (
                        <Icon name="chevronRight" size={20} color={palette.textSubtle} />
                      )}
                      <TouchableOpacity onPress={() => removeRecent(acc.phone)} hitSlop={10} style={styles.recentRemove}>
                        <Icon name="close" size={16} color={palette.textSubtle} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {biometricEnrolled && biometry ? (
                <TouchableOpacity onPress={onBiometricSubmit} activeOpacity={0.85} style={styles.biometricBtn}>
                  <Icon name={biometry === 'face' ? 'faceId' : 'fingerprint'} size={18} color={palette.accent} />
                  <Text style={styles.biometricLabel}>{t(biometricLabelKey(biometry))}</Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          ) : null}

          <Card style={styles.card}>
            <Text style={[type.title, styles.cardTitle]}>{t('welcome_back')}</Text>
            <Text style={type.small}>{t('sign_in_subtitle')}</Text>

            <Text style={styles.label}>{t('login_phone_label')}</Text>
            {/* Forced LTR so the flag+code sits left and the number sits right,
                identically in English and Arabic. */}
            <View style={styles.phoneRow}>
              <TouchableOpacity
                style={styles.countryBtn}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.countryFlag}>{country.flag}</Text>
                <Text style={styles.countryDial}>{country.dial}</Text>
                <Text style={styles.countryCaret}>▾</Text>
              </TouchableOpacity>
              <TextInput
                value={national}
                onChangeText={setNational}
                onBlur={() => setTouched((s) => ({ ...s, phone: true }))}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder={t('login_phone_placeholder')}
                placeholderTextColor={palette.textSubtle}
                style={[styles.phoneInput, touched.phone && !phoneValid && styles.inputError]}
              />
            </View>
            {touched.phone && !phoneValid ? (
              <Text style={styles.hintError}>{t('invalid_phone')}</Text>
            ) : null}

            <Text style={styles.label}>{t('password')}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                onBlur={() => setTouched((s) => ({ ...s, password: true }))}
                secureTextEntry={!showPassword}
                textContentType="password"
                placeholder="••••••••"
                placeholderTextColor={palette.textSubtle}
                style={[styles.input, styles.passwordInput, touched.password && !passwordLongEnough && styles.inputError]}
              />
              <TouchableOpacity onPress={() => setShowPassword((s) => !s)} style={styles.showBtn} hitSlop={8}>
                <Text style={styles.showText}>{showPassword ? t('hide') : t('show')}</Text>
              </TouchableOpacity>
            </View>
            {touched.password && !passwordLongEnough ? (
              <Text style={styles.hintError}>{t('password_too_short')}</Text>
            ) : null}

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Button
              label={submitting ? t('signing_in') : t('sign_in')}
              onPress={onSubmit}
              disabled={!canSubmit}
              loading={submitting}
              style={styles.submit}
            />

            {recent.length === 0 && biometricEnrolled && biometry ? (
              <TouchableOpacity onPress={onBiometricSubmit} activeOpacity={0.85} style={styles.biometricBtn}>
                <Icon name={biometry === 'face' ? 'faceId' : 'fingerprint'} size={18} color={palette.accent} />
                <Text style={styles.biometricLabel}>{t(biometricLabelKey(biometry))}</Text>
              </TouchableOpacity>
            ) : null}
          </Card>

          <Text style={styles.footnote}>{t('new_users_invite_only')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <CountryPicker
        visible={pickerOpen}
        selectedIso={country.iso}
        onSelect={setCountry}
        onClose={() => setPickerOpen(false)}
      />

      <PinModal
        visible={!!pinTarget}
        mode="enter"
        title={t('login_pin_title')}
        error={pinError}
        onSubmit={onPinSubmit}
        onClose={() => setPinTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  kb: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  logo: { width: 200, height: 200 },
  card: { ...shadow, marginBottom: spacing.lg },
  cardTitle: { marginBottom: spacing.xs },
  label: { ...type.small, color: palette.textMuted, marginTop: spacing.lg, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
  },
  inputError: { borderColor: palette.danger },
  hintError: { color: palette.danger, fontSize: 12, marginTop: 4 },
  // Phone row is always left-to-right: [flag +code] then the number.
  phoneRow: { flexDirection: 'row', direction: 'ltr', gap: spacing.sm },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: palette.inputBg,
  },
  countryFlag: { fontSize: 20 },
  countryDial: { fontSize: 15, color: palette.text, fontVariant: ['tabular-nums'] },
  countryCaret: { fontSize: 11, color: palette.textSubtle },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingEnd: 64 },
  showBtn: { position: 'absolute', end: 12, top: 12, padding: 4 },
  showText: { color: palette.accent, fontSize: 13, fontWeight: '600' },
  errorBanner: { backgroundColor: palette.dangerSoft, borderRadius: radii.md, padding: 10, marginTop: spacing.md },
  errorText: { color: palette.danger, fontSize: 13 },
  submit: { marginTop: spacing.lg },
  biometricBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  biometricGlyph: { fontSize: 18, color: palette.accent },
  biometricLabel: { fontSize: 14, fontWeight: '600', color: palette.accent },
  recentList: { marginTop: spacing.md, gap: spacing.sm },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...shadow,
  },
  recentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentInitials: { color: palette.accent, fontWeight: '800', fontSize: 16 },
  recentInfo: { flex: 1, gap: 2 },
  recentName: { ...type.body, fontWeight: '700', color: palette.text },
  recentSub: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recentFlag: { fontSize: 15 },
  recentPhone: { ...type.small, color: palette.textMuted },
  recentAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentPinChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: palette.accentSoft,
  },
  recentPinText: { fontSize: 13, fontWeight: '700', color: palette.accent },
  recentRemove: { padding: 6 },
  footnote: { ...type.small, textAlign: 'center', marginTop: spacing.md },
});
