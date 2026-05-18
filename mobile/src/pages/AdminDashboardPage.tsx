import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LinearGradient from 'react-native-linear-gradient';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, EmptyState, SectionHeader } from '../components/ui';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import { TAB_BAR_HEIGHT } from '../components/BottomTabBar';
import { useI18n } from '../i18n';
import type { Role } from '../auth/AuthContext';
import type { StringKey } from '../i18n/strings';
import type { AppStackParamList } from '../navigation/types';

interface RevenueSummary {
  totals: {
    arr: number;
    mrr: number;
    activeArr: number;
    activeMrr: number;
    paidMtd: number;
    outstanding: number;
  };
  topByArr: Array<{ _id: string; name: string; annual: number }>;
  buildings: Array<{ _id: string; name: string; currency: string }>;
}

function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface AdminStats {
  buildings: { total: number; active: number; inactive: number; withoutAdmin: number };
  users: {
    total: number;
    byRole: { admin: number; owner: number; renter: number; dependent: number };
    buildingAdmins: number;
  };
  units: { total: number };
  invites: { pending: number };
  topBuildings: Array<{ _id: string; name: string; userCount: number }>;
}

const ROLE_KEY: Record<Role, StringKey> = {
  admin: 'role_admin',
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
};

const ROLE_COLOR: Record<Role, string> = {
  admin: palette.accent,
  owner: palette.success,
  renter: palette.warning,
  dependent: palette.textSubtle,
};

/**
 * System-admin's home screen. The resident dashboard is irrelevant to admin
 * (no balance, no dues, no polls for them), so we render a SaaS-style ops
 * dashboard: total buildings + users + units, role mix, top buildings, and
 * an attention list (inactive buildings, buildings without an appointed
 * admin, pending invites).
 */
