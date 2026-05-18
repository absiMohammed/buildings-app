import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { ACTIONS, EMPTY_CAPABILITIES, hasAction } from '../auth/capabilities';
import { Avatar, Button, Card, EmptyState, IconCircle, Pill, SectionHeader } from '../components/ui';
import { palette, radii, shadow, spacing, type, textStart } from '../components/theme';
import {
  filterPaymentsForAdmin,
  fmtMoney,
  fmtMoneyCompact,
  isPaymentOpen,
  relativeDay,
  unitDuesHistory,
  type MockUnit,
  type MockUser,
} from '../mocks/fixtures';
import { useMockStore, type RecordPaymentResult } from '../mocks/store';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { InviteModal } from '../components/InviteModal';
import { BottomSheet } from '../components/BottomSheet';
import type { AppStackParamList } from '../navigation/types';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const statusTone: Record<MockUnit['occupancyStatus'], 'positive' | 'warning' | 'danger'> = {
  occupied: 'positive',
  vacant: 'warning',
  under_construction: 'danger',
};

const STATUS_KEY: Record<MockUnit['occupancyStatus'], StringKey> = {
  occupied: 'units_status_occupied',
  vacant: 'units_status_vacant',
  under_construction: 'unit_set_construction',
};

const roleTone: Record<string, 'accent' | 'positive' | 'warning' | 'neutral'> = {
  admin: 'accent',
  owner: 'positive',
  renter: 'warning',
  dependent: 'neutral',
};

