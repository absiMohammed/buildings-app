import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useAuth, useCurrency } from '../auth/AuthContext';
import { ACTIONS, hasAction } from '../auth/capabilities';
import { Button, Card, EmptyState, IconCircle, Pill, SectionHeader } from '../components/ui';
import { type IconName } from '../components/Icon';
import { palette, radii, shadow, spacing, type, textStart } from '../components/theme';
import { fmtMoney, fmtMoneyCompact, relativeDay } from '../utils/format';
import { listUnits, updateUnit, type Unit } from '../api/units';
import { listPayments, updatePayment, type Payment } from '../api/payments';
import { useApiResource } from '../api/useApiResource';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { BottomSheet } from '../components/BottomSheet';
import type { AppStackParamList } from '../navigation/types';
import { useI18n } from '../i18n';

interface UnitDetailData {
  units: Unit[];
  payments: Payment[];
}

// Reuse the existing dues label where it maps; otherwise prettify the raw type.
function paymentTypeLabel(pt: Payment['type'], t: ReturnType<typeof useI18n>['t']): string {
  if (pt === 'monthly_dues') return t('ptype_building_dues');
  return pt
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function paymentIcon(pt: Payment['type']): IconName {
  switch (pt) {
    case 'monthly_dues':
      return 'units';
    case 'expense_split':
      return 'expenses';
    case 'one_off':
      return 'payments';
  }
}

interface MonthBucket {
  key: string;
  label: string;
  amount: number;
  status: 'paid' | 'overdue' | 'pending';
}

// Group real unit payments by calendar month for the dues chart. No fabricated
// data — months with no payments simply don't appear.
function groupByMonth(payments: Payment[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const p of payments) {
    const d = new Date(p.dueDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const existing = map.get(key);
    const label = d.toLocaleString('en-US', { month: 'short' });
    if (existing) {
      existing.amount += p.amount;
      if (p.status === 'overdue') existing.status = 'overdue';
      else if (existing.status !== 'overdue' && p.status !== 'paid') existing.status = 'pending';
    } else {
      map.set(key, {
        key,
        label,
        amount: p.amount,
        status: p.status === 'overdue' ? 'overdue' : p.status === 'paid' ? 'paid' : 'pending',
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);
}

export function UnitDetailPage() {
  const route = useRoute<RouteProp<AppStackParamList, 'UnitDetail'>>();
  const navigation = useNavigation();
  const currency = useCurrency();
  const { building, capabilities: caps } = useAuth();
  const canUpdate = hasAction(caps, ACTIONS.UNIT_UPDATE);
  const canMarkPaid = hasAction(caps, ACTIONS.PAYMENT_MARK_PAID);
  const unitNumber = route.params?.unitNumber;
  const [duesModalOpen, setDuesModalOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const buildingDuesDay = building?.settings?.monthlyDuesDay ?? 1;
  const buildingDefaultAmount = building?.settings?.defaultMonthlyDues ?? 0;
  const { t, tf } = useI18n();

  const fetcher = useCallback(async (): Promise<UnitDetailData> => {
    const [units, payments] = await Promise.all([listUnits(), listPayments()]);
    return { units, payments };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    fetcher,
    'Could not load unit.'
  );

  const unit = useMemo(
    () => data?.units.find((u) => u.number === unitNumber),
    [data, unitNumber]
  );
  const payments = useMemo(
    () => (unit ? (data?.payments ?? []).filter((p) => p.unitId === unit._id) : []),
    [data, unit]
  );
  const history = useMemo(() => groupByMonth(payments), [payments]);

  async function markSelectedPaid(ids: string[]) {
    for (const id of ids) {
      await updatePayment(id, { status: 'paid', paymentMethod: 'cash' });
    }
    setRecordOpen(false);
    await reload();
  }

  async function saveDues(amount: number | null, dayOverride: number | null) {
    if (!unit) return;
    // monthlyDuesAmount accepts null (inherit default); build the patch loosely
    // so we can clear it when the admin turns custom off.
    const patch: Record<string, unknown> = {
      monthlyDuesAmount: amount,
      monthlyDuesDayOverride: dayOverride,
    };
    await updateUnit(unit._id, patch as Parameters<typeof updateUnit>[1]);
    setDuesModalOpen(false);
    await reload();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (!unit) {
    return (
      <View style={styles.missing}>
        <EmptyState
          iconName="units"
          title={t('unit_not_found_title')}
          body={error ?? t('unit_not_found_body')}
          action={{ label: t('back'), onPress: () => navigation.goBack() }}
        />
      </View>
    );
  }

  const effectiveAmount = unit.monthlyDuesAmount ?? buildingDefaultAmount;
  const outstanding = payments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .reduce((s, p) => s + p.amount, 0);
  const paidTotal = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const occupied = unit.occupants.length > 0;
  const openPayments = payments.filter((p) => p.status === 'pending' || p.status === 'overdue');
  const chartData = history.map((m) => ({
    value: m.amount,
    label: m.label,
    frontColor: m.status === 'paid' ? palette.success : m.status === 'overdue' ? palette.danger : palette.warning,
    labelTextStyle: { color: palette.textSubtle, fontSize: 11 },
  }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      {/* Header */}
      <View style={styles.heroRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('unit_label_caps')}</Text>
          <Text style={type.display}>{unit.number}</Text>
          <Text style={type.small}>
            {tf((unit.bedrooms ?? 0) === 1 ? 'unit_meta_floor_bedrooms_one' : 'unit_meta_floor_bedrooms_many', { floor: unit.floor ?? '—', bedrooms: unit.bedrooms ?? 0 })}
          </Text>
        </View>
        <Pill
          label={t(occupied ? 'units_status_occupied' : 'units_status_vacant')}
          tone={occupied ? 'positive' : 'warning'}
        />
      </View>

      {/* Quick stats */}
      <View style={styles.statsRow}>
        <StatTile label={t('unit_stat_monthly_dues')} value={fmtMoney(effectiveAmount, currency)} tone="accent" />
        <StatTile label={t('unit_stat_outstanding')} value={fmtMoneyCompact(outstanding, currency)} tone={outstanding > 0 ? 'danger' : 'neutral'} />
        <StatTile label={t('unit_stat_paid_ytd')} value={fmtMoneyCompact(paidTotal, currency)} tone="positive" />
      </View>

      {canMarkPaid && openPayments.length > 0 && (
        <View style={styles.cta}>
          <Button label={t('unit_record_payment')} variant="primary" onPress={() => setRecordOpen(true)} />
        </View>
      )}

      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.duesRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.caption}>{t('unit_dues_schedule_caps')}</Text>
            <Text style={[type.heading, { marginTop: 4 }]}>
              {tf('unit_dues_summary', {
                amount: fmtMoney(effectiveAmount, currency),
                day: unit.monthlyDuesDayOverride ?? buildingDuesDay,
              })}
            </Text>
            <Text style={type.small}>
              {unit.monthlyDuesAmount == null
                ? tf('unit_dues_follows_default', { amount: fmtMoney(buildingDefaultAmount, currency) })
                : tf('unit_dues_custom_amount', { amount: fmtMoney(buildingDefaultAmount, currency) })}
            </Text>
            <Text style={[type.small, { marginTop: 2 }]}>
              {unit.monthlyDuesDayOverride != null
                ? tf('unit_dues_custom_day', { day: buildingDuesDay })
                : tf('unit_dues_follows_day', { day: buildingDuesDay })}
            </Text>
          </View>
          {canUpdate && (
            <Button label={t('edit')} variant="secondary" onPress={() => setDuesModalOpen(true)} style={{ paddingHorizontal: 16 }} />
          )}
        </View>
      </Card>

      {/* Chart */}
      <SectionHeader title={t('unit_chart_6mo')} />
      <Card>
        {chartData.length === 0 ? (
          <View style={{ padding: spacing.md }}>
            <Text style={type.small}>{t('unit_no_payments')}</Text>
          </View>
        ) : (
          <>
            <BarChart
              data={chartData}
              barWidth={26}
              spacing={16}
              height={150}
              barBorderRadius={6}
              hideRules
              noOfSections={4}
              yAxisColor={palette.border}
              xAxisColor={palette.border}
              yAxisTextStyle={{ color: palette.textSubtle, fontSize: 10 }}
            />
            <View style={styles.legendRow}>
              <Legend color={palette.success} label={t('unit_legend_paid')} />
              <Legend color={palette.warning} label={t('unit_legend_pending')} />
              <Legend color={palette.danger} label={t('unit_legend_overdue')} />
            </View>
          </>
        )}
      </Card>

      {/* Residents */}
      <View style={styles.residentsHeader}>
        <Text style={type.heading}>{t('unit_residents')}</Text>
      </View>
      <Card>
        {unit.occupants.length === 0 ? (
          <Text style={type.small}>{t('unit_no_residents')}</Text>
        ) : (
          <View style={styles.residentsCount}>
            <Text style={styles.residentsNumber}>{unit.occupants.length}</Text>
            <Text style={type.small}>{t('unit_residents')}</Text>
          </View>
        )}
      </Card>

      {/* Payments */}
      <SectionHeader title={t('unit_payments_section')} />
      <Card padded={false}>
        {payments.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Text style={type.small}>{t('unit_no_payments')}</Text>
          </View>
        ) : (
          payments.map((p, i) => {
            const tone: 'positive' | 'danger' | 'warning' | 'neutral' | 'accent' =
              p.status === 'paid'
                ? 'positive'
                : p.status === 'overdue'
                  ? 'danger'
                  : p.status === 'waived'
                    ? 'neutral'
                    : 'warning';
            const statusLabelText = t(
              p.status === 'paid' ? 'status_paid'
                : p.status === 'overdue' ? 'status_overdue'
                : p.status === 'waived' ? 'status_waived'
                : 'status_pending'
            );
            return (
              <View key={p._id}>
                <View style={styles.paymentRow}>
                  <IconCircle
                    iconName={paymentIcon(p.type)}
                    tone={tone === 'positive' ? 'positive' : tone === 'danger' ? 'danger' : 'accent'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { fontWeight: '600' }]}>{paymentTypeLabel(p.type, t)}</Text>
                    <Text style={type.small}>{tf('dash_due', { relative: relativeDay(p.dueDate) })}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={[type.body, { fontWeight: '600' }]}>{fmtMoney(p.amount, currency)}</Text>
                    <Pill label={statusLabelText} tone={tone} />
                  </View>
                </View>
                {i < payments.length - 1 && <View style={styles.divider} />}
              </View>
            );
          })
        )}
      </Card>

      <View style={{ height: spacing.xl }} />

      <RecordPaymentModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        unitNumber={unit.number}
        currency={currency}
        openPayments={openPayments}
        onSubmit={({ selectedIds }) => void markSelectedPaid(selectedIds)}
      />

      <EditDuesModal
        open={duesModalOpen}
        onClose={() => setDuesModalOpen(false)}
        currentAmount={unit.monthlyDuesAmount}
        currentOverride={unit.monthlyDuesDayOverride}
        buildingDay={buildingDuesDay}
        buildingDefaultAmount={buildingDefaultAmount}
        currency={currency}
        onSave={saveDues}
      />
    </ScrollView>
  );
}

function EditDuesModal({
  open,
  onClose,
  currentAmount,
  currentOverride,
  buildingDay,
  buildingDefaultAmount,
  currency,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  currentAmount: number | null;
  currentOverride: number | null;
  buildingDay: number;
  buildingDefaultAmount: number;
  currency: string;
  onSave: (amount: number | null, dayOverride: number | null) => void;
}) {
  const [customAmount, setCustomAmount] = useState(currentAmount != null);
  const [amount, setAmount] = useState(String(currentAmount ?? buildingDefaultAmount));
  const [useOverride, setUseOverride] = useState(currentOverride != null);
  const [day, setDay] = useState(String(currentOverride ?? buildingDay));

  useEffect(() => {
    if (open) {
      setCustomAmount(currentAmount != null);
      setAmount(String(currentAmount ?? buildingDefaultAmount));
      setUseOverride(currentOverride != null);
      setDay(String(currentOverride ?? buildingDay));
    }
  }, [open, currentAmount, currentOverride, buildingDay, buildingDefaultAmount]);

  const amountN = parseFloat(amount.replace(/,/g, ''));
  const dayN = parseInt(day, 10);
  const amountValid = !customAmount || (Number.isFinite(amountN) && amountN >= 0);
  const dayValid = !useOverride || (Number.isFinite(dayN) && dayN >= 1 && dayN <= 28);
  const valid = amountValid && dayValid;
  const { t, tf } = useI18n();

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View>
        <Text style={[type.title, { marginBottom: spacing.sm }]}>{t('edit_dues_title')}</Text>
        <Text style={[type.small, { marginBottom: spacing.md }]}>{t('edit_dues_body')}</Text>

        <View style={modalStyles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '600' }]}>{t('edit_dues_custom_amount')}</Text>
            <Text style={type.small}>
              {customAmount
                ? t('edit_dues_custom_on')
                : tf('edit_dues_custom_off', { amount: fmtMoney(buildingDefaultAmount, currency) })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setCustomAmount((v) => !v)}
            style={[modalStyles.switch, customAmount && modalStyles.switchOn]}
            activeOpacity={0.85}
          >
            <View style={[modalStyles.switchKnob, customAmount && modalStyles.switchKnobOn]} />
          </TouchableOpacity>
        </View>

        {customAmount && (
          <>
            <Text style={modalStyles.label}>{t('edit_dues_monthly_amount')}</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={palette.textSubtle}
              style={modalStyles.input}
            />
          </>
        )}

        <View style={modalStyles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '600' }]}>{t('edit_dues_override_day')}</Text>
            <Text style={type.small}>
              {useOverride
                ? tf('edit_dues_override_on', { day: day || '?' })
                : tf('edit_dues_override_off', { day: buildingDay })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setUseOverride((v) => !v)}
            style={[modalStyles.switch, useOverride && modalStyles.switchOn]}
            activeOpacity={0.85}
          >
            <View style={[modalStyles.switchKnob, useOverride && modalStyles.switchKnobOn]} />
          </TouchableOpacity>
        </View>

        {useOverride && (
          <>
            <Text style={modalStyles.label}>{t('edit_dues_custom_day_label')}</Text>
            <TextInput
              value={day}
              onChangeText={setDay}
              keyboardType="number-pad"
              maxLength={2}
              placeholder={String(buildingDay)}
              placeholderTextColor={palette.textSubtle}
              style={modalStyles.input}
            />
          </>
        )}

        <View style={modalStyles.actions}>
          <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={t('save')}
            onPress={() => onSave(customAmount ? amountN : null, useOverride ? dayN : null)}
            disabled={!valid}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'positive' | 'warning' | 'danger' | 'neutral' }) {
  const fg =
    tone === 'accent' ? palette.accent :
    tone === 'positive' ? palette.success :
    tone === 'warning' ? palette.warning :
    tone === 'danger' ? palette.danger :
    palette.textMuted;
  const bg =
    tone === 'accent' ? palette.accentSoft :
    tone === 'positive' ? palette.successSoft :
    tone === 'warning' ? palette.warningSoft :
    tone === 'danger' ? palette.dangerSoft :
    palette.surfaceMuted;
  return (
    <View style={[styles.statTile, { backgroundColor: bg }]}>
      <Text style={[styles.statLabel, { color: fg }]}>{label}</Text>
      <Text style={[styles.statValue, { color: fg }]}>{value}</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  missing: { flex: 1, justifyContent: 'center', backgroundColor: palette.bg },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statTile: { flex: 1, borderRadius: radii.lg, padding: spacing.md, ...shadow },
  statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { fontSize: 16, fontWeight: '700', marginTop: 4 },

  legendRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  residentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
  residentsCount: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  residentsNumber: { fontSize: 28, fontWeight: '700', color: palette.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg },

  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  duesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cta: { marginBottom: spacing.md },
});

const modalStyles = StyleSheet.create({
  label: { ...type.small, color: palette.textMuted, marginTop: spacing.md, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,    ...textStart,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  switch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
    padding: 2,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  switchOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  switchKnobOn: { transform: [{ translateX: 22 }] },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
