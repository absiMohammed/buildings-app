import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fmtMoney, relativeDay } from '../utils/format';
import { paymentTypeLabel } from '../utils/labels';
import { remainingOf, isPartiallyPaid, type Payment } from '../api/payments';
import { palette, radii, spacing, type } from './theme';
import { Button } from './ui';
import { AmountInput, parseAmount } from './AmountInput';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const PSTATUS_KEY: Record<Payment['status'], StringKey> = {
  paid: 'status_paid',
  pending: 'status_pending',
  overdue: 'status_overdue',
  waived: 'status_waived',
};

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Client mirror of the server waterfall (payments.service.ts planWaterfall):
 * oldest-first, each slice capped at that charge's remaining. Must stay
 * identical — the server response is the source of truth, this only previews.
 */
function planWaterfall(remainings: number[], amount: number): { applied: number[]; surplus: number } {
  let left = round2(amount);
  const applied = remainings.map((remaining) => {
    const slice = round2(Math.min(Math.max(remaining, 0), left));
    left = round2(left - slice);
    return slice;
  });
  return { applied, surplus: left };
}

export interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  unitNumber: string;
  currency: string;
  /** pending / overdue items for this unit */
  openPayments: Payment[];
  // When set, the user can't change which payment(s) are being marked paid.
  // Used by the per-row action on the Payments page.
  lockedPaymentIds?: string[];
  /** Disables + spins the save button while the receipt is being recorded. */
  submitting?: boolean;
  onSubmit: (input: { paymentIds: string[]; amount: number; note: string }) => void;
}

export function RecordPaymentModal({
  open,
  onClose,
  unitNumber,
  currency,
  openPayments,
  lockedPaymentIds,
  submitting,
  onSubmit,
}: RecordPaymentModalProps) {
  const sorted = useMemo(
    () => [...openPayments].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)),
    [openPayments]
  );

  const isLocked = !!(lockedPaymentIds && lockedPaymentIds.length > 0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amountText, setAmountText] = useState('');
  const [amountDirty, setAmountDirty] = useState(false);
  const [note, setNote] = useState('');
  const { t, tf } = useI18n();

  useEffect(() => {
    if (!open) return;
    setAmountText('');
    setAmountDirty(false);
    setNote('');
    if (isLocked) {
      setSelected(new Set(lockedPaymentIds));
    } else {
      // Pre-select all open payments by default; user can untick.
      setSelected(new Set(sorted.map((p) => p._id)));
    }
  }, [open, isLocked, lockedPaymentIds, sorted]);

  const selectedPayments = sorted.filter((p) => selected.has(p._id));
  const selectedTotal = round2(selectedPayments.reduce((s, p) => s + remainingOf(p), 0));

  // Until the user types, the amount tracks the selection (full settle).
  useEffect(() => {
    if (!amountDirty) setAmountText(selectedTotal > 0 ? String(selectedTotal) : '');
  }, [selectedTotal, amountDirty]);

  const amount = parseAmount(amountText) ?? 0;
  const { applied, surplus } = planWaterfall(selectedPayments.map(remainingOf), amount);
  const appliedById = new Map(selectedPayments.map((p, i) => [p._id, applied[i] ?? 0]));
  const shortBy = round2(selectedTotal - (amount - surplus));
  const valid = selected.size > 0 && amount > 0;

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

        <View style={styles.amountHeader}>
          <Text style={styles.label}>{t('record_payment_amount')}</Text>
          {selectedTotal > 0 && amount !== selectedTotal && (
            <TouchableOpacity
              onPress={() => {
                setAmountText(String(selectedTotal));
                setAmountDirty(true);
              }}
            >
              <Text style={styles.toggleAll}>{fmtMoney(selectedTotal, currency)}</Text>
            </TouchableOpacity>
          )}
        </View>
        <AmountInput
          value={amountText}
          onChangeValue={(v) => {
            setAmountText(v);
            setAmountDirty(true);
          }}
          currency={currency}
          placeholder={t('record_payment_amount_ph')}
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
                const checked = selected.has(p._id);
                const lockedRow = isLocked && lockedPaymentIds!.includes(p._id);
                const slice = appliedById.get(p._id) ?? 0;
                const remaining = remainingOf(p);
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
                      <Text style={styles.dueType}>{paymentTypeLabel(t, p.type)}</Text>
                      <Text style={styles.dueMeta}>
                        {tf('record_payment_due_status', { relative: relativeDay(p.dueDate), status: t(PSTATUS_KEY[p.status]) })}
                        {isPartiallyPaid(p)
                          ? ` · ${tf('record_payment_paid_inline', { amount: fmtMoney(p.paidAmount, currency) })}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.dueOwed}>{fmtMoney(remaining, currency)}</Text>
                      {/* Waterfall preview: what this receipt covers of the row. */}
                      {checked && amount > 0 && slice < remaining && (
                        <Text style={styles.dueSlice}>
                          {tf('record_payment_paid_inline', { amount: fmtMoney(slice, currency) })}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <Text style={styles.label}>{t('record_payment_note')}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('record_payment_note_ph')}
          placeholderTextColor={palette.textSubtle}
          style={styles.noteInput}
        />

        <View style={styles.summary}>
          <Text style={styles.summaryRow}>
            {tf('record_payment_selected_total', { amount: fmtMoney(selectedTotal, currency) })}
          </Text>
          {valid && shortBy <= 0 && (
            <Text style={styles.summaryRow}>
              {t('record_payment_will_settle')}
              {surplus > 0 ? tf('record_payment_to_balance_inline', { amount: fmtMoney(surplus, currency) }) : ''}
            </Text>
          )}
          {valid && shortBy > 0 && (
            <Text style={[styles.summaryRow, styles.summaryWarn]}>
              {tf('record_payment_short_by', { amount: fmtMoney(shortBy, currency) })}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={t('record_payment_save')}
            onPress={() => onSubmit({ paymentIds: Array.from(selected), amount, note })}
            disabled={!valid}
            loading={submitting}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...type.small, color: palette.textMuted, marginTop: spacing.md, marginBottom: 4 },
  amountHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  dueType: { fontSize: 14, color: palette.text, fontWeight: '600' },
  dueMeta: { fontSize: 11, color: palette.textSubtle, marginTop: 2 },
  dueOwed: { fontSize: 14, color: palette.text, fontWeight: '700' },
  dueSlice: { fontSize: 11, color: palette.accent, fontWeight: '600', marginTop: 2 },

  noteInput: {
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.text,
  },

  summary: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md,
  },
  summaryRow: { fontSize: 13, color: palette.textMuted, marginTop: 2 },
  summaryWarn: { color: palette.warning, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
