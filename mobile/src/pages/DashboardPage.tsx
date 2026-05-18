import { useCallback, useMemo, useState } from 'react';
import {
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth, useCurrency, type Role } from '../auth/AuthContext';
import {
  ACTIONS,
  EMPTY_CAPABILITIES,
  MODULES,
  WIDGETS,
  hasAction,
  hasModule,
  hasWidget,
} from '../auth/capabilities';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import { ViewModeChip } from '../components/ViewModeChip';
import { AdminDashboardPage } from './AdminDashboardPage';
import {
  Card,
  IconCircle,
  Pill,
  SectionHeader,
  StatCard,
} from '../components/ui';
import {
  fmtMoney,
  fmtMoneyCompact,
  paymentsFor,
  paymentsTrendFor,
  type MockPoll,
  ticketsFor,
  relativeDay,
} from '../mocks/fixtures';
import { useMockStore } from '../mocks/store';
import type { AppStackParamList } from '../navigation/types';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

interface ModuleEntry {
  id: string;
  glyph: string;
  labelKey: StringKey;
  route: keyof AppStackParamList;
  tone: 'accent' | 'positive' | 'warning' | 'danger' | 'neutral';
}

function roleKey(role: Role): StringKey {
  return role === 'admin' ? 'role_admin'
    : role === 'owner' ? 'role_owner'
    : role === 'renter' ? 'role_renter'
    : 'role_dependent';
}

const MODULE_REGISTRY: ModuleEntry[] = [
  { id: MODULES.PAYMENTS, glyph: '💳', labelKey: 'nav_payments', route: 'Payments', tone: 'accent' },
  { id: MODULES.EXPENSES, glyph: '🧾', labelKey: 'nav_expenses', route: 'Expenses', tone: 'warning' },
  { id: MODULES.POLLS, glyph: '🗳️', labelKey: 'nav_polls', route: 'Polls', tone: 'positive' },
  { id: MODULES.MAINTENANCE, glyph: '🔧', labelKey: 'nav_maintenance', route: 'Maintenance', tone: 'warning' },
  { id: MODULES.DOCUMENTS, glyph: '📄', labelKey: 'nav_documents', route: 'Documents', tone: 'neutral' },
  { id: MODULES.UNITS, glyph: '🏢', labelKey: 'nav_units', route: 'Units', tone: 'accent' },
  { id: MODULES.USERS, glyph: '👥', labelKey: 'nav_users', route: 'Users', tone: 'neutral' },
];

