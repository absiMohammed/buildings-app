import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';
import { Button, Card, EmptyState, Pill, SectionHeader } from '../components/ui';
import {
  RecordSubscriptionPaymentModal,
  type BuildingOption,
  type SubscriptionPayment,
} from '../components/RecordSubscriptionPaymentModal';
import { SubscriptionReceiptModal } from '../components/SubscriptionReceiptModal';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

interface RevenueSummary {
  totals: {
    arr: number;
    mrr: number;
    activeArr: number;
    activeMrr: number;
    paidMtd: number;
    outstanding: number;
  };
  buildings: Array<{
    _id: string;
    name: string;
    status: 'active' | 'inactive';
    currency: string;
    annual: number;
    monthly: number;
    featuresAnnual: number;
    actionsAnnual: number;
  }>;
  topByArr: Array<{ _id: string; name: string; annual: number }>;
}

const STATUS_KEY: Record<SubscriptionPayment['status'], StringKey> = {
  pending: 'sub_status_pending',
  paid: 'sub_status_paid',
  cancelled: 'sub_status_cancelled',
};

const STATUS_TONE: Record<SubscriptionPayment['status'], 'positive' | 'accent' | 'danger'> = {
  pending: 'accent',
  paid: 'positive',
  cancelled: 'danger',
};

/**
 * Admin-only payments surface. Shows aggregated subscription revenue at the
 * top + a list of recorded payments. Tapping an entry opens the form in
 * edit mode; the "+ Record payment" CTA opens it in create mode pre-filled
 * with the most recent building's computed annual amount.
 */
