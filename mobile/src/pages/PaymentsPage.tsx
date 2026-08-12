import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth, useCurrency } from '../auth/AuthContext';
import { ACTIONS, hasAction } from '../auth/capabilities';
import { type IconName } from '../components/Icon';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import {
  Button,
  Card,
  EmptyState,
  IconCircle,
  Pill,
  Segmented,
} from '../components/ui';
import { fmtDate, fmtMoney, fmtMoneyCompact, relativeDay } from '../utils/format';
import { paymentTypeLabel } from '../utils/labels';
import {
  createPayment,
  isPartiallyPaid,
  listPayments,
  recordReceipts,
  remainingOf,
  type Payment,
} from '../api/payments';
import { listUnits, type Unit } from '../api/units';
import { apiErrorMessage, useApiResource } from '../api/useApiResource';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { NewChargeModal } from '../components/NewChargeModal';
import { UnitFilterPicker } from '../components/UnitFilterPicker';
import { useI18n } from '../i18n';

type FilterValue = 'all' | 'pending' | 'paid' | 'overdue';

interface PaymentsData {
  payments: Payment[];
  units: Unit[];
}

function paymentIcon(pt: Payment['type']): IconName {
  switch (pt) {
    case 'monthly_dues':
      return 'buildings';
    case 'expense_split':
      return 'expenses';
    case 'one_off':
      return 'payments';
    case 'rent':
      return 'home';
  }
}

