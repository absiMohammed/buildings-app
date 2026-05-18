import { useState } from 'react';
import {
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
import { Button, Card, IconCircle } from '../components/ui';
import { palette, radii, shadow, spacing, type, textStart } from '../components/theme';
import { useT } from '../i18n';

export function LoginPage() {
  const { login } = useAuth();
  const t = useT();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ identifier?: boolean; password?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmed = identifier.trim();
  const looksLikeEmail = /.+@.+\..+/.test(trimmed);
  const looksLikePhone = /^\+?[0-9\s\-()]{6,}$/.test(trimmed);
  const identifierValid = looksLikeEmail || looksLikePhone;
  const passwordLongEnough = password.length >= 8;
  const canSubmit = identifierValid && passwordLongEnough && !submitting;

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(trimmed, password);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('sign_in_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  const demoAccounts = [
    { role: t('role_admin'),     identifier: 'admin@example.com',     tone: '#4f46e5' },
    { role: t('role_owner'),     identifier: 'owner@example.com',     tone: '#059669' },
    { role: t('role_renter'),    identifier: '+972500000003',          tone: '#d97706' },
    { role: t('role_dependent'), identifier: 'dependent@example.com', tone: '#64748b' },
  ] as const;

  function fillDemo(account: typeof demoAccounts[number]) {
    setIdentifier(account.identifier);
    setPassword('ChangeMe!123');
    setTouched({ identifier: true, password: true });
    setError(null);
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

            <View style={styles.demoBlock}>
              <Text style={styles.demoHeader}>{t('try_demo_account')}</Text>
              <View style={styles.demoRow}>
                {demoAccounts.map((a) => {
                  const active = identifier === a.identifier;
                  return (
                    <TouchableOpacity
                      key={a.identifier}
                      onPress={() => fillDemo(a)}
                      activeOpacity={0.85}
                      style={[
                        styles.demoChip,
                        { borderColor: a.tone },
                        active && { backgroundColor: a.tone },
                      ]}
                    >
                      <Text style={[styles.demoChipText, { color: active ? '#fff' : a.tone }]}>
                        {a.role}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.demoHint}>{t('tap_to_fill_demo')}</Text>
            </View>
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
  demoBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.divider,
  },
  demoHeader: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    textAlign: 'center',
  },
  demoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  demoChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  demoChipText: { fontSize: 12, fontWeight: '600' },
  demoHint: { ...type.small, textAlign: 'center', marginTop: spacing.sm, fontSize: 11 },
  footnote: { ...type.small, textAlign: 'center', marginTop: spacing.xl },
});
