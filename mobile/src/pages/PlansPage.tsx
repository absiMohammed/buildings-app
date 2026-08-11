import { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Notice } from '../components/ui';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import { PLANS, PLAN_IDS, type PaidPlanId, type PlanDef } from '../data/plans';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const PLAN_GRADIENTS: Record<PaidPlanId, [string, string]> = {
  basic: ['#64748b', '#334155'],
  pro: ['#6366f1', '#4f46e5'],
  premium: ['#a855f7', '#ec4899'],
};

const PLAN_NAME_KEY: Record<PaidPlanId, StringKey> = {
  basic: 'plan_basic_name',
  pro: 'plan_pro_name',
  premium: 'plan_premium_name',
};

// Module id → the nav label already translated for the app's bottom tabs.
const MODULE_LABEL_KEY: Record<string, StringKey> = {
  'module.payments': 'nav_payments',
  'module.expenses': 'nav_expenses',
  'module.polls': 'nav_polls',
  'module.maintenance': 'nav_maintenance',
  'module.documents': 'nav_documents',
  'module.units': 'nav_units',
  'module.users': 'nav_users',
  'module.household': 'nav_household',
};

/**
 * Plan catalog + purchase screen. Doubles as the suspension lock screen:
 * RootNavigator renders it standalone when the building is suspended, so it
 * must not require a navigator to work.
 *
 * TODO(iap): swap the direct /plans/subscribe call for a react-native-iap
 * purchase; the productIds on each plan are the store contract. The server
 * endpoint already accepts {platform, productId, transactionId}.
 */