export function UnitDetailPage() {
  const route = useRoute<RouteProp<AppStackParamList, 'UnitDetail'>>();
  const navigation = useNavigation();
  const currency = useCurrency();
  const { user, building, capabilities: caps } = useAuth();
  const canUpdate = hasAction(caps, ACTIONS.UNIT_UPDATE);
  const { units, users, updateUnitStatus, updateUnit, paymentsForUnit, unitBalance, recordPaymentForUnit } = useMockStore();
  const unitNumber = route.params?.unitNumber;
  const [duesModalOpen, setDuesModalOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<RecordPaymentResult | null>(null);
  const buildingDuesDay = building?.settings?.monthlyDuesDay ?? 1;
  const buildingDefaultAmount = building?.settings?.defaultMonthlyDues ?? 0;
  const balance = unitNumber ? unitBalance(unitNumber) : 0;
  const { t, tf } = useI18n();

  const unit = useMemo(() => units.find((u) => u.number === unitNumber), [unitNumber, units]);
  const residents = useMemo<MockUser[]>(
    () => (unitNumber ? users.filter((u) => u.unit === unitNumber) : []),
    [unitNumber, users]
  );
  const rawPayments = useMemo(
    () => (unitNumber ? paymentsForUnit(unitNumber) : []),
    [unitNumber, paymentsForUnit]
  );
  // Admin only sees the building-side payments for a unit — rent stays
  // private between renter and owner.
  const payments = useMemo(
    () => (user?.role === 'admin' ? filterPaymentsForAdmin(rawPayments) : rawPayments),
    [rawPayments, user?.role]
  );
  const history = useMemo(() => (unitNumber ? unitDuesHistory(unitNumber) : []), [unitNumber]);

  if (!unit) {
    return (
      <View style={styles.missing}>
        <EmptyState
          icon="🏢"
          title={t('unit_not_found_title')}
          body={t('unit_not_found_body')}
          action={{ label: t('back'), onPress: () => navigation.goBack() }}
        />
      </View>
    );
  }

  const effectiveAmount = unit?.monthlyDue ?? buildingDefaultAmount;
  const ytdPaid = history.filter((m) => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const ytdOutstanding = history.filter((m) => m.status !== 'paid').reduce((s, m) => s + m.amount, 0);
  const chartData = history.map((m) => ({
    value: m.amount,
    label: m.label,
    frontColor: m.status === 'paid' ? palette.success : m.status === 'overdue' ? palette.danger : palette.warning,
    labelTextStyle: { color: palette.textSubtle, fontSize: 11 },
  }));

  const { removeUser } = useMockStore();

  function confirmRemove(target: MockUser) {
    const fullName = `${target.firstName} ${target.lastName}`;
    Alert.alert(
      tf('unit_remove_user_title', { name: target.firstName }),
      tf('unit_remove_user_body', { name: fullName, n: unit?.number ?? '' }),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('remove'), style: 'destructive', onPress: () => removeUser(target._id) },
      ]
    );
  }

  function invitePrompt() {
    if (!unit) return;
    setInviteOpen(true);
  }

  function promptStatusChange() {
    if (!unit) return;
    Alert.alert(t('unit_change_status_title'), tf('unit_change_status_body', { n: unit.number }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('unit_set_occupied'), onPress: () => updateUnitStatus(unit.number, 'occupied') },
      { text: t('unit_set_vacant'), onPress: () => updateUnitStatus(unit.number, 'vacant') },
      { text: t('unit_set_construction'), onPress: () => updateUnitStatus(unit.number, 'under_construction') },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* Header */}
      <View style={styles.heroRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('unit_label_caps')}</Text>
          <Text style={type.display}>{unit.number}</Text>
          <Text style={type.small}>
            {tf(unit.bedrooms === 1 ? 'unit_meta_floor_bedrooms_one' : 'unit_meta_floor_bedrooms_many', { floor: unit.floor, bedrooms: unit.bedrooms })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-start', gap: 6 }}>
          <Pill label={t(STATUS_KEY[unit.occupancyStatus])} tone={statusTone[unit.occupancyStatus]} />
          {canUpdate && (
            <TouchableOpacity onPress={promptStatusChange} hitSlop={8}>
              <Text style={styles.changeStatus}>{t('unit_change_status')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Quick stats */}
      <View style={styles.statsRow}>
        <StatTile label={t('unit_stat_monthly_dues')} value={fmtMoney(effectiveAmount, currency)} tone="accent" />
        <StatTile label={t('unit_stat_outstanding')} value={fmtMoneyCompact(ytdOutstanding, currency)} tone={ytdOutstanding > 0 ? 'danger' : 'neutral'} />
        <StatTile
          label={balance > 0 ? t('unit_stat_credit') : t('unit_stat_paid_ytd')}
          value={balance > 0 ? fmtMoneyCompact(balance, currency) : fmtMoneyCompact(ytdPaid, currency)}
          tone={balance > 0 ? 'accent' : 'positive'}
        />
      </View>

      {canUpdate && (
        <View style={styles.cta}>
          <Button label={t('unit_record_payment')} variant="primary" onPress={() => setRecordOpen(true)} />
          {balance > 0 && (
            <Text style={[type.small, { marginTop: 6 }]}>
              {tf('unit_credit_on_file', { amount: fmtMoney(balance, currency) })}
            </Text>
          )}
          {lastReceipt && (
            <View style={styles.receipt}>
              <Text style={styles.receiptTitle}>{t('unit_last_payment_applied')}</Text>
              {lastReceipt.appliedTo.map((a) => (
                <Text key={a.paymentId} style={styles.receiptLine}>
                  • {a.type.replace('_', ' ')}: {fmtMoney(a.amount, currency)}
                </Text>
              ))}
              {lastReceipt.credited > 0 && (
                <Text style={styles.receiptCredit}>
                  {tf('unit_credited_to_balance', { amount: fmtMoney(lastReceipt.credited, currency) })}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.duesRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.caption}>{t('unit_dues_schedule_caps')}</Text>
            <Text style={[type.heading, { marginTop: 4 }]}>
              {tf('unit_dues_summary', {
                amount: fmtMoney(effectiveAmount, currency),
                day: unit.duesDayOverride ?? buildingDuesDay,
              })}
            </Text>
            <Text style={type.small}>
              {unit.monthlyDue == null
                ? tf('unit_dues_follows_default', { amount: fmtMoney(buildingDefaultAmount, currency) })
                : tf('unit_dues_custom_amount', { amount: fmtMoney(buildingDefaultAmount, currency) })}
            </Text>
            <Text style={[type.small, { marginTop: 2 }]}>
              {unit.duesDayOverride != null
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
      </Card>

      {/* Residents */}
      <View style={styles.residentsHeader}>
        <Text style={type.heading}>{t('unit_residents')}</Text>
        <Button label={t('new_invite')} variant="primary" style={{ paddingHorizontal: 14 }} onPress={invitePrompt} />
      </View>

      <Card padded={false}>
        {residents.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Text style={type.small}>{t('unit_no_residents')}</Text>
          </View>
        ) : (
          residents.map((u, i) => (
            <View key={u._id}>
              <View style={styles.residentRow}>
                <Avatar name={`${u.firstName} ${u.lastName}`} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '600' }]}>{u.firstName} {u.lastName}</Text>
                  <Text style={type.small}>{u.email}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <Pill
                      label={t(u.role === 'admin' ? 'role_admin' : u.role === 'owner' ? 'role_owner' : u.role === 'renter' ? 'role_renter' : 'role_dependent')}
                      tone={roleTone[u.role]}
                    />
                    <Pill
                      label={t(u.status === 'active' ? 'user_status_active' : u.status === 'invited' ? 'user_status_invited' : 'user_status_suspended')}
                      tone={u.status === 'active' ? 'positive' : u.status === 'invited' ? 'accent' : 'danger'}
                    />
                  </View>
                </View>
                <TouchableOpacity onPress={() => confirmRemove(u)} hitSlop={8}>
                  <Text style={styles.removeText}>{t('remove')}</Text>
                </TouchableOpacity>
              </View>
              {i < residents.length - 1 && <View style={styles.divider} />}
            </View>
          ))
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
                    : p.status === 'partially_paid'
                      ? 'accent'
                      : 'warning';
            const isPartial = p.status === 'partially_paid';
            const statusLabelText = t(
              p.status === 'paid' ? 'status_paid'
                : p.status === 'overdue' ? 'status_overdue'
                : p.status === 'waived' ? 'status_waived'
                : p.status === 'partially_paid' ? 'status_partially_paid'
                : 'status_pending'
            );
            const typeLabel = t(
              p.type === 'rent' ? 'ptype_rent'
                : p.type === 'building_dues' ? 'ptype_building_dues'
                : p.type === 'utilities' ? 'ptype_utilities'
                : 'ptype_special'
            );
            return (
              <View key={p._id}>
                <View style={styles.paymentRow}>
                  <IconCircle
                    glyph={p.type === 'rent' ? '🏠' : p.type === 'utilities' ? '💡' : '🏢'}
                    tone={tone === 'positive' ? 'positive' : tone === 'danger' ? 'danger' : 'accent'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { fontWeight: '600' }]}>{typeLabel}</Text>
                    <Text style={type.small}>
                      {tf('dash_due', { relative: relativeDay(p.dueDate) })}
                      {isPartial ? ` · ${tf('record_payment_paid_inline', { amount: fmtMoney(p.paidAmount ?? 0, currency) })}` : ''}
                    </Text>
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
        openPayments={payments.filter(isPaymentOpen)}
        onSubmit={({ amount, selectedIds, note }) => {
          const r = recordPaymentForUnit(unit.number, amount, { selectedPaymentIds: selectedIds, note });
          setLastReceipt(r);
          setRecordOpen(false);
        }}
      />

      <EditDuesModal
        open={duesModalOpen}
        onClose={() => setDuesModalOpen(false)}
        currentAmount={unit.monthlyDue}
        currentOverride={unit.duesDayOverride ?? null}
        buildingDay={buildingDuesDay}
        buildingDefaultAmount={buildingDefaultAmount}
        currency={currency}
        onSave={(amount, dayOverride) => {
          updateUnit(unit.number, { monthlyDue: amount, duesDayOverride: dayOverride });
          setDuesModalOpen(false);
        }}
      />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        defaultRole="renter"
        allowedRoles={['owner', 'renter', 'dependent']}
        lockedUnit={{
          _id: unit._id,
          number: unit.number,
          hasOwner: residents.some((r) => r.role === 'owner' && r.status !== 'suspended'),
          hasRenter: residents.some((r) => r.role === 'renter' && r.status !== 'suspended'),
        }}
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
  missing: { flex: 1, justifyContent: 'center', backgroundColor: palette.bg },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  changeStatus: { color: palette.accent, fontSize: 12, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statTile: { flex: 1, borderRadius: radii.lg, padding: spacing.md, ...shadow },
  statLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { fontSize: 16, fontWeight: '700', marginTop: 4 },

  legendRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  residentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
  residentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  removeText: { color: palette.danger, fontSize: 13, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg },

  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  duesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cta: { marginBottom: spacing.md },
  receipt: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.successSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  receiptTitle: { color: palette.success, fontWeight: '700', marginBottom: 4, fontSize: 13 },
  receiptLine: { color: palette.success, fontSize: 13, marginTop: 2 },
  receiptCredit: { color: palette.accent, fontSize: 13, marginTop: 6, fontWeight: '600' },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  typeChipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  typeChipGlyph: { fontSize: 14 },
  typeChipText: { fontSize: 12, color: palette.textMuted, fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },
  summary: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md,
  },
  summaryRow: { fontSize: 13, color: palette.textMuted, marginTop: 2 },
  summaryStrong: { color: palette.text, fontWeight: '700' },
});
