import { useEffect, useState } from 'react';
import {
  Alert,
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
  type BiometryKind,
} from '../auth/biometric';
import { Button, Card, IconCircle } from '../components/ui';
import { palette, radii, shadow, spacing, type, textStart } from '../components/theme';
import { useT } from '../i18n';
import type { StringKey } from '../i18n/strings';

export function LoginPage() {
  const { login, loginWithBiometric, enableBiometric } = useAuth();
  const t = useT();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ identifier?: boolean; password?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [biometry, setBiometry] = useState<BiometryKind>(null);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [kind, enrolled] = await Promise.all([
        supportedBiometry(),
        hasBiometricCredentials(),
      ]);
      if (cancelled) return;
      setBiometry(kind);
      setBiometricEnrolled(enrolled);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function biometricLabelKey(kind: BiometryKind): StringKey {
    return kind === 'face' ? 'biometric_sign_in_face' : 'biometric_sign_in_fingerprint';
  }

  async function onBiometricSubmit() {
    setError(null);
    const ok = await loginWithBiometric(t('biometric_prompt_title'));
    if (!ok) {
      // Stored token was rejected (revoked/expired) — keychain has been
      // cleared, so hide the button and force a password login.
      setBiometricEnrolled(false);
      setError(t('sign_in_failed'));
    }
  }

  async function maybePromptEnrollment() {
    if (!biometry || biometricEnrolled) return;
    const messageKey: StringKey =
      biometry === 'face'
        ? 'biometric_enroll_message_face'
        : 'biometric_enroll_message_fingerprint';
    await new Promise<void>((resolve) => {
      Alert.alert(
        t('biometric_enroll_title'),
        t(messageKey),
        [
          { text: t('biometric_enroll_no'), style: 'cancel', onPress: () => resolve() },
          {
            text: t('biometric_enroll_yes'),
            onPress: async () => {
              try {
                await enableBiometric();
                setBiometricEnrolled(true);
              } catch {
                /* user cancelled the system prompt — fine */
              }
              resolve();
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve() }
      );
    });
  }

  const trimmed = identifier.trim();
  const looksLikeEmail = /.+@.+\..+/.test(trimmed);
  const looksLikePhone = /^\+?[0-9\s\-()]{6,}$/.test(trimmed);
  const identifierValid = looksLikeEmail || looksLikePhone;
  const passwordLongEnough = password.length >= 3;
  const canSubmit = identifierValid && passwordLongEnough && !submitting;

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(trimmed, password);
      // Offer enrollment after a successful password login. We resolve the
      // alert promise before this function exits so the loading state
      // stays accurate.
      await maybePromptEnrollment();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('sign_in_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kb}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <IconCircle glyph="◧" tone="accent" size={56} />
            <Text style={styles.appName}>{t('app_name')}</Text>
            <Text style={styles.tagline}>{t('app_tagline')}</Text>
          </View>

          <Card style={styles.card}>
            <Text style={[type.title, styles.cardTitle]}>{t('welcome_back')}</Text>
            <Text style={type.small}>{t('sign_in_subtitle')}</Text>

            <Text style={styles.label}>{t('email_or_mobile')}</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              onBlur={() => setTouched((t) => ({ ...t, identifier: true }))}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={looksLikePhone && !looksLikeEmail ? 'phone-pad' : 'email-address'}
              textContentType={looksLikePhone && !looksLikeEmail ? 'telephoneNumber' : 'emailAddress'}
              placeholder={t('login_identifier_placeholder')}
              placeholderTextColor={palette.textSubtle}
              style={[styles.input, touched.identifier && !identifierValid && styles.inputError]}
            />
            {touched.identifier && !identifierValid ? (
              <Text style={styles.hintError}>{t('invalid_email_or_phone')}</Text>
            ) : null}

            <Text style={styles.label}>{t('password')}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                secureTextEntry={!showPassword}
                textContentType="password"
                placeholder="••••••••"
                placeholderTextColor={palette.textSubtle}
                style={[styles.input, styles.passwordInput, touched.password && !passwordLongEnough && styles.inputError]}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((s) => !s)}
                style={styles.showBtn}
                hitSlop={8}
              >
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

            {biometricEnrolled && biometry ? (
              <TouchableOpacity
                onPress={onBiometricSubmit}
                activeOpacity={0.85}
                style={styles.biometricBtn}
              >
                <Text style={styles.biometricGlyph}>{biometry === 'face' ? '◉' : '◍'}</Text>
                <Text style={styles.biometricLabel}>{t(biometricLabelKey(biometry))}</Text>
              </TouchableOpacity>
            ) : null}
          </Card>

          <Text style={styles.footnote}>{t('new_users_invite_only')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  kb: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  appName: { ...type.display, marginTop: spacing.md },
  tagline: { ...type.small, textAlign: 'center', maxWidth: 280, marginTop: spacing.xs },
  card: { ...shadow },
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
    backgroundColor: palette.inputBg,    ...textStart,
  },
  inputError: { borderColor: palette.danger },
  hintError: { color: palette.danger, fontSize: 12, marginTop: 4 },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingEnd: 64 },
  showBtn: { position: 'absolute', end: 12, top: 12, padding: 4 },
  showText: { color: palette.accent, fontSize: 13, fontWeight: '600' },
  errorBanner: {
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
    padding: 10,
    marginTop: spacing.md,
  },
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
  footnote: { ...type.small, textAlign: 'center', marginTop: spacing.xl },
});