export function PaymentsPage() {
  const { capabilities: caps, user } = useAuth();
  const currency = useCurrency();
  const canCreate = hasAction(caps, ACTIONS.PAYMENT_CREATE);
  const canMarkPaid = hasAction(caps, ACTIONS.PAYMENT_MARK_PAID);
  const canRecord = hasAction(caps, ACTIONS.PAYMENT_RECORD);
  const canManageRent = hasAction(caps, ACTIONS.RENT_MANAGE);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [receivingFor, setReceivingFor] = useState<Payment | null>(null);
  const [newChargeOpen, setNewChargeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t, tf } = useI18n();

  const fetcher = useCallback(async (): Promise<PaymentsData> => {
    const [payments, units] = await Promise.all([listPayments(), listUnits()]);
    return { payments, units };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    fetcher,
    t('payments_err_load')
  );

  // The server returns building-wide payments to a building admin. When
  // that admin flips to OWNER view (no mark-paid capability) they should
  // see exactly what a plain owner sees: their own unit's payments only.
  const myUnitIds = useMemo(
    () =>
      new Set(
        [...(user?.units?.map((u) => u._id) ?? []), user?.unit?._id].filter(Boolean) as string[],
      ),
    [user],
  );
  const all = useMemo(() => {
    const payments = data?.payments ?? [];
    return canMarkPaid ? payments : payments.filter((p) => myUnitIds.has(p.unitId));
  }, [data, canMarkPaid, myUnitIds]);
  const units = useMemo(() => data?.units ?? [], [data]);

  // Rent charges on units the user OWNS are theirs to settle — even without
  // the building-admin mark-paid capability.
  const ownedUnitIds = useMemo(
    () => new Set(units.filter((u) => u.ownerId === user?._id).map((u) => u._id)),
    [units, user],
  );
  const canActOn = useCallback(
    (p: Payment) =>
      canMarkPaid || canRecord || (canManageRent && p.type === 'rent' && ownedUnitIds.has(p.unitId)),
    [canMarkPaid, canRecord, canManageRent, ownedUnitIds],
  );

  // Map unit id → number for display and for the unit filter.
  const numberOf = useCallback(
    (unitId: string) => units.find((u) => u._id === unitId)?.number ?? '—',
    [units]
  );

  const unitsInScope = useMemo(
    () => Array.from(new Set(all.map((p) => numberOf(p.unitId)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [all, numberOf]
  );

  const scoped = useMemo(
    () => (unitFilter === 'all' ? all : all.filter((p) => numberOf(p.unitId) === unitFilter)),
    [all, unitFilter, numberOf]
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return scoped;
    return scoped.filter((p) => p.status === filter);
  }, [scoped, filter]);

  const totalsByStatus = useMemo(() => {
    const totals: Record<Payment['status'], number> = { pending: 0, paid: 0, overdue: 0, waived: 0 };
    scoped.forEach((p) => {
      // Open buckets count what's still owed; the paid bucket counts what
      // actually came in (including partial receipts on open charges).
      totals[p.status] += p.status === 'paid' ? p.amount : remainingOf(p);
      if (p.status !== 'paid') totals.paid += p.paidAmount ?? 0;
    });
    return totals;
  }, [scoped]);

  const summaryAmount =
    filter === 'all' ? totalsByStatus.pending + totalsByStatus.overdue : totalsByStatus[filter];
  const summaryCount = filtered.length;

  async function submitReceipt(input: { paymentIds: string[]; amount: number; note: string }) {
    setBusy(true);
    try {
      const { surplus } = await recordReceipts({
        paymentIds: input.paymentIds,
        amount: input.amount,
        paymentMethod: 'cash',
        note: input.note,
      });
      setReceivingFor(null);
      if (surplus) {
        Alert.alert(tf('unit_credited_to_balance', { amount: fmtMoney(surplus.amount, currency) }));
      }
      await reload();
    } catch (e) {
      Alert.alert(apiErrorMessage(e, t('err_generic')));
    } finally {
      setBusy(false);
    }
  }

  async function createCharges(input: {
    unitIds: string[];
    amountPerUnit: number;
    type: Payment['type'];
    notes: string;
    dueDate: string;
  }) {
    setBusy(true);
    try {
      for (const unitId of input.unitIds) {
        await createPayment({
          unitId,
          type: input.type,
          amount: input.amountPerUnit,
          currency,
          dueDate: input.dueDate,
          notes: input.notes,
        });
      }
      setNewChargeOpen(false);
    } catch (e) {
      Alert.alert(apiErrorMessage(e, t('err_generic')));
    } finally {
      setBusy(false);
      await reload();
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.center}>
        <EmptyState
          iconName="payments"
          title={t('payments_empty_default')}
          body={error}
          action={{ label: t('retry'), onPress: () => void refresh() }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>
            {filter === 'all'
              ? t('payments_outstanding_caps')
              : filter === 'pending'
                ? t('payments_filter_pending')
                : filter === 'paid'
                  ? t('payments_filter_paid')
                  : t('payments_filter_overdue')}
          </Text>
          <Text style={type.display}>{fmtMoney(summaryAmount, currency)}</Text>
          <Text style={type.small}>
            {tf(summaryCount === 1 ? 'payments_count_one' : 'payments_count_many', { count: summaryCount })}
          </Text>
        </View>
        {canCreate && (
          <Button
            label={t('new')}
            variant="primary"
            style={{ paddingHorizontal: 16 }}
            onPress={() => setNewChargeOpen(true)}
          />
        )}
      </View>

      <View style={styles.summaryCards}>
        <SummaryCard label={t('payments_summary_pending')} amount={totalsByStatus.pending} currency={currency} tone="warning" onPress={() => setFilter('pending')} active={filter === 'pending'} />
        <SummaryCard label={t('payments_summary_overdue')} amount={totalsByStatus.overdue} currency={currency} tone="danger" onPress={() => setFilter('overdue')} active={filter === 'overdue'} />
        <SummaryCard label={t('payments_summary_paid')} amount={totalsByStatus.paid} currency={currency} tone="positive" onPress={() => setFilter('paid')} active={filter === 'paid'} />
      </View>

      {unitsInScope.length > 1 && (
        <UnitFilterPicker
          units={unitsInScope}
          value={unitFilter}
          onChange={setUnitFilter}
          counts={unitsInScope.reduce<Record<string, number>>((m, u) => {
            m[u] = all.filter((p) => numberOf(p.unitId) === u).length;
            return m;
          }, {})}
        />
      )}

      <View style={styles.segmentRow}>
        <Segmented
          options={[
            { label: t('payments_filter_all'), value: 'all' },
            { label: t('payments_filter_pending'), value: 'pending' },
            { label: t('payments_filter_paid'), value: 'paid' },
            { label: t('payments_filter_overdue'), value: 'overdue' },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as FilterValue)}
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          iconName="payments"
          title={filter === 'paid' ? t('payments_empty_paid') : filter === 'overdue' ? t('payments_empty_overdue') : t('payments_empty_default')}
          body={filter === 'overdue' ? t('payments_empty_overdue_body') : t('payments_empty_default_body')}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {filtered.map((p) => (
            <PaymentCard
              key={p._id}
              payment={p}
              unitNumber={numberOf(p.unitId)}
              currency={currency}
              canAct={(p.status === 'pending' || p.status === 'overdue') && canActOn(p)}
              canMarkPaid={canMarkPaid}
              onAct={() => setReceivingFor(p)}
            />
          ))}
        </View>
      )}
      <View style={{ height: spacing.xl }} />

      <NewChargeModal
        open={newChargeOpen}
        onClose={() => setNewChargeOpen(false)}
        units={units}
        currency={currency}
        onCreate={(input) => void createCharges(input)}
      />

      {receivingFor && (
        <RecordPaymentModal
          open={!!receivingFor}
          onClose={() => setReceivingFor(null)}
          unitNumber={numberOf(receivingFor.unitId)}
          currency={currency}
          openPayments={all.filter(
            (p) =>
              p.unitId === receivingFor.unitId &&
              (p.status === 'pending' || p.status === 'overdue') &&
              canActOn(p)
          )}
          lockedPaymentIds={[receivingFor._id]}
          submitting={busy}
          onSubmit={(input) => void submitReceipt(input)}
        />
      )}
    </ScrollView>
  );
}

function SummaryCard({ label, amount, currency, tone, onPress, active }: { label: string; amount: number; currency: string; tone: 'warning' | 'danger' | 'positive'; onPress: () => void; active: boolean }) {
  const bg = tone === 'warning' ? palette.warningSoft : tone === 'danger' ? palette.dangerSoft : palette.successSoft;
  const fg = tone === 'warning' ? palette.warning : tone === 'danger' ? palette.danger : palette.success;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.summaryCard, { backgroundColor: bg }, active && { borderColor: fg, borderWidth: 2 }]}>
      <Text style={[styles.summaryLabel, { color: fg }]}>{label}</Text>
      {/* Compact form — the full amount ("₪14,050.00") wraps inside the
          three-across chips and breaks the row. */}
      <Text style={[styles.summaryValue, { color: fg }]} numberOfLines={1}>
        {fmtMoneyCompact(amount, currency)}
      </Text>
    </TouchableOpacity>
  );
}

