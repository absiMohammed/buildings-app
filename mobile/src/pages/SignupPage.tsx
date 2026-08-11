import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { useAuth } from '../auth/AuthContext';
import { CountryPicker } from '../components/CountryPicker';
import { Icon, type IconName } from '../components/Icon';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import { DEFAULT_COUNTRY, type Country } from '../data/countries';
import { useT } from '../i18n';
import type { StringKey } from '../i18n/strings';

const digitsOnly = (s: string) => s.replace(/[^0-9]/g, '');

/** Currencies offered at signup — building can change later in settings. */
const CURRENCIES = ['ILS', 'USD', 'JOD', 'EGP', 'SAR', 'AED'];

interface StepDef {
  icon: IconName;
  titleKey: StringKey;
}

const STEPS: StepDef[] = [
  { icon: 'user', titleKey: 'signup_step_account' },
  { icon: 'buildings', titleKey: 'signup_step_building' },
  { icon: 'key', titleKey: 'signup_step_apartment' },
  { icon: 'sparkles', titleKey: 'signup_step_review' },
];

export function SignupPage() {
  const { registerBuilding } = useAuth();
  const t = useT();
  const navigation = useNavigation();

  const [step, setStep] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  // Step 1 — account
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 — building
  const [buildingName, setBuildingName] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [stories, setStories] = useState(4);

  // Step 3 — apartment
  const [aptNumber, setAptNumber] = useState('');
  const [aptFloor, setAptFloor] = useState(1);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nationalDigits = digitsOnly(national);
  const phone = `${country.dial}${nationalDigits}`;
  const emailTrimmed = email.trim();
  const emailValid = emailTrimmed === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return (
          firstName.trim().length > 0 &&
          lastName.trim().length > 0 &&
          nationalDigits.length >= 6 &&
          emailValid &&
          password.length >= 8 &&
          confirm === password
        );
      case 1:
        return buildingName.trim().length >= 2 && stories >= 1;
      case 2:
        return aptNumber.trim().length > 0;
      default:
        return true;
    }
  }, [step, firstName, lastName, nationalDigits, emailValid, password, confirm, buildingName, stories, aptNumber]);

  function goTo(next: number) {
    setError(null);
    setStep(next);
    Animated.spring(progress, {
      toValue: next,
      useNativeDriver: false,
      friction: 9,
      tension: 80,
    }).start();
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await registerBuilding({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone,
        ...(emailTrimmed ? { email: emailTrimmed } : {}),
        password,
        building: {
          name: buildingName.trim(),
          address: address.trim() || undefined,
          currency,
          stories,
        },
        apartment: { number: aptNumber.trim(), floor: aptFloor },
      });
      // Success: AuthContext user state flips and RootNavigator swaps stacks.
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message
        : undefined;
      setError(msg ?? t('signup_error_generic'));
      setSubmitting(false);
    }
  }

  const pct = progress.interpolate({
    inputRange: [0, STEPS.length - 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Gradient header with step indicator */}
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={['#4f46e5', '#7c3aed', '#ec4899']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroTop}>
          <TouchableOpacity
            onPress={() => (step === 0 ? navigation.goBack() : goTo(step - 1))}
            style={styles.heroBack}
            hitSlop={8}
          >
            <Icon name={I18nManager.isRTL ? 'chevronRight' : 'chevronLeft'} size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>{t('signup_title')}</Text>
          <View style={styles.heroBack} />
        </View>

        <View style={styles.stepsRow}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <View key={s.titleKey} style={styles.stepCell}>
                <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                  <Icon name={done ? 'check' : s.icon} size={15} color={active || done ? palette.accent : 'rgba(255,255,255,0.9)'} strokeWidth={2.6} />
                </View>
                <Text style={[styles.stepLabel, (active || done) && styles.stepLabelActive]} numberOfLines={1}>
                  {t(s.titleKey)}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: pct }]} />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kb}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <SectionTitle icon="user" title={t('signup_step_account')} subtitle={t('signup_account_subtitle')} />
              <View style={styles.rowPair}>
                <Field style={styles.rowHalf} label={t('signup_first_name')} value={firstName} onChangeText={setFirstName} textContentType="givenName" />
                <Field style={styles.rowHalf} label={t('signup_last_name')} value={lastName} onChangeText={setLastName} textContentType="familyName" />
              </View>

              <Text style={styles.label}>{t('login_phone_label')}</Text>
              <View style={styles.phoneRow}>
                <TouchableOpacity style={styles.countryBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
                  <Text style={styles.countryFlag}>{country.flag}</Text>
                  <Text style={styles.countryDial}>{country.dial}</Text>
                </TouchableOpacity>
                <TextInput
                  value={national}
                  onChangeText={setNational}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  placeholder={t('login_phone_placeholder')}
                  placeholderTextColor={palette.textSubtle}
                  style={styles.phoneInput}
                />
              </View>

              <Field label={t('signup_email_optional')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" error={!emailValid ? t('signup_email_invalid') : undefined} />
              <Field
                label={t('password')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textContentType="newPassword"
                trailing={
                  <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                    <Text style={styles.showText}>{showPassword ? t('hide') : t('show')}</Text>
                  </TouchableOpacity>
                }
                error={password.length > 0 && password.length < 8 ? t('password_too_short') : undefined}
              />
              <Field
                label={t('signup_password_confirm')}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPassword}
                error={confirm.length > 0 && confirm !== password ? t('signup_password_mismatch') : undefined}
              />
            </View>
          )}

          {step === 1 && (
            <View>
              <SectionTitle icon="buildings" title={t('signup_step_building')} subtitle={t('signup_building_subtitle')} />
              <Field label={t('signup_building_name')} value={buildingName} onChangeText={setBuildingName} />
              <Field label={t('signup_building_address')} value={address} onChangeText={setAddress} />

              <Text style={styles.label}>{t('signup_currency')}</Text>
              <View style={styles.chipsRow}>
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCurrency(c)}
                    style={[styles.chip, currency === c && styles.chipActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <NumberStepper
                label={t('signup_stories')}
                hint={t('signup_stories_hint')}
                value={stories}
                min={1}
                max={200}
                onChange={setStories}
              />
            </View>
          )}

          {step === 2 && (
            <View>
              <SectionTitle icon="key" title={t('signup_step_apartment')} subtitle={t('signup_apartment_hint')} />
              <Field label={t('signup_apartment_number')} value={aptNumber} onChangeText={setAptNumber} />
              <NumberStepper
                label={t('signup_apartment_floor')}
                value={aptFloor}
                min={0}
                max={stories}
                onChange={setAptFloor}
              />
            </View>
          )}

          {step === 3 && (
            <View>
              <SectionTitle icon="sparkles" title={t('signup_step_review')} subtitle={t('signup_review_subtitle')} />

              {/* Trial banner */}
              <View style={styles.trialCard}>
                <LinearGradient
                  colors={['#4f46e5', '#7c3aed']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.trialIcon}>
                  <Icon name="sparkles" size={22} color="#fff" strokeWidth={2.4} />
                </View>
                <View style={styles.trialText}>
                  <Text style={styles.trialTitle}>{t('signup_trial_title')}</Text>
                  <Text style={styles.trialBody}>{t('signup_trial_body')}</Text>
                </View>
              </View>

              <ReviewCard
                icon="user"
                title={t('signup_review_account')}
                lines={[`${firstName.trim()} ${lastName.trim()}`, phone, emailTrimmed].filter(Boolean)}
              />
              <ReviewCard
                icon="buildings"
                title={t('signup_review_building')}
                lines={[
                  buildingName.trim(),
                  address.trim(),
                  `${t('signup_stories')}: ${stories} · ${currency}`,
                ].filter(Boolean)}
              />
              <ReviewCard
                icon="key"
                title={t('signup_review_apartment')}
                lines={[`${t('signup_apartment_number')}: ${aptNumber.trim()}`, `${t('signup_apartment_floor')}: ${aptFloor}`]}
              />
            </View>
          )}

          {error ? (
            <View style={styles.errorBanner}>
              <Icon name="warning" size={16} color={palette.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Footer nav */}
        <View style={styles.footer}>
          {step > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={() => goTo(step - 1)} activeOpacity={0.8}>
              <Text style={styles.backText}>{t('signup_back')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtn} />
          )}
          <TouchableOpacity
            style={[styles.nextBtn, (!stepValid || submitting) && styles.nextBtnDisabled]}
            disabled={!stepValid || submitting}
            onPress={() => (step < STEPS.length - 1 ? goTo(step + 1) : void onSubmit())}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#6366f1', '#4f46e5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.nextText}>
              {step < STEPS.length - 1
                ? t('signup_next')
                : submitting
                  ? t('signup_creating')
                  : t('signup_create')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <CountryPicker
        visible={pickerOpen}
        selectedIso={country.iso}
        onSelect={setCountry}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.sectionIcon}>
        <Icon name={icon} size={20} color={palette.accent} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.heading}>{title}</Text>
        {subtitle ? <Text style={type.small}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function Field({
  label,
  error,
  trailing,
  style,
  ...inputProps
}: {
  label: string;
  error?: string;
  trailing?: React.ReactNode;
  style?: object;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={palette.textSubtle}
          {...inputProps}
          style={[styles.input, error ? styles.inputError : null]}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {error ? <Text style={styles.hintError}>{error}</Text> : null}
    </View>
  );
}

/** +/- control for small integers (stories, floor). */
function NumberStepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          hitSlop={6}
        >
          <Text style={styles.stepperSign}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity
          style={[styles.stepperBtn, value >= max && styles.stepperBtnDisabled]}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          hitSlop={6}
        >
          <Text style={styles.stepperSign}>+</Text>
        </TouchableOpacity>
      </View>
      {hint ? <Text style={[type.small, styles.stepperHint]}>{hint}</Text> : null}
    </View>
  );
}

