import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { fmtMoney, fmtMoneyCompact, relativeDay } from '../utils/format';
import {
  createPayment,
  listPayments,
  payPayment,
  updatePayment,
  type Payment,
} from '../api/payments';
import { listUnits, type Unit } from '../api/units';
import { useApiResource } from '../api/useApiResource';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { NewChargeModal } from '../components/NewChargeModal';
import { UnitFilterPicker } from '../components/UnitFilterPicker';
import { useI18n } from '../i18n';

type FilterValue = 'all' | 'pending' | 'paid' | 'overdue';

interface PaymentsData {
  payments: Payment[];
  units: Unit[];
}

// Every payment type has a translated label — never show a raw enum value.
function paymentTypeLabel(pt: Payment['type'], t: ReturnType<typeof useI18n>['t']): string {
  if (pt === 'monthly_dues') return t('ptype_building_dues');
  if (pt === 'expense_split') return t('ptype_utilities');
  if (pt === 'rent') return t('ptype_rent');
  return t('ptype_special');
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
  const { t, tf } = useI18n();

  const fetcher = useCallback(async (): Promise<PaymentsData> => {
    const [payments, units] = await Promise.all([listPayments(), listUnits()]);
    return { payments, units };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    fetcher,
    'Could not load payments.'
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
    (unitId: string) => units.find((u) => u._id === unitId)?.number ?? unitId,
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
      totals[p.status] += p.amount;
    });
    return totals;
  }, [scoped]);

  const summaryAmount =
    filter === 'all' ? totalsByStatus.pending + totalsByStatus.overdue : totalsByStatus[filter];
  const summaryCount = filtered.length;

  async function markSelectedPaid(ids: string[]) {
    for (const id of ids) {
      const p = all.find((x) => x._id === id);
      // PATCH covers both the admin mark-paid path and the owner rent path;
      // POST /:id/pay is the (admin-recorded) resident self-record fallback.
      if (canMarkPaid || (p && canActOn(p))) {
        await updatePayment(id, { status: 'paid', paymentMethod: 'cash' });
      } else {
        await payPayment(id, { paymentMethod: 'cash' });
      }
    }
    setReceivingFor(null);
    await reload();
  }

  async function createCharges(input: {
    unitIds: string[];
    amountPerUnit: number;
    type: Payment['type'];
    notes: string;
    dueDate: string;
  }) {
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
    await reload();
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
          action={{ label: t('back'), onPress: () => void refresh() }}
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
                ? t('payments_filter_pending').toUpperCase()
                : filter === 'paid'
                  ? t('payments_filter_paid').toUpperCase()
                  : t('payments_filter_overdue').toUpperCase()}
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
          onSubmit={({ selectedIds }) => void markSelectedPaid(selectedIds)}
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
              {paymentTypeLabel(payment.type, t)}
            </Text>
            <Text style={type.small}>
              {tf('maint_place_unit', { n: unitNumber })} · {tf('dash_due', { relative: relativeDay(payment.dueDate) })}
            </Text>
          </View>
        </View>
        <Pill label={statusLabel} tone={tone} />
      </View>

      <View style={styles.amountRow}>
        <Text style={type.title}>{fmtMoney(payment.amount, currency)}</Text>
        <Text style={type.small}>{new Date(payment.dueDate).toLocaleDateString()}</Text>
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
  scroll: { padding: spacing.lg, paddingBottom: 120 },
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
