import { useMemo, useState } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, IconCircle, ProgressBar } from '../components/ui';
import { palette, radii, shadow, spacing, type, textStart } from '../components/theme';
import type { AuthStackParamList } from '../navigation/types';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

type Props = NativeStackScreenProps<AuthStackParamList, 'AcceptInvite'>;

type Step = 0 | 1 | 2;

function strengthScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 4);
}

const STRENGTH_KEYS: StringKey[] = [
  'invite_strength_0',
  'invite_strength_1',
  'invite_strength_2',
  'invite_strength_3',
  'invite_strength_4',
];
const strengthTones: Array<'danger' | 'warning' | 'accent' | 'positive'> = ['danger', 'danger', 'warning', 'accent', 'positive'];

export function AcceptInvitePage({ route }: Props) {
  const token = route.params?.token ?? '';
  const { acceptInvite } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useI18n();

  const score = useMemo(() => strengthScore(password), [password]);
  const canNameContinue = firstName.trim().length > 0 && lastName.trim().length > 0;
  const canFinish = password.length >= 8 && canNameContinue;

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await acceptInvite(token, password, { firstName: firstName.trim(), lastName: lastName.trim() });
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('invite_could_not'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.invalid}>
          <IconCircle glyph="!" tone="danger" size={56} />
          <Text style={[type.title, styles.invalidTitle]}>{t('invite_invalid_title')}</Text>
          <Text style={[type.small, styles.invalidBody]}>
            {t('invite_invalid_body')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kb}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <IconCircle glyph="✓" tone="accent" size={56} />
            <Text style={[type.title, styles.heroTitle]}>{t('invite_almost_there')}</Text>
            <Text style={[type.small, styles.heroBody]}>{t('invite_three_steps')}</Text>
          </View>

          <Steps current={step} />

          <Card style={styles.card}>
            {step === 0 && <StepVerify onContinue={() => setStep(1)} />}
            {step === 1 && (
              <StepName
                firstName={firstName}
                lastName={lastName}
                onFirst={setFirstName}
                onLast={setLastName}
                canContinue={canNameContinue}
                onContinue={() => setStep(2)}
                onBack={() => setStep(0)}
              />
            )}
            {step === 2 && (
              <StepPassword
                password={password}
                onPassword={setPassword}
                showPassword={showPassword}
                onToggleShow={() => setShowPassword((s) => !s)}
                score={score}
                error={error}
                submitting={submitting}
                canFinish={canFinish}
                onBack={() => setStep(1)}
                onFinish={onSubmit}
              />
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Steps({ current }: { current: Step }) {
  const { t } = useI18n();
  const labels = [t('invite_step_verify'), t('invite_step_name'), t('invite_step_password')];
  return (
    <View style={stepStyles.row}>
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={label} style={stepStyles.item}>
            <View
              style={[
                stepStyles.dot,
                done && stepStyles.dotDone,
                active && stepStyles.dotActive,
              ]}
            >
              <Text style={[stepStyles.dotLabel, (done || active) && stepStyles.dotLabelActive]}>
                {done ? '✓' : i + 1}
              </Text>
            </View>
            <Text style={[stepStyles.label, active && stepStyles.labelActive]}>{label}</Text>
            {i < labels.length - 1 && <View style={[stepStyles.bar, done && stepStyles.barDone]} />}
          </View>
        );
      })}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, paddingHorizontal: spacing.xs },
  item: { alignItems: 'center', flex: 1 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.border,
  },
  dotActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  dotDone: { backgroundColor: palette.success, borderColor: palette.success },
  dotLabel: { color: palette.textSubtle, fontSize: 12, fontWeight: '700' },
  dotLabelActive: { color: '#fff' },
  label: { color: palette.textSubtle, fontSize: 11, marginTop: 4 },
  labelActive: { color: palette.text, fontWeight: '600' },
  bar: { position: 'absolute', top: 14, start: '60%', end: '-40%', height: 2, backgroundColor: palette.border, zIndex: -1 },
  barDone: { backgroundColor: palette.success },
});