export function DashboardPage() {
  const { user, logout, capabilities: caps } = useAuth();
  const currency = useCurrency();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [refreshing, setRefreshing] = useState(false);
  const role = (user?.role ?? 'renter') as Role;
  // System admin operates above any one building — show the cross-tenant
  // ops dashboard instead of the resident dashboard.
  if (role === 'admin') return <AdminDashboardPage />;
  const { units, users, polls } = useMockStore();
  const { t, tf, locale } = useI18n();

  const payments = useMemo(() => paymentsFor(role), [role]);
  const trend = useMemo(() => paymentsTrendFor(role), [role]);
  const tickets = useMemo(() => ticketsFor(role), [role]);

  const outstanding = payments.filter((p) => p.status === 'pending' || p.status === 'overdue');
  const overdue = payments.filter((p) => p.status === 'overdue');
  const balance = outstanding.reduce((s, p) => s + p.amount, 0);
  const collectedMTD = payments
    .filter((p) => p.status === 'paid' && p.paidDate && new Date(p.paidDate).getMonth() === new Date().getMonth())
    .reduce((s, p) => s + p.amount, 0);
  const openPolls = polls.filter((p) => p.status === 'open').length;
  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
  const nextDue = outstanding.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];

  const allowedModules = MODULE_REGISTRY.filter((m) => hasModule(caps, m.id));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Build stat cards from capability list (order matches the WIDGETS const).
  const statCards: { id: string; node: React.ReactNode }[] = [];
  if (hasWidget(caps, WIDGETS.STAT_MTD_COLLECTED)) {
    statCards.push({ id: WIDGETS.STAT_MTD_COLLECTED, node: <StatCard key="mtd" label={t('dash_stat_collected_mtd')} value={fmtMoneyCompact(collectedMTD, currency)} hint={t('dash_hint_this_month')} tone="positive" style={styles.statCard} /> });
  }
  if (hasWidget(caps, WIDGETS.STAT_OUTSTANDING)) {
    statCards.push({ id: WIDGETS.STAT_OUTSTANDING, node: <StatCard key="out" label={t('dash_stat_outstanding')} value={fmtMoneyCompact(balance, currency)} hint={overdue.length > 0 ? tf('dash_hint_overdue', { count: overdue.length }) : t('dash_hint_on_track')} tone={overdue.length > 0 ? 'danger' : 'neutral'} style={styles.statCard} /> });
  }
  if (hasWidget(caps, WIDGETS.STAT_ACTIVE_UNITS)) {
    statCards.push({ id: WIDGETS.STAT_ACTIVE_UNITS, node: <StatCard key="units" label={t('dash_stat_active_units')} value={String(units.filter((u) => u.occupancyStatus === 'occupied').length)} hint={tf('dash_hint_of_total', { count: units.length })} tone="accent" style={styles.statCard} /> });
  }
  if (hasWidget(caps, WIDGETS.STAT_OPEN_TICKETS)) {
    statCards.push({ id: WIDGETS.STAT_OPEN_TICKETS, node: <StatCard key="tk" label={t('dash_stat_open_tickets')} value={String(openTickets)} hint={openTickets ? t('dash_hint_attention') : t('dash_hint_clear')} tone={openTickets ? 'warning' : 'neutral'} style={styles.statCard} /> });
  }
  if (hasWidget(caps, WIDGETS.STAT_BALANCE)) {
    statCards.push({ id: WIDGETS.STAT_BALANCE, node: <StatCard key="bal" label={t('dash_stat_balance')} value={fmtMoneyCompact(balance, currency)} hint={overdue.length > 0 ? tf('dash_hint_overdue', { count: overdue.length }) : t('dash_hint_on_track')} tone={overdue.length > 0 ? 'danger' : 'positive'} style={styles.statCard} /> });
  }
  if (hasWidget(caps, WIDGETS.STAT_NEXT_DUE)) {
    statCards.push({ id: WIDGETS.STAT_NEXT_DUE, node: <StatCard key="next" label={t('dash_stat_next_due')} value={nextDue ? relativeDay(nextDue.dueDate) : '—'} hint={nextDue ? new Date(nextDue.dueDate).toLocaleDateString() : t('dash_hint_clear')} tone={nextDue ? 'warning' : 'neutral'} style={styles.statCard} /> });
  }
  if (hasWidget(caps, WIDGETS.STAT_OPEN_POLLS)) {
    statCards.push({ id: WIDGETS.STAT_OPEN_POLLS, node: <StatCard key="polls" label={t('dash_stat_open_polls')} value={String(openPolls)} hint={t('dash_hint_awaiting_votes')} tone="accent" style={styles.statCard} /> });
  }
  if (hasWidget(caps, WIDGETS.STAT_YOUR_UNIT)) {
    statCards.push({ id: WIDGETS.STAT_YOUR_UNIT, node: <StatCard key="unit" label={t('dash_stat_your_unit')} value="8B" hint={tf('dash_hint_unit_meta', { bedrooms: 3, floor: 8 })} tone="neutral" style={styles.statCard} /> });
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      {/* Hero */}
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={['#4f46e5', '#7c3aed', '#ec4899']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroBlob1} />
        <View style={styles.heroBlob2} />

        <View style={styles.heroTopRow}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>{t(roleKey(role))}</Text>
          </View>
          <View style={styles.heroActions}>
            <ViewModeChip />

            <TouchableOpacity
              style={styles.heroIconBtn}
              hitSlop={8}
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.85}
            >
              <Text style={styles.heroIconText}>⚙</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroIconBtn}
              hitSlop={8}
              onPress={() => void logout()}
              activeOpacity={0.85}
            >
              <Text style={styles.heroIconText}>{I18nManager.isRTL ? '↩' : '↪'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroRow}>
          <View style={{ flex: 1, paddingEnd: spacing.md }}>
            <Text style={styles.heroEyebrow}>
              {new Date().toLocaleDateString(locale === 'ar' ? 'ar' : 'en-US', { weekday: 'long' })}
            </Text>
            <Text style={styles.heroGreeting} numberOfLines={1}>
              {tf('dash_greeting', { name: user?.firstName ?? '' })} 👋
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              {new Date().toLocaleDateString(locale === 'ar' ? 'ar' : 'en-US', { month: 'long', day: 'numeric' })} · {t('dash_welcome_back')}
            </Text>
          </View>
        </View>
      </View>

      {/* Stat strip */}
      {statCards.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          {statCards.map((c) => c.node)}
        </ScrollView>
      )}

      {/* Modules grid */}
      {allowedModules.length > 0 && (
        <>
          <SectionHeader title={t('dash_modules')} />
          <View style={styles.quickGrid}>
            {allowedModules.map((m) => (
              <ModuleTile key={m.id} module={m} onPress={() => navigation.navigate(m.route)} />
            ))}
          </View>
        </>
      )}

      {/* Primary chart per role (one of these capabilities is granted) */}
      {hasWidget(caps, WIDGETS.CHART_COLLECTIONS) && (
        <>
          <SectionHeader title={t('dash_section_collections')} />
          <Card>
            <CollectionsChart trend={trend} currency={currency} />
          </Card>
        </>
      )}
      {hasWidget(caps, WIDGETS.CHART_PAYMENTS_BY_CATEGORY) && (
        <>
          <SectionHeader title={t('dash_section_by_category')} />
          <Card>
            <PaymentsByCategoryChart currency={currency} />
          </Card>
        </>
      )}
      {hasWidget(caps, WIDGETS.CHART_PAYMENT_HISTORY) && (
        <>
          <SectionHeader title={t('dash_section_payment_history')} />
          <Card>
            <PaymentHistoryChart trend={trend} currency={currency} />
          </Card>
        </>
      )}
      {hasWidget(caps, WIDGETS.CHART_POLLS) && (
        <>
          <SectionHeader title={t('dash_section_polls')} />
          <Card>
            <PollsChart polls={polls} />
          </Card>
        </>
      )}

      {/* Secondary role sections */}
      {hasWidget(caps, WIDGETS.SECTION_NEEDS_ATTENTION) && <NeedsAttention tickets={tickets} payments={payments} canInvite={hasAction(caps, ACTIONS.USER_INVITE)} currency={currency} />}
      {hasWidget(caps, WIDGETS.SECTION_RECENT_ACTIVITY) && <RecentActivity users={users} />}
      {hasWidget(caps, WIDGETS.SECTION_PAYMENT_SUMMARY) && <PaymentSummary nextDue={nextDue} overdue={overdue.length} outstanding={outstanding.length} balance={balance} currency={currency} />}
      {hasWidget(caps, WIDGETS.SECTION_OPEN_POLLS) && <DependentSection polls={polls} />}

      <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ModuleTile({ module, onPress }: { module: ModuleEntry; onPress: () => void }) {
  const { t } = useI18n();
  const toneColors: Record<string, { fg: string; soft: string }> = {
    accent: { fg: palette.accent, soft: palette.accentSoft },
    positive: { fg: palette.success, soft: palette.successSoft },
    warning: { fg: palette.warning, soft: palette.warningSoft },
    danger: { fg: palette.danger, soft: palette.dangerSoft },
    neutral: { fg: palette.textMuted, soft: palette.surfaceMuted },
  };
  const tone = toneColors[module.tone];
  return (
    <TouchableOpacity style={styles.moduleTile} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.moduleIcon, { backgroundColor: tone.soft }]}>
        <Text style={styles.moduleGlyph}>{module.glyph}</Text>
      </View>
      <Text style={styles.moduleLabel}>{t(module.labelKey)}</Text>
      <View style={[styles.moduleStripe, { backgroundColor: tone.fg }]} />
    </TouchableOpacity>
  );
}