function ReviewCard({ icon, title, lines }: { icon: IconName; title: string; lines: string[] }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewIcon}>
        <Icon name={icon} size={18} color={palette.accent} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, styles.reviewTitle]}>{title}</Text>
        {lines.map((l) => (
          <Text key={l} style={type.small} numberOfLines={1}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const FIELD_RADIUS = 12;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  kb: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  heroWrap: { overflow: 'hidden', paddingBottom: spacing.md },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  heroBack: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },

  stepsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  stepCell: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: '#fff', borderColor: '#fff' },
  stepDotDone: { backgroundColor: '#fff', borderColor: '#fff' },
  stepLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '600' },
  stepLabelActive: { color: '#fff', fontWeight: '800' },

  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#fff' },

  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: { ...type.small, fontWeight: '700', color: palette.textMuted, marginTop: spacing.md, marginBottom: 6 },
  rowPair: { flexDirection: 'row', gap: spacing.md },
  rowHalf: { flex: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    backgroundColor: palette.inputBg,
    borderRadius: FIELD_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.text,
  },
  inputError: { borderColor: palette.danger },
  trailing: { position: 'absolute', end: 12 },
  showText: { color: palette.accent, fontWeight: '700', fontSize: 13 },
  hintError: { color: palette.danger, fontSize: 12, marginTop: 4 },

  phoneRow: { flexDirection: 'row', direction: 'ltr', gap: spacing.sm },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    backgroundColor: palette.inputBg,
    borderRadius: FIELD_RADIUS,
    paddingHorizontal: 12,
  },
  countryFlag: { fontSize: 18 },
  countryDial: { fontSize: 15, color: palette.text, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    backgroundColor: palette.inputBg,
    borderRadius: FIELD_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.text,
  },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: palette.textMuted },
  chipTextActive: { color: '#fff' },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    borderRadius: FIELD_RADIUS,
    padding: 8,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperSign: { fontSize: 22, fontWeight: '800', color: palette.accent },
  stepperValue: { fontSize: 22, fontWeight: '800', color: palette.text },
  stepperHint: { marginTop: 6 },

  trialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 18,
    padding: spacing.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadow,
  },
  trialIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialText: { flex: 1 },
  trialTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  trialBody: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, marginTop: 2, lineHeight: 18 },

  reviewCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  reviewIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewTitle: { fontWeight: '700', marginBottom: 2 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { color: palette.danger, fontSize: 13, fontWeight: '600', flex: 1 },

  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.divider,
    backgroundColor: palette.bg,
  },
  backBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: palette.textMuted, fontSize: 15, fontWeight: '700' },
  nextBtn: {
    flex: 2,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadow,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