export function PlansPage() {
  const { user, building, refreshMe, logout } = useAuth();
  const { t, tf } = useI18n();
  const [busy, setBusy] = useState<PaidPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sub = building?.subscription;
  const suspended = building?.status === 'suspended';
  const isBuildingAdmin = !!user?.isBuildingAdmin;
  const currentPlan = sub?.status === 'active' ? sub.plan : null;
  const trialDays = sub?.status === 'trial' ? (sub.trialDaysLeft ?? 0) : 0;

  // Subscriptions are the building admin's business alone. Residents only
  // ever land here through the suspension lock, and all they get is a
  // plain "building paused" notice with a way out — never the catalog.
  if (!isBuildingAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.lockedWrap}>
          <View style={styles.lockedIcon}>
            <Icon name="buildings" size={30} color={palette.textMuted} />
          </View>
          <Text style={[type.heading, styles.lockedTitle]}>{t('plans_suspended_title')}</Text>
          <Text style={[type.small, styles.lockedBody]}>{t('plans_locked_body')}</Text>
          <TouchableOpacity style={styles.lockedLogout} onPress={() => void logout()} activeOpacity={0.8}>
            <Icon name="logout" size={16} color={palette.accent} />
            <Text style={styles.lockedLogoutText}>{t('plans_sign_out')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  async function subscribe(plan: PlanDef) {
    setBusy(plan.id);
    setError(null);
    try {
      await api.post('/plans/subscribe', {
        plan: plan.id,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        productId: plan.productId,
        // Placeholder until the store purchase flow is wired; the server
        // records it verbatim on the subscription for reconciliation.
        transactionId: `manual-${Platform.OS}-${Date.now()}`,
      });
      await refreshMe();
      setSuccess(true);
    } catch {
      setError(t('plans_error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.display, styles.title]}>{t('plans_title')}</Text>
            <Text style={[type.small, styles.subtitle]}>{t('plans_subtitle')}</Text>
          </View>
          {/* When this screen is the suspension lock there's no navigator
              chrome, so logout needs to live here. */}
          {suspended ? (
            <TouchableOpacity style={styles.logoutBtn} onPress={() => void logout()} hitSlop={8}>
              <Icon name="logout" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {suspended ? (
          <Notice
            tone="danger"
            title={t('plans_suspended_title')}
            message={t('plans_suspended_body')}
            style={styles.notice}
          />
        ) : trialDays > 0 ? (
          <Notice
            tone="accent"
            icon="sparkles"
            message={tf('plans_trial_left', { days: trialDays })}
            style={styles.notice}
          />
        ) : null}

        {success ? (
          <Notice tone="success" message={t('plans_success')} style={styles.notice} />
        ) : null}
        {error ? <Notice tone="danger" message={error} style={styles.notice} /> : null}

        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const isCurrent = currentPlan === id;
          const popular = id === 'pro';
          return (
            <View
              key={id}
              // The current plan's border picks up the plan's own accent so
              // the emphasis feels native to the card, not bolted on.
              style={[
                styles.card,
                popular && styles.cardPopular,
                isCurrent && { borderColor: PLAN_GRADIENTS[id][1], borderWidth: 2 },
              ]}
            >
              {/* Gradient as absoluteFill inside a plain View — a
                  LinearGradient used AS the container doesn't stretch to
                  the card edges under RTL. */}
              <View style={styles.cardHeader}>
                <LinearGradient
                  colors={PLAN_GRADIENTS[id]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.headerTopRow}>
                  <Text style={styles.planName}>{t(PLAN_NAME_KEY[id])}</Text>
                  {/* "Current plan" outranks "most popular" when both apply. */}
                  {isCurrent ? (
                    <View style={styles.currentPill}>
                      <Icon name="check" size={11} color="#fff" strokeWidth={3} />
                      <Text style={styles.currentPillText}>{t('plans_current')}</Text>
                    </View>
                  ) : popular ? (
                    <View style={styles.popularPill}>
                      <Icon name="star" size={11} color="#fff" strokeWidth={2.6} />
                      <Text style={styles.popularText}>{t('plans_most_popular')}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>${plan.priceMonthly}</Text>
                  <Text style={styles.priceUnit}>{t('plan_per_month')}</Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                <FeatureLine
                  text={
                    plan.limits.maxStories === null
                      ? t('plan_unlimited_stories')
                      : tf('plan_stories_line', { count: plan.limits.maxStories })
                  }
                />
                <FeatureLine
                  text={
                    plan.limits.maxUnits === null
                      ? t('plan_unlimited_units')
                      : tf('plan_units', { count: plan.limits.maxUnits })
                  }
                />
                {/* Occupancy: capped plans spell out the per-unit household
                    (1 owner + 1 tenant is global; dependents vary by plan). */}
                {plan.limits.maxDependentsPerUnit === null ? (
                  <FeatureLine text={t('plan_unlimited_users')} />
                ) : (
                  <>
                    <FeatureLine text={t('plan_occupancy_line')} />
                    <FeatureLine
                      text={
                        plan.limits.maxDependentsPerUnit === 0
                          ? t('plan_no_dependents')
                          : t('plan_one_dependent')
                      }
                    />
                  </>
                )}
                {plan.modules === null ? (
                  <FeatureLine text={t('plan_all_features')} highlight />
                ) : (
                  plan.modules.map((m) =>
                    MODULE_LABEL_KEY[m] ? <FeatureLine key={m} text={t(MODULE_LABEL_KEY[m])} /> : null,
                  )
                )}

                {isCurrent ? (
                  <View style={styles.currentBtn}>
                    <View style={styles.currentBtnCheck}>
                      <Icon name="check" size={12} color={palette.success} strokeWidth={3.2} />
                    </View>
                    <Text style={styles.currentBtnText}>{t('plans_current')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.subscribeBtn, busy !== null && styles.subscribeDisabled]}
                    disabled={busy !== null}
                    onPress={() => void subscribe(plan)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={PLAN_GRADIENTS[id]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={styles.subscribeText}>
                      {busy === id ? t('plans_subscribing') : t('plans_subscribe')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureLine({ text, highlight = false }: { text: string; highlight?: boolean }) {
  return (
    <View style={styles.featureRow}>
      <View style={[styles.featureCheck, highlight && styles.featureCheckHighlight]}>
        <Icon name="check" size={12} color={highlight ? '#fff' : palette.success} strokeWidth={3} />
      </View>
      <Text style={[type.body, highlight && styles.featureHighlightText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: { marginBottom: 2 },
  subtitle: {},
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { marginBottom: spacing.lg },

  card: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadow,
  },
  cardPopular: { borderColor: palette.accent, borderWidth: 2 },
  cardHeader: { padding: spacing.lg, overflow: 'hidden' },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  popularPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  popularText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  // Glassy badge in the plan's own header — same language as the
  // "most popular" pill, just slightly more present.
  currentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  // Understated status bar: neutral ground, small green check chip.
  currentBtn: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: spacing.sm,
  },
  currentBtnCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentBtnText: { color: palette.textMuted, fontSize: 15, fontWeight: '700' },
  planName: { color: '#fff', fontSize: 20, fontWeight: '800', flexShrink: 1 },
  // Fixed row height + forced LTR: Yoga mis-measures the 32pt Latin price
  // inside an RTL context (clipping it at the header edge), so the row is
  // pinned LTR and sized explicitly. alignSelf keeps it at the logical
  // start alongside the (RTL) plan name.
  priceRow: {
    flexDirection: 'row',
    direction: 'ltr',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    height: 48,
  },
  price: { color: '#fff', fontSize: 32, fontWeight: '800', lineHeight: 44, writingDirection: 'ltr' },
  priceUnit: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', alignSelf: 'flex-end', marginBottom: 6 },

  cardBody: { padding: spacing.lg, gap: spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCheckHighlight: { backgroundColor: palette.accent },
  featureHighlightText: { fontWeight: '700' },

  subscribeBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  subscribeDisabled: { opacity: 0.55 },
  subscribeText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  lockedIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  lockedTitle: { textAlign: 'center', marginBottom: spacing.xs },
  lockedBody: { textAlign: 'center', maxWidth: 280, marginBottom: spacing.xl },
  lockedLogout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: palette.accentSoft,
  },
  lockedLogoutText: { color: palette.accent, fontSize: 14, fontWeight: '800' },
});