export function AdminPaymentsPage() {
  const { t, tf } = useI18n();
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SubscriptionPayment | null>(null);
  const [defaultBuildingId, setDefaultBuildingId] = useState<string | undefined>(undefined);
  const [receiptPayment, setReceiptPayment] = useState<SubscriptionPayment | null>(null);

  // Filters + cursor pagination state. Changing any filter resets the list
  // and refetches from the head. `nextBefore` is the cursor returned by the
  // server; null means we've reached the tail.
  const [statusFilter, setStatusFilter] =
    useState<'all' | 'pending' | 'paid' | 'cancelled' | 'overdue'>('all');
  const [buildingFilter, setBuildingFilter] = useState<string | 'all'>('all');
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (buildingFilter !== 'all') params.buildingId = buildingFilter;
      const query = new URLSearchParams(params).toString();
      const [s, p] = await Promise.all([
        api.get('/buildings/admin/revenue/summary'),
        api.get(`/buildings/admin/payments${query ? `?${query}` : ''}`),
      ]);
      setSummary(s.data as RevenueSummary);
      setPayments((p.data?.payments ?? []) as SubscriptionPayment[]);
      setNextBefore((p.data?.nextBefore ?? null) as string | null);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('sub_err_load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, statusFilter, buildingFilter]);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params: Record<string, string> = { before: nextBefore };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (buildingFilter !== 'all') params.buildingId = buildingFilter;
      const query = new URLSearchParams(params).toString();
      const r = await api.get(`/buildings/admin/payments?${query}`);
      const more = (r.data?.payments ?? []) as SubscriptionPayment[];
      setPayments((prev) => [...prev, ...more]);
      setNextBefore((r.data?.nextBefore ?? null) as string | null);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('sub_err_load'));
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, loadingMore, statusFilter, buildingFilter, t]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const buildingOptions: BuildingOption[] = useMemo(() => {
    if (!summary) return [];
    return summary.buildings.map((b) => ({
      _id: b._id,
      name: b.name,
      currency: b.currency,
      annual: b.annual,
      monthly: b.monthly,
    }));
  }, [summary]);

  function fmt(amount: number, currency: string): string {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="💳"
          title={t('sub_err_load')}
          body={error ?? ''}
          action={{ label: t('back'), onPress: () => void fetch() }}
        />
      </View>
    );
  }

  const reportingCurrency = summary.buildings[0]?.currency ?? 'USD';

  return (
    <ScrollView
      style={styles.container}
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
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('sub_title').toUpperCase()}</Text>
          <Text style={type.display}>{fmt(summary.totals.activeMrr, reportingCurrency)}</Text>
          <Text style={type.small}>{t('sub_subtitle_mrr')}</Text>
        </View>
        <Button
          label={t('sub_new')}
          variant="primary"
          onPress={() => {
            setEditingPayment(null);
            setDefaultBuildingId(summary.buildings[0]?._id);
            setRecordOpen(true);
          }}
          style={{ paddingHorizontal: 16 }}
        />
      </View>

      <View style={styles.statsGrid}>
        <StatTile label={t('sub_stat_arr')} value={fmt(summary.totals.activeArr, reportingCurrency)} tone="accent" />
        <StatTile label={t('sub_stat_mrr')} value={fmt(summary.totals.activeMrr, reportingCurrency)} tone="positive" />
        <StatTile label={t('sub_stat_paid_mtd')} value={fmt(summary.totals.paidMtd, reportingCurrency)} tone="positive" />
        <StatTile label={t('sub_stat_outstanding')} value={fmt(summary.totals.outstanding, reportingCurrency)} tone={summary.totals.outstanding > 0 ? 'warning' : 'neutral'} />
      </View>

      <SectionHeader title={t('sub_section_by_building')} />
      <Card padded={false}>
        {summary.buildings.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Text style={type.small}>{t('sub_no_buildings')}</Text>
          </View>
        ) : (
          summary.buildings.map((b, i) => (
            <TouchableOpacity
              key={b._id}
              style={[styles.row, i < summary.buildings.length - 1 && styles.divider]}
              activeOpacity={0.85}
              onPress={() => {
                setEditingPayment(null);
                setDefaultBuildingId(b._id);
                setRecordOpen(true);
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{b.name}</Text>
                <Text style={type.small} numberOfLines={1}>
                  {tf('sub_row_breakdown', {
                    features: fmt(b.featuresAnnual, b.currency),
                    actions: fmt(b.actionsAnnual, b.currency),
                  })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-start' }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{fmt(b.annual, b.currency)}</Text>
                <Text style={type.small}>{tf('sub_row_monthly', { value: fmt(b.monthly, b.currency) })}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </Card>

      <SectionHeader title={t('sub_section_history')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(['all', 'pending', 'paid', 'overdue', 'cancelled'] as const).map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => setStatusFilter(k)}
            style={[styles.filterChip, statusFilter === k && styles.filterChipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.filterChipText, statusFilter === k && styles.filterChipTextActive]}>
              {k === 'all' ? t('users_filter_all') : t(`sub_status_${k}` as const)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {summary.buildings.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            onPress={() => setBuildingFilter('all')}
            style={[styles.filterChip, buildingFilter === 'all' && styles.filterChipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.filterChipText, buildingFilter === 'all' && styles.filterChipTextActive]}>
              {t('users_filter_all')}
            </Text>
          </TouchableOpacity>
          {summary.buildings.map((b) => (
            <TouchableOpacity
              key={b._id}
              onPress={() => setBuildingFilter(b._id)}
              style={[styles.filterChip, buildingFilter === b._id && styles.filterChipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, buildingFilter === b._id && styles.filterChipTextActive]}>
                {b.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <Card padded={false}>
        {payments.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Text style={type.small}>{t('sub_no_payments')}</Text>
          </View>
        ) : (
          payments.map((p, i) => {
            const isOverdue = p.status === 'pending' && new Date(p.dueDate) < new Date();
            const openRow = () => {
              if (p.status === 'paid') {
                Alert.alert(p.buildingName ?? '—', `${p.periodLabel} · ${fmt(p.amount, p.currency)}`, [
                  { text: t('receipt_share'), onPress: () => setReceiptPayment(p) },
                  {
                    text: t('sub_edit_title'),
                    onPress: () => {
                      setEditingPayment(p);
                      setRecordOpen(true);
                    },
                  },
                  { text: t('cancel'), style: 'cancel' },
                ]);
                return;
              }
              setEditingPayment(p);
              setRecordOpen(true);
            };
            return (
              <TouchableOpacity
                key={p._id}
                style={[styles.row, i < payments.length - 1 && styles.divider]}
                activeOpacity={0.85}
                onPress={openRow}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
                    {p.buildingName ?? '—'}
                  </Text>
                  <Text style={type.small} numberOfLines={1}>
                    {p.periodLabel} · {t(p.periodKind === 'annual' ? 'sub_kind_annual' : 'sub_kind_monthly')} · {p.dueDate.slice(0, 10)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-start', gap: 4 }}>
                  <Text style={[type.body, { fontWeight: '700' }]}>{fmt(p.amount, p.currency)}</Text>
                  <Pill
                    label={isOverdue ? t('sub_status_overdue') : t(STATUS_KEY[p.status])}
                    tone={isOverdue ? 'danger' : STATUS_TONE[p.status]}
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </Card>

      {nextBefore && (
        <View style={{ alignItems: 'center', marginTop: spacing.md }}>
          <Button
            label={loadingMore ? t('loading') : t('sub_load_more')}
            variant="secondary"
            onPress={() => void loadMore()}
            disabled={loadingMore}
            loading={loadingMore}
          />
        </View>
      )}

      <View style={{ height: spacing.xl }} />

      <RecordSubscriptionPaymentModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        buildings={buildingOptions}
        initial={editingPayment}
        defaultBuildingId={defaultBuildingId}
        onSaved={(saved) => {
          setPayments((prev) => {
            const idx = prev.findIndex((x) => x._id === saved._id);
            if (idx === -1) return [saved, ...prev];
            const next = prev.slice();
            next[idx] = saved;
            return next;
          });
          void fetch(); // refresh summary totals
        }}
        onDeleted={(id) => {
          setPayments((prev) => prev.filter((x) => x._id !== id));
          void fetch();
        }}
      />

      <SubscriptionReceiptModal
        open={!!receiptPayment}
        onClose={() => setReceiptPayment(null)}
        payment={receiptPayment}
      />
    </ScrollView>
  );
}

function StatTile({
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
    <View style={styles.statTile}>
      <Text style={[type.caption, { color: palette.textSubtle }]}>{label}</Text>
      <Text style={[type.display, { color: fg, marginTop: 4, fontSize: 22 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
  filterRow: { flexDirection: 'row', gap: 8, paddingBottom: spacing.sm },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  filterChipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  filterChipText: { fontSize: 13, color: palette.textMuted, fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.divider },
});