function PaymentCard({ payment, unitNumber, currency, canAct, canMarkPaid, onAct }: { payment: Payment; unitNumber: string; currency: string; canAct: boolean; canMarkPaid: boolean; onAct: () => void }) {
  const { t, tf } = useI18n();
  const tone: 'positive' | 'danger' | 'warning' | 'neutral' | 'accent' =
    payment.status === 'paid'
      ? 'positive'
      : payment.status === 'overdue'
        ? 'danger'
        : payment.status === 'waived'
          ? 'neutral'
          : 'warning';
  const isLate = payment.status === 'overdue';
  const statusLabel = t(
    payment.status === 'paid' ? 'status_paid'
      : payment.status === 'overdue' ? 'status_overdue'
      : payment.status === 'waived' ? 'status_waived'
      : 'status_pending'
  );

  return (
    <Card style={isLate ? { borderColor: palette.danger, borderWidth: 1.5 } : undefined}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
          <IconCircle iconName={paymentIcon(payment.type)} tone={tone === 'positive' ? 'positive' : tone === 'danger' ? 'danger' : 'accent'} />
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '600' }]}>
              {paymentTypeLabel(t, payment.type)}
            </Text>
            <Text style={type.small}>
              {tf('maint_place_unit', { n: unitNumber })} · {tf('dash_due', { relative: relativeDay(payment.dueDate) })}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Pill label={statusLabel} tone={tone} />
          {isPartiallyPaid(payment) && (
            <Pill
              label={tf('record_payment_paid_inline', { amount: fmtMoney(payment.paidAmount, currency) })}
              tone="accent"
            />
          )}
        </View>
      </View>

      <View style={styles.amountRow}>
        {/* Open charges show what's still owed; partially covered rows keep
            the original amount visible alongside. */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text style={type.title}>
            {fmtMoney(payment.status === 'paid' ? payment.amount : remainingOf(payment), currency)}
          </Text>
          {isPartiallyPaid(payment) && (
            <Text style={[type.small, { textDecorationLine: 'line-through' }]}>
              {fmtMoney(payment.amount, currency)}
            </Text>
          )}
        </View>
        <Text style={type.small}>{fmtDate(payment.dueDate)}</Text>
      </View>

      {canAct && (
        <Button
          label={canMarkPaid ? t('receive_payment') : t('record_payment')}
          onPress={onAct}
          variant={isLate ? 'danger' : 'primary'}
          style={{ marginTop: spacing.md }}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  summaryCards: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summaryCard: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
    ...shadow,
  },
  summaryLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  summaryValue: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  segmentRow: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
});
