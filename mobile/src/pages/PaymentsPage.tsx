import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth, useCurrency, type Role } from '../auth/AuthContext';
import { ACTIONS, EMPTY_CAPABILITIES, hasAction } from '../auth/capabilities';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import {
  Button,
  Card,
  EmptyState,
  IconCircle,
  Pill,
  Segmented,
} from '../components/ui';
import { fmtMoney, isPaymentOpen, paymentOwed, relativeDay, type MockPayment } from '../mocks/fixtures';
import { useMockStore } from '../mocks/store';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { NewChargeModal } from '../components/NewChargeModal';
import { UnitFilterPicker } from '../components/UnitFilterPicker';
import { useI18n } from '../i18n';

type FilterValue = 'all' | 'pending' | 'paid' | 'overdue' | 'partially_paid';
type DirectionValue = 'incoming' | 'outgoing';

export function PaymentsPage() {
  const { user, capabilities: caps } = useAuth();
  const role = (user?.role ?? 'renter') as Role;
  const currency = useCurrency();
  const canCreate = hasAction(caps, ACTIONS.PAYMENT_CREATE);
  const canMarkPaid = hasAction(caps, ACTIONS.PAYMENT_MARK_PAID);
  const canRecord = hasAction(caps, ACTIONS.PAYMENT_RECORD);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [direction, setDirection] = useState<DirectionValue>('incoming');
  const [receivingFor, setReceivingFor] = useState<MockPayment | null>(null);
  const [newChargeOpen, setNewChargeOpen] = useState(false);
  const { paymentsForRole, paymentsForUnit, recordPaymentForUnit, createCharge, units } = useMockStore();
  const { t, tf } = useI18n();

  const all = useMemo(() => paymentsForRole(role), [role, paymentsForRole]);

  // Owner sees two distinct flows: rent they collect, and the dues they owe
  // the building. Other roles see a single combined list.
  const directional = useMemo(() => {
    if (role !== 'owner') return all;
    if (direction === 'incoming') return all.filter((p) => p.payee === 'owner');
    return all.filter((p) => p.payee === 'building');
  }, [all, role, direction]);

  const unitsInScope = useMemo(
    () => Array.from(new Set(directional.map((p) => p.unitId))).sort(),
    [directional]
  );
  const scoped = useMemo(
    () => (unitFilter === 'all' ? directional : directional.filter((p) => p.unitId === unitFilter)),
    [directional, unitFilter]
  );
  const filtered = useMemo(() => {
    if (filter === 'all') return scoped;
    if (filter === 'pending') return scoped.filter((p) => p.status === 'pending' || p.status === 'partially_paid');
    return scoped.filter((p) => p.status === filter);
  }, [scoped, filter]);

  const totalsByStatus = useMemo(() => {
    const totals: Record<MockPayment['status'], number> = { pending: 0, paid: 0, overdue: 0, waived: 0, partially_paid: 0 };
    // Outstanding = remaining owed (so partials show the unpaid portion).
    scoped.forEach((p) => {
      if (p.status === 'paid' || p.status === 'waived') {
        totals[p.status] += p.amount;
      } else {
        totals[p.status] += paymentOwed(p);
      }
    });
    return totals;
  }, [scoped]);

  const summaryAmount =
    filter === 'all'
      ? totalsByStatus.pending + totalsByStatus.overdue + totalsByStatus.partially_paid
      : totalsByStatus[filter];
  const summaryCount = filtered.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>
            {role === 'owner'
              ? direction === 'incoming'
                ? t('payments_owner_rent_caption')
                : t('payments_owner_dues_caption')
              : filter === 'all'
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

      {role === 'owner' && (
        <View style={styles.directionRow}>
          <Segmented
            options={[
              { label: t('payments_direction_rent'), value: 'incoming' },
              { label: t('payments_direction_dues'), value: 'outgoing' },
            ]}
            value={direction}
            onChange={(v) => {
              setDirection(v as DirectionValue);
              setFilter('all');
              setUnitFilter('all');
            }}
          />
        </View>
      )}

      <View style={styles.summaryCards}>
        <SummaryCard label={t('payments_summary_pending')} amount={totalsByStatus.pending + totalsByStatus.partially_paid} currency={currency} tone="warning" onPress={() => setFilter('pending')} active={filter === 'pending'} />
        <SummaryCard label={t('payments_summary_overdue')} amount={totalsByStatus.overdue} currency={currency} tone="danger" onPress={() => setFilter('overdue')} active={filter === 'overdue'} />
        <SummaryCard label={t('payments_summary_paid')} amount={totalsByStatus.paid} currency={currency} tone="positive" onPress={() => setFilter('paid')} active={filter === 'paid'} />
      </View>

      {role === 'admin' && unitsInScope.length > 1 && (
        <UnitFilterPicker
          units={unitsInScope}
          value={unitFilter}
          onChange={setUnitFilter}
          counts={unitsInScope.reduce<Record<string, number>>((m, u) => {
            m[u] = all.filter((p) => p.unitId === u).length;
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
          icon="💸"
          title={filter === 'paid' ? t('payments_empty_paid') : filter === 'overdue' ? t('payments_empty_overdue') : t('payments_empty_default')}
          body={filter === 'overdue' ? t('payments_empty_overdue_body') : t('payments_empty_default_body')}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {filtered.map((p) => (
            <PaymentCard
              key={p._id}
              payment={p}
              currency={currency}
              role={role}
              canMarkPaid={canMarkPaid}
              canRecord={canRecord}
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
        onCreate={(input) => {
          createCharge(input);
          setNewChargeOpen(false);
        }}
      />

      {receivingFor && (
        <RecordPaymentModal
          open={!!receivingFor}
          onClose={() => setReceivingFor(null)}
          unitNumber={receivingFor.unitId}
          currency={currency}
          openPayments={paymentsForUnit(receivingFor.unitId).filter(isPaymentOpen)}
          lockedPaymentIds={[receivingFor._id]}
          onSubmit={({ amount, selectedIds, note }) => {
            recordPaymentForUnit(receivingFor.unitId, amount, {
              selectedPaymentIds: selectedIds,
              note,
            });
            setReceivingFor(null);
          }}
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
      <Text style={[styles.summaryValue, { color: fg }]}>{fmtMoney(amount, currency)}</Text>
    </TouchableOpacity>
  );
}

function PaymentCard({ payment, currency, role, canMarkPaid, canRecord, onAct }: { payment: MockPayment; currency: string; role: Role; canMarkPaid: boolean; canRecord: boolean; onAct: () => void }) {
  const { t, tf } = useI18n();
  // Only the payee can record a receipt. Admin handles building-side
  // payments; owner handles rent collected from a tenant. Anyone else just
  // sees the row read-only.
  const viewerIsPayee =
    (role === 'admin' && payment.payee === 'building' && canMarkPaid) ||
    (role === 'owner' && payment.payee === 'owner' && canRecord);
  const tone: 'positive' | 'danger' | 'warning' | 'neutral' | 'accent' =
    payment.status === 'paid'
      ? 'positive'
      : payment.status === 'overdue'
        ? 'danger'
        : payment.status === 'waived'
          ? 'neutral'
          : payment.status === 'partially_paid'
            ? 'accent'
            : 'warning';
  const open = isPaymentOpen(payment);
  const canAct = open && viewerIsPayee;
  const isLate = payment.status === 'overdue';
  const owed = paymentOwed(payment);
  const isPartial = payment.status === 'partially_paid';
  const statusLabel = t(
    payment.status === 'paid' ? 'status_paid'
      : payment.status === 'overdue' ? 'status_overdue'
      : payment.status === 'waived' ? 'status_waived'
      : payment.status === 'partially_paid' ? 'status_partially_paid'
      : 'status_pending'
  );

  return (
    <Card style={isLate ? { borderColor: palette.danger, borderWidth: 1.5 } : undefined}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
          <IconCircle glyph={paymentGlyph(payment.type)} tone={tone === 'positive' ? 'positive' : tone === 'danger' ? 'danger' : tone === 'accent' ? 'accent' : 'accent'} />
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '600' }]}>
              {paymentTypeLabel(payment.type, t)}
            </Text>
            <Text style={type.small}>
              {tf('maint_place_unit', { n: payment.unitId })} · {tf('dash_due', { relative: relativeDay(payment.dueDate) })}
            </Text>
          </View>
        </View>
        <Pill label={statusLabel} tone={tone} />
      </View>

      <View style={styles.amountRow}>
        <View>
          <Text style={type.title}>{fmtMoney(open ? owed : payment.amount, currency)}</Text>
          {isPartial && (
            <Text style={type.small}>
              {tf('payments_paid_of', {
                paid: fmtMoney(payment.paidAmount ?? 0, currency),
                amount: fmtMoney(payment.amount, currency),
              })}
            </Text>
          )}
        </View>
        <Text style={type.small}>{new Date(payment.dueDate).toLocaleDateString()}</Text>
      </View>

      {canAct && (
        <Button
          label={isPartial ? t('receive_more') : canMarkPaid ? t('receive_payment') : t('record_payment')}
          onPress={onAct}
          variant={isLate ? 'danger' : 'primary'}
          style={{ marginTop: spacing.md }}
        />
      )}
    </Card>
  );
}

function paymentTypeLabel(type: MockPayment['type'], t: ReturnType<typeof useI18n>['t']): string {
  switch (type) {
    case 'rent': return t('ptype_rent');
    case 'building_dues': return t('ptype_building_dues');
    case 'utilities': return t('ptype_utilities');
    case 'special_assessment': return t('ptype_special');
  }
}

function paymentGlyph(t: MockPayment['type']): string {
  switch (t) {
    case 'rent':
      return '🏠';
    case 'building_dues':
      return '🏢';
    case 'utilities':
      return '💡';
    case 'special_assessment':
      return '★';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
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
  directionRow: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
});