export function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const { t, tf } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const [s, r] = await Promise.all([
        api.get('/buildings/admin/stats'),
        api.get('/buildings/admin/revenue/summary'),
      ]);
      setStats(s.data as AdminStats);
      setRevenue(r.data as RevenueSummary);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('admin_dash_err_load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const pieData = useMemo(() => {
    if (!stats) return [];
    const r = stats.users.byRole;
    return (['owner', 'renter', 'dependent', 'admin'] as Role[])
      .map((role) => ({
        value: r[role],
        color: ROLE_COLOR[role],
        text: r[role] > 0 ? String(r[role]) : '',
        textColor: '#fff',
        textSize: 12,
        labelKey: ROLE_KEY[role],
        role,
      }))
      .filter((s) => s.value > 0);
  }, [stats]);

  const topBuildingsData = useMemo(() => {
    if (!stats) return [];
    return stats.topBuildings.map((b) => ({
      value: b.userCount,
      label: b.name.length > 10 ? `${b.name.slice(0, 9)}…` : b.name,
      frontColor: palette.accent,
      labelTextStyle: { color: palette.textSubtle, fontSize: 11 },
      _id: b._id,
    }));
  }, [stats]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Text style={type.small}>{t('loading')}</Text>
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <EmptyState
          icon="📊"
          title={t('admin_dash_err_load')}
          body={error ?? ''}
          action={{ label: t('back'), onPress: () => void fetch() }}
        />
      </SafeAreaView>
    );
  }

  const greeting = (user?.firstName ?? '').trim();
  const needsAttention =
    stats.buildings.withoutAdmin + stats.buildings.inactive + stats.invites.pending;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetch();
            }}
          />
        }
      >
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={[palette.accent, '#7c3aed']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroBlob1} />
          <View style={styles.heroBlob2} />
          <View style={styles.heroTopRow}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>{t('role_admin')}</Text>
            </View>
            <TouchableOpacity onPress={() => void logout()} hitSlop={8} style={styles.signOut}>
              <Text style={styles.signOutText}>{t('sign_out')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.heroEyebrow}>{t('admin_dash_title')}</Text>
          <Text style={styles.heroGreeting}>
            {greeting ? `${t('dash_welcome_back')}, ${greeting}` : t('admin_dash_title')}
          </Text>
          <Text style={styles.heroSubtitle}>{t('admin_dash_subtitle')}</Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            label={t('admin_dash_stat_buildings')}
            value={String(stats.buildings.total)}
            hint={tf('admin_dash_stat_buildings_hint', {
              active: stats.buildings.active,
              inactive: stats.buildings.inactive,
            })}
            tone="accent"
            onPress={() => navigation.navigate('Buildings')}
          />
          <StatCard
            label={t('admin_dash_stat_users')}
            value={String(stats.users.total)}
            hint={tf('admin_dash_stat_users_hint', { admins: stats.users.buildingAdmins })}
            tone="positive"
            onPress={() => navigation.navigate('AllUsers')}
          />
          <StatCard
            label={t('admin_dash_stat_units')}
            value={String(stats.units.total)}
            hint={t('admin_dash_stat_units_hint')}
            tone="neutral"
          />
          <StatCard
            label={t('admin_dash_stat_pending_invites')}
            value={String(stats.invites.pending)}
            hint={t('admin_dash_stat_pending_invites_hint')}
            tone={stats.invites.pending > 0 ? 'warning' : 'neutral'}
          />
        </View>

        {needsAttention > 0 && (
          <Card>
            <Text style={[type.body, { fontWeight: '700', marginBottom: spacing.sm }]}>
              {t('admin_dash_attention_title')}
            </Text>
            {stats.buildings.withoutAdmin > 0 && (
              <AttentionRow
                label={tf('admin_dash_attention_no_admin', { n: stats.buildings.withoutAdmin })}
                onPress={() => navigation.navigate('Buildings')}
              />
            )}
            {stats.buildings.inactive > 0 && (
              <AttentionRow
                label={tf('admin_dash_attention_inactive', { n: stats.buildings.inactive })}
                onPress={() => navigation.navigate('Buildings')}
              />
            )}
            {stats.invites.pending > 0 && (
              <AttentionRow label={tf('admin_dash_attention_invites', { n: stats.invites.pending })} />
            )}
          </Card>
        )}

        {revenue && (
          <>
            <SectionHeader title={t('admin_dash_revenue_title')} />
            <Card padded={false}>
              <Text style={[type.small, { padding: spacing.md, paddingBottom: 0 }]}>
                {t('admin_dash_revenue_hint')}
              </Text>
              <View style={styles.revenueGrid}>
                <RevenueTile
                  label={t('admin_dash_revenue_arr')}
                  value={fmtMoney(revenue.totals.activeArr, revenue.buildings[0]?.currency ?? 'USD')}
                  tone="accent"
                />
                <RevenueTile
                  label={t('admin_dash_revenue_mrr')}
                  value={fmtMoney(revenue.totals.activeMrr, revenue.buildings[0]?.currency ?? 'USD')}
                  tone="positive"
                />
                <RevenueTile
                  label={t('admin_dash_revenue_paid_mtd')}
                  value={fmtMoney(revenue.totals.paidMtd, revenue.buildings[0]?.currency ?? 'USD')}
                  tone="positive"
                />
                <RevenueTile
                  label={t('admin_dash_revenue_outstanding')}
                  value={fmtMoney(revenue.totals.outstanding, revenue.buildings[0]?.currency ?? 'USD')}
                  tone={revenue.totals.outstanding > 0 ? 'warning' : 'neutral'}
                />
              </View>
              {revenue.topByArr.length > 0 && (
                <View style={{ padding: spacing.md }}>
                  <Text style={[type.small, { color: palette.textSubtle, marginBottom: spacing.sm }]}>
                    {t('admin_dash_revenue_top')}
                  </Text>
                  {revenue.topByArr.map((b, i) => (
                    <View key={b._id} style={[styles.topRow, i < revenue.topByArr.length - 1 && styles.topRowDivider]}>
                      <Text style={[type.body, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>
                        {b.name}
                      </Text>
                      <Text style={[type.body, { fontWeight: '700' }]}>
                        {fmtMoney(b.annual, revenue.buildings[0]?.currency ?? 'USD')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        )}

        {pieData.length > 0 && (
          <>
            <SectionHeader title={t('admin_dash_chart_roles')} />
            <Card>
              <View style={styles.pieWrap}>
                <PieChart
                  data={pieData}
                  donut
                  radius={80}
                  innerRadius={50}
                  innerCircleColor={palette.surface}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[type.display, { fontSize: 22 }]}>{stats.users.total}</Text>
                      <Text style={type.small}>{t('admin_dash_stat_users')}</Text>
                    </View>
                  )}
                />
              </View>
              <View style={styles.legendRow}>
                {pieData.map((s) => (
                  <View key={s.role} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                    <Text style={type.small}>
                      {t(s.labelKey)} · {s.value}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </>
        )}

        {topBuildingsData.length > 0 && (
          <>
            <SectionHeader title={t('admin_dash_chart_top_buildings')} />
            <Card>
              <BarChart
                data={topBuildingsData}
                width={320}
                height={170}
                barWidth={32}
                spacing={20}
                noOfSections={4}
                yAxisThickness={0}
                xAxisThickness={0}
                yAxisTextStyle={{ color: palette.textSubtle, fontSize: 11 }}
                hideRules
                roundedTop
                isAnimated
              />
              <Text style={[type.small, { marginTop: spacing.sm, color: palette.textSubtle }]}>
                {t('admin_dash_chart_top_buildings_hint')}
              </Text>
            </Card>
          </>
        )}

        <View style={{ height: TAB_BAR_HEIGHT + spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'accent' | 'positive' | 'warning' | 'neutral';
  onPress?: () => void;
}) {
  const fg =
    tone === 'accent'
      ? palette.accent
      : tone === 'positive'
        ? palette.success
        : tone === 'warning'
          ? palette.warning
          : palette.text;
  const Wrapper: React.ComponentType<{ children: React.ReactNode }> = onPress
    ? ({ children }) => (
        <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.statTile}>
          {children}
        </TouchableOpacity>
      )
    : ({ children }) => <View style={styles.statTile}>{children}</View>;
  return (
    <Wrapper>
      <Text style={[type.caption, { color: palette.textSubtle }]}>{label}</Text>
      <Text style={[type.display, { color: fg, marginTop: 4 }]}>{value}</Text>
      {hint ? <Text style={[type.small, { marginTop: 2 }]} numberOfLines={2}>{hint}</Text> : null}
    </Wrapper>
  );
}

function RevenueTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'accent' | 'positive' | 'warning' | 'neutral';
}) {
  const fg =
    tone === 'accent'
      ? palette.accent
      : tone === 'positive'
        ? palette.success
        : tone === 'warning'
          ? palette.warning
          : palette.text;
  return (
    <View style={styles.revenueTile}>
      <Text style={[type.caption, { color: palette.textSubtle }]}>{label}</Text>
      <Text style={[type.display, { color: fg, marginTop: 4, fontSize: 20 }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function AttentionRow({ label, onPress }: { label: string; onPress?: () => void }) {
  const inner = (
    <View style={styles.attentionRow}>
      <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>
        {label}
      </Text>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  scroll: { paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  heroWrap: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: 24,
    overflow: 'hidden',
    minHeight: 160,
    ...shadow,
  },
  heroBlob1: {
    position: 'absolute',
    top: -50,
    end: -40,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroBlob2: {
    position: 'absolute',
    bottom: -60,
    start: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroPillText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  signOut: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 999 },
  signOutText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  heroEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: spacing.md },
  heroGreeting: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 4 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  statTile: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    ...shadow,
  },

  pieWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chevron: { color: palette.textSubtle, fontSize: 22, fontWeight: '300' },
  revenueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
  },
  revenueTile: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    backgroundColor: palette.bg,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  topRowDivider: { borderBottomWidth: 1, borderBottomColor: palette.divider },
});
