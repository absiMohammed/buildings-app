import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { fmtMoney, relativeDay } from '../utils/format';
import type { Payment } from '../api/payments';
import { palette, radii, spacing, type } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const PSTATUS_KEY: Record<Payment['status'], StringKey> = {
  paid: 'status_paid',
  pending: 'status_pending',
  overdue: 'status_overdue',
  waived: 'status_waived',
};

// Reuse existing dues label where it maps; otherwise prettify the raw type.
function paymentTypeLabel(pt: Payment['type'], t: ReturnType<typeof useI18n>['t']): string {
  if (pt === 'monthly_dues') return t('ptype_building_dues');
  return pt
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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
  onSubmit: (input: { selectedIds: string[] }) => void;
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

  const isLocked = !!(lockedPaymentIds && lockedPaymentIds.length > 0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { t, tf } = useI18n();

  useEffect(() => {
    if (!open) return;
    if (isLocked) {
      setSelected(new Set(lockedPaymentIds));
    } else {
      // Pre-select all open payments by default; user can untick.
      setSelected(new Set(sorted.map((p) => p._id)));
    }
  }, [open, isLocked, lockedPaymentIds, sorted]);

  const selectedPayments = sorted.filter((p) => selected.has(p._id));
  const selectedTotal = selectedPayments.reduce((s, p) => s + p.amount, 0);
  const valid = selected.size > 0;

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
                      <Text style={styles.dueType}>{paymentTypeLabel(p.type, t)}</Text>
                      <Text style={styles.dueMeta}>
                        {tf('record_payment_due_status', { relative: relativeDay(p.dueDate), status: t(PSTATUS_KEY[p.status]) })}
                      </Text>
                    </View>
                    <Text style={styles.dueOwed}>{fmtMoney(p.amount, currency)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <View style={styles.summary}>
          <Text style={styles.summaryRow}>
            {tf('record_payment_selected_total', { amount: fmtMoney(selectedTotal, currency) })}
          </Text>
          {valid && (
            <Text style={styles.summaryRow}>{t('record_payment_will_settle')}</Text>
          )}
        </View>

        <View style={styles.actions}>
          <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={t('record_payment_save')}
            onPress={() => onSubmit({ selectedIds: Array.from(selected) })}
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
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleAll: { color: palette.accent, fontSize: 12, fontWeight: '600', marginTop: spacing.md },
  dueList: { maxHeight: 240, marginTop: 4 },
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

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