function StepVerify({ onContinue }: { onContinue: () => void }) {
  const { t } = useI18n();
  return (
    <View>
      <Text style={[type.heading, styles.stepTitle]}>{t('invite_verify_title')}</Text>
      <Text style={type.small}>
        {t('invite_verify_body')}
      </Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>{t('invite_token_label')}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>
          {t('invite_verified')}
        </Text>
      </View>
      <Button label={t('invite_continue')} onPress={onContinue} style={styles.primary} />
    </View>
  );
}

function StepName({
  firstName,
  lastName,
  onFirst,
  onLast,
  canContinue,
  onContinue,
  onBack,
}: {
  firstName: string;
  lastName: string;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
  canContinue: boolean;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  return (
    <View>
      <Text style={[type.heading, styles.stepTitle]}>{t('invite_name_title')}</Text>
      <Text style={type.small}>{t('invite_name_body')}</Text>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>{t('invite_first_name')}</Text>
          <TextInput
            value={firstName}
            onChangeText={onFirst}
            autoCapitalize="words"
            placeholder={t('invite_first_name_ph')}
            placeholderTextColor={palette.textSubtle}
            style={styles.input}
          />
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>{t('invite_last_name')}</Text>
          <TextInput
            value={lastName}
            onChangeText={onLast}
            autoCapitalize="words"
            placeholder={t('invite_last_name_ph')}
            placeholderTextColor={palette.textSubtle}
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Button label={t('invite_back')} variant="secondary" onPress={onBack} style={styles.actionBtn} />
        <Button label={t('invite_continue')} onPress={onContinue} disabled={!canContinue} style={styles.actionBtn} />
      </View>
    </View>
  );
}

function StepPassword({
  password,
  onPassword,
  showPassword,
  onToggleShow,
  score,
  error,
  submitting,
  canFinish,
  onBack,
  onFinish,
}: {
  password: string;
  onPassword: (v: string) => void;
  showPassword: boolean;
  onToggleShow: () => void;
  score: number;
  error: string | null;
  submitting: boolean;
  canFinish: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  return (
    <View>
      <Text style={[type.heading, styles.stepTitle]}>{t('invite_password_title')}</Text>
      <Text style={type.small}>{t('invite_password_body')}</Text>

      <Text style={styles.label}>{t('password')}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          value={password}
          onChangeText={onPassword}
          secureTextEntry={!showPassword}
          placeholder="••••••••"
          placeholderTextColor={palette.textSubtle}
          textContentType="newPassword"
          style={[styles.input, styles.passwordInput]}
        />
        <TouchableOpacity onPress={onToggleShow} style={styles.showBtn} hitSlop={8}>
          <Text style={styles.showText}>{showPassword ? t('hide') : t('show')}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: spacing.md }}>
        <ProgressBar value={score} max={4} tone={strengthTones[score]} />
        <Text style={[type.small, { marginTop: 4 }]}>{t('invite_strength_label')}{t(STRENGTH_KEYS[score])}</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <Button label={t('invite_back')} variant="secondary" onPress={onBack} style={styles.actionBtn} />
        <Button
          label={submitting ? t('invite_activating') : t('invite_activate')}
          onPress={onFinish}
          disabled={!canFinish}
          loading={submitting}
          style={styles.actionBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  kb: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  heroTitle: { marginTop: spacing.md },
  heroBody: { textAlign: 'center', maxWidth: 260, marginTop: 4 },
  card: { ...shadow },
  stepTitle: { marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  col: { flex: 1 },
  label: { ...type.small, color: palette.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
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
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  actionBtn: { flex: 1 },
  primary: { marginTop: spacing.xl },
  infoBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: palette.successSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  infoLabel: { color: palette.success, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValue: { color: palette.success, fontSize: 15, fontWeight: '600', marginTop: 2 },
  invalid: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  invalidTitle: { textAlign: 'center' },
  invalidBody: { textAlign: 'center', maxWidth: 280 },
});