function CollectionsChart({ trend, currency }: { trend: { label: string; value: number }[]; currency: string }) {
  const { tf } = useI18n();
  const max = Math.max(...trend.map((t) => t.value));
  return (
    <View>
      <BarChart
        data={trend.map((t) => ({
          value: t.value,
          label: t.label,
          frontColor: palette.accent,
          labelTextStyle: { color: palette.textSubtle, fontSize: 11 },
        }))}
        barWidth={28}
        spacing={16}
        maxValue={Math.ceil(max * 1.15)}
        yAxisColor={palette.border}
        xAxisColor={palette.border}
        yAxisTextStyle={{ color: palette.textSubtle, fontSize: 10 }}
        noOfSections={4}
        isAnimated
        height={160}
        barBorderRadius={6}
        hideRules
      />
      <Text style={[type.small, { marginTop: 4 }]}>
        {tf('dash_total_period', { amount: fmtMoney(trend.reduce((s, t) => s + t.value, 0), currency) })}
      </Text>
    </View>
  );
}

function PaymentsByCategoryChart({ currency }: { currency: string }) {
  const { t } = useI18n();
  // Owner-perspective: rent collected from renter + dues/util paid to building.
  const data = [
    { value: 1200 * 4, text: t('dash_legend_rent_in'), color: palette.accent },
    { value: 1450 * 4, text: t('dash_legend_dues'), color: palette.warning },
    { value: 180 * 4, text: t('dash_legend_util'), color: palette.success },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <View style={{ alignItems: 'center' }}>
      <PieChart
        donut
        data={data}
        radius={72}
        innerRadius={48}
        innerCircleColor={palette.surface}
        centerLabelComponent={() => (
          <View style={{ alignItems: 'center' }}>
            <Text style={type.caption}>YTD</Text>
            <Text style={type.title}>{fmtMoneyCompact(total, currency)}</Text>
          </View>
        )}
      />
      <View style={styles.legendRow}>
        {data.map((d) => (
          <View key={d.text} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: d.color }]} />
            <Text style={type.small}>{d.text} {fmtMoneyCompact(d.value, currency)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PaymentHistoryChart({ trend, currency: _currency }: { trend: { label: string; value: number }[]; currency: string }) {
  return (
    <LineChart
      data={trend.map((t) => ({ value: t.value, label: t.label, labelTextStyle: { color: palette.textSubtle, fontSize: 11 } }))}
      thickness={2.5}
      color={palette.accent}
      startFillColor={palette.accent}
      endFillColor={palette.accent}
      startOpacity={0.25}
      endOpacity={0}
      areaChart
      yAxisColor={palette.border}
      xAxisColor={palette.border}
      yAxisTextStyle={{ color: palette.textSubtle, fontSize: 10 }}
      noOfSections={4}
      height={160}
      dataPointsColor={palette.accent}
      hideRules
      isAnimated
    />
  );
}

function PollsChart({ polls }: { polls: MockPoll[] }) {
  const { t } = useI18n();
  const opened = polls.filter((p) => p.status === 'open').length;
  const closed = polls.filter((p) => p.status === 'closed').length;
  return (
    <BarChart
      data={[
        { value: opened, label: t('polls_section_open'), frontColor: palette.accent, labelTextStyle: { color: palette.textSubtle, fontSize: 11 } },
        { value: closed, label: t('polls_section_closed'), frontColor: palette.textSubtle, labelTextStyle: { color: palette.textSubtle, fontSize: 11 } },
      ]}
      barWidth={48}
      spacing={32}
      height={140}
      barBorderRadius={6}
      hideRules
      yAxisColor={palette.border}
      xAxisColor={palette.border}
      yAxisTextStyle={{ color: palette.textSubtle, fontSize: 10 }}
      noOfSections={3}
    />
  );
}

function NeedsAttention({ tickets, payments, canInvite, currency }: { tickets: ReturnType<typeof ticketsFor>; payments: ReturnType<typeof paymentsFor>; canInvite: boolean; currency: string }) {
  const { t, tf } = useI18n();
  const overduePayments = payments.filter((p) => p.status === 'overdue');
  return (
    <>
      <SectionHeader title={t('dash_section_needs_attention')} />
      <Card padded={false}>
        <ActivityRow
          icon="!"
          tone="danger"
          title={tf(
            overduePayments.length === 1 ? 'dash_needs_overdue_title' : 'dash_needs_overdue_title_plural',
            { count: overduePayments.length }
          )}
          subtitle={tf('dash_needs_overdue_subtitle', {
            amount: fmtMoney(overduePayments.reduce((s, p) => s + p.amount, 0), currency),
            units: overduePayments.map((p) => p.unitId).join(', ') || t('dash_needs_overdue_no_units'),
          })}
        />
        <Divider />
        <ActivityRow
          icon="🔧"
          tone="warning"
          title={tf('dash_needs_new_tickets', { count: tickets.filter((tk) => tk.status === 'open').length })}
          subtitle={tickets[0] ? `${tickets[0].title} · ${tf('maint_place_unit', { n: tickets[0].unit })}` : t('dash_needs_no_tickets')}
        />
        {canInvite && (
          <>
            <Divider />
            <ActivityRow icon="👥" tone="accent" title={t('dash_needs_invite_pending')} subtitle={t('dash_needs_invite_subtitle')} />
          </>
        )}
      </Card>
    </>
  );
}

function RecentActivity({ users }: { users: { _id: string; firstName: string; lastName: string; role: string; unit?: string; status: string }[] }) {
  const { t } = useI18n();
  return (
    <>
      <SectionHeader title={t('dash_section_recent_activity')} />
      <Card padded={false}>
        {users.slice(0, 3).map((u, i) => (
          <View key={u._id}>
            <View style={styles.activityRow}>
              <View style={styles.activityAvatar}>
                <Text style={styles.activityInitial}>{u.firstName[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '600' }]}>{u.firstName} {u.lastName}</Text>
                <Text style={type.small}>
                  {t(roleKey(u.role as Role))}{u.unit ? ` · ${t('maint_place_unit').replace('{{n}}', u.unit)}` : ''}
                </Text>
              </View>
              <Pill
                label={u.status === 'active' ? t('user_status_active') : u.status === 'invited' ? t('user_status_invited') : t('user_status_suspended')}
                tone={u.status === 'active' ? 'positive' : u.status === 'invited' ? 'accent' : 'danger'}
              />
            </View>
            {i < 2 && <Divider />}
          </View>
        ))}
      </Card>
    </>
  );
}

function PaymentSummary({ nextDue, overdue, outstanding, balance, currency }: { nextDue?: ReturnType<typeof paymentsFor>[number]; overdue: number; outstanding: number; balance: number; currency: string }) {
  const { t, tf } = useI18n();
  return (
    <>
      <SectionHeader title={t('dash_section_next_payment')} />
      <Card>
        {nextDue ? (
          <>
            <View style={styles.nextRow}>
              <View>
                <Text style={type.caption}>{tf('dash_due', { relative: relativeDay(nextDue.dueDate) })}</Text>
                <Text style={[type.display, { marginTop: 4 }]}>{fmtMoney(nextDue.amount, currency)}</Text>
                <Text style={[type.small, { marginTop: 2 }]}>
                  {nextDue.type.replace('_', ' ')} · {tf('maint_place_unit', { n: nextDue.unitId })}
                </Text>
              </View>
              <Pill
                label={nextDue.status === 'overdue' ? t('status_overdue') : nextDue.status === 'pending' ? t('status_pending') : nextDue.status === 'paid' ? t('status_paid') : t('status_partially_paid')}
                tone={nextDue.status === 'overdue' ? 'danger' : nextDue.status === 'pending' ? 'warning' : 'positive'}
              />
            </View>
            <View style={styles.summaryRow}>
              <SummaryStat label={t('dash_summary_outstanding')} value={String(outstanding)} />
              <SummaryStat label={t('dash_summary_overdue')} value={String(overdue)} tone={overdue > 0 ? 'danger' : 'neutral'} />
              <SummaryStat label={t('dash_summary_balance')} value={fmtMoneyCompact(balance, currency)} />
            </View>
          </>
        ) : (
          <Text style={type.small}>{t('dash_caught_up')}</Text>
        )}
      </Card>
    </>
  );
}

function DependentSection({ polls }: { polls: MockPoll[] }) {
  const { t, tf } = useI18n();
  const open = polls.filter((p) => p.status === 'open');
  return (
    <>
      <SectionHeader title={t('dash_section_open_polls')} />
      <Card padded={false}>
        {open.map((p, i) => (
          <View key={p._id}>
            <View style={styles.pollRow}>
              <Text style={[type.body, { fontWeight: '600' }]}>{p.title}</Text>
              <Text style={type.small}>{tf('dash_to_vote', { relative: relativeDay(p.closesAt) })}</Text>
            </View>
            {i < open.length - 1 && <Divider />}
          </View>
        ))}
        {open.length === 0 && <Text style={[type.small, { padding: spacing.lg }]}>{t('dash_nothing_open')}</Text>}
      </Card>
    </>
  );
}

function ActivityRow({ icon, tone, title, subtitle }: { icon: string; tone: 'accent' | 'danger' | 'warning' | 'positive'; title: string; subtitle: string }) {
  return (
    <View style={styles.activityRow}>
      <IconCircle glyph={icon} tone={tone} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '600' }]}>{title}</Text>
        <Text style={type.small}>{subtitle}</Text>
      </View>
    </View>
  );
}

function SummaryStat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'danger' }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.heading, tone === 'danger' && { color: palette.danger }]}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  heroWrap: {
    marginBottom: spacing.lg,
    borderRadius: 24,
    overflow: 'hidden',
    ...shadow,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  heroActions: { flexDirection: 'row', gap: spacing.xs },
  heroIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroIconText: { color: '#fff', fontSize: 17, fontWeight: '600' },
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
  heroEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroGreeting: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 4 },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  heroPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroPillText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },

  statsRow: { paddingEnd: spacing.lg, gap: spacing.md },
  statCard: { width: 160, marginEnd: spacing.md },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moduleTile: {
    width: '31.5%',
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
    alignItems: 'center',
    overflow: 'hidden',
    ...shadow,
  },
  moduleIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleGlyph: { fontSize: 24 },
  moduleLabel: { fontSize: 12, color: palette.text, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  moduleStripe: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 14,
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    opacity: 0.8,
  },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  activityAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
  activityInitial: { color: palette.accent, fontWeight: '700' },

  pollRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg },

  nextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryRow: { flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider },
});
