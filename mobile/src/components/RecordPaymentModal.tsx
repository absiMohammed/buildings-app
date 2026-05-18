import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fmtMoney, paymentOwed, relativeDay, type MockPayment } from '../mocks/fixtures';
import { palette, radii, spacing, type, textStart } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const PTYPE_KEY: Record<MockPayment['type'], StringKey> = {
  rent: 'ptype_rent',
  building_dues: 'ptype_building_dues',
  utilities: 'ptype_utilities',
  special_assessment: 'ptype_special',
};

const PSTATUS_KEY: Record<MockPayment['status'], StringKey> = {
  paid: 'status_paid',
  pending: 'status_pending',
  overdue: 'status_overdue',
  waived: 'status_waived',
  partially_paid: 'status_partially_paid',
};

export interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  unitNumber: string;
  currency: string;
  openPayments: MockPayment[]; // pending / overdue / partially_paid items for this unit
  // When set, the user can't change which payment(s) are receiving the money.
  // Useful for the per-row "Receive payment" action on the Payments page.
  lockedPaymentIds?: string[];
  onSubmit: (input: { amount: number; selectedIds: string[]; note?: string }) => void;
}

export function RecordPaymentModal({
  open,
  onClose,
  unitNumber,
  currency,
  openPayments,
  lockedPaymentIds,
  onSubmit,
}: RecordPaymentModalProps) {
  const sorted = useMemo(
    () => [...openPayments].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)),
    [openPayments]
  );

  const isLocked = lockedPaymentIds && lockedPaymentIds.length > 0;

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { t, tf } = useI18n();

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setNote('');
    if (isLocked) {
      setSelected(new Set(lockedPaymentIds));
      const target = sorted.find((p) => lockedPaymentIds!.includes(p._id));
      if (target) setAmount(String(paymentOwed(target).toFixed(2)));
    } else {
      // Pre-select all open payments by default; user can untick.
      setSelected(new Set(sorted.map((p) => p._id)));
    }
  }, [open, isLocked, lockedPaymentIds, sorted]);

  const amountN = parseFloat(amount.replace(/,/g, ''));
  const validAmount = Number.isFinite(amountN) && amountN > 0;
  const selectedPayments = sorted.filter((p) => selected.has(p._id));
  const selectedTotal = selectedPayments.reduce((s, p) => s + paymentOwed(p), 0);
  const surplus = validAmount ? Math.max(0, amountN - selectedTotal) : 0;
  // Must fully cover the selected dues; surplus is fine, undercoverage isn't.
  const undercover = validAmount && selected.size > 0 && amountN + 1e-6 < selectedTotal;
  const valid = validAmount && (isLocked || selected.size > 0) && !undercover;

  function toggle(id: string) {
    if (isLocked) return;
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View>
          <Text style={[type.title, { marginBottom: spacing.xs }]}>
            {isLocked ? t('record_payment_locked_title') : t('record_payment_title')}
          </Text>
          <Text style={[type.small, { marginBottom: spacing.md }]}>
            {isLocked
              ? tf('record_payment_locked_body', { n: unitNumber })
              : tf('record_payment_open_body', { n: unitNumber })}
          </Text>

          <Text style={styles.label}>{t('record_payment_amount')}</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={t('record_payment_amount_ph')}
            placeholderTextColor={palette.textSubtle}
            style={styles.input}
            autoFocus
          />

          {sorted.length > 0 && (
            <>
              <View style={styles.listHeader}>
                <Text style={styles.label}>{isLocked ? t('record_payment_applying_to') : t('record_payment_apply_to')}</Text>
                {!isLocked && (
                  <TouchableOpacity
                    onPress={() =>
                      setSelected(selected.size === sorted.length ? new Set() : new Set(sorted.map((p) => p._id)))
                    }
                  >
                    <Text style={styles.toggleAll}>
                      {selected.size === sorted.length ? t('clear') : t('select_all')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={styles.dueList} nestedScrollEnabled>
                {sorted.map((p) => {
                  const owed = paymentOwed(p);
                  const checked = selected.has(p._id);
                  const lockedRow = isLocked && lockedPaymentIds!.includes(p._id);
                  return (
                    <TouchableOpacity
                      key={p._id}
                      activeOpacity={isLocked ? 1 : 0.85}
                      onPress={() => toggle(p._id)}
                      style={[styles.dueRow, checked && styles.dueRowActive]}
                      disabled={isLocked && !lockedRow}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                        {checked && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dueType}>{t(PTYPE_KEY[p.type])}</Text>
                        <Text style={styles.dueMeta}>
                          {tf('record_payment_due_status', { relative: relativeDay(p.dueDate), status: t(PSTATUS_KEY[p.status]) })}
                          {p.paidAmount && p.paidAmount > 0
                            ? ` · ${tf('record_payment_paid_inline', { amount: fmtMoney(p.paidAmount, currency) })}`
                            : ''}
                        </Text>
                      </View>
                      <Text style={styles.dueOwed}>{fmtMoney(owed, currency)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {!isLocked && (
            <>
              <Text style={styles.label}>{t('record_payment_note')}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('record_payment_note_ph')}
                placeholderTextColor={palette.textSubtle}
                style={styles.input}
              />
            </>
          )}

          <View style={[styles.summary, undercover && styles.summaryError]}>
            <Text style={styles.summaryRow}>
              {tf('record_payment_selected_total', { amount: fmtMoney(selectedTotal, currency) })}
            </Text>
            {undercover ? (
              <Text style={styles.errorRow}>
                {tf('record_payment_short_by', { amount: fmtMoney(selectedTotal - amountN, currency) })}
              </Text>
            ) : validAmount && (
              <Text style={styles.summaryRow}>
                {amountN >= selectedTotal && selectedTotal > 0
                  ? t('record_payment_will_settle')
                  : t('record_payment_to_balance_only')}
                {surplus > 0 ? (
                  <Text style={[styles.summaryStrong, { color: palette.accent }]}>
                    {tf('record_payment_to_balance_inline', { amount: fmtMoney(surplus, currency) })}
                  </Text>
                ) : null}
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label={t('record_payment_save')}
              onPress={() =>
                onSubmit({
                  amount: amountN,
                  selectedIds: Array.from(selected),
                  note: note.trim() || undefined,
                })
              }
              disabled={!valid}
              style={{ flex: 1 }}
            />
          </View>
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleAll: { color: palette.accent, fontSize: 12, fontWeight: '600', marginTop: spacing.md },
  dueList: { maxHeight: 200, marginTop: 4 },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    marginBottom: 6,
  },
  dueRowActive: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  dueType: { fontSize: 14, color: palette.text, fontWeight: '600', textTransform: 'capitalize' },
  dueMeta: { fontSize: 11, color: palette.textSubtle, marginTop: 2, textTransform: 'capitalize' },
  dueOwed: { fontSize: 14, color: palette.text, fontWeight: '700' },

  summary: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md,
  },
  summaryRow: { fontSize: 13, color: palette.textMuted, marginTop: 2 },
  summaryStrong: { color: palette.text, fontWeight: '700' },
  summaryError: { backgroundColor: palette.dangerSoft, borderWidth: 1, borderColor: '#fecaca' },
  errorRow: { fontSize: 13, color: palette.danger, fontWeight: '600', marginTop: 4 },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
