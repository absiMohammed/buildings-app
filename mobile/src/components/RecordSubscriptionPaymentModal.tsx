import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api/client';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';
import { palette, radii, spacing, type, textStart } from './theme';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

export interface SubscriptionPayment {
  _id: string;
  buildingId: string;
  buildingName?: string;
  amount: number;
  currency: string;
  periodKind: 'annual' | 'monthly';
  periodLabel: string;
  dueDate: string;
  paidAt?: string | null;
  status: 'pending' | 'paid' | 'cancelled';
  method?: 'cash' | 'transfer' | 'card' | 'other' | null;
  externalRef?: string;
  notes?: string;
}

export interface BuildingOption {
  _id: string;
  name: string;
  currency: string;
  annual: number;
  monthly: number;
}

interface MethodOption {
  id: 'cash' | 'transfer' | 'card' | 'other';
  labelKey: StringKey;
}

const METHODS: MethodOption[] = [
  { id: 'cash', labelKey: 'sub_method_cash' },
  { id: 'transfer', labelKey: 'sub_method_transfer' },
  { id: 'card', labelKey: 'sub_method_card' },
  { id: 'other', labelKey: 'sub_method_other' },
];

export interface RecordSubscriptionPaymentModalProps {
  open: boolean;
  onClose: () => void;
  /** Building options for the picker. Each entry carries its computed
   *  annual/monthly so the form can prefill the amount. */
  buildings: BuildingOption[];
  /** If supplied, the form edits this row. Otherwise creates a new one. */
  initial?: SubscriptionPayment | null;
  /** Pre-select a building when opening (creation flow). */
  defaultBuildingId?: string;
  onSaved?: (p: SubscriptionPayment) => void;
  onDeleted?: (id: string) => void;
}

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function defaultPeriodLabel(kind: 'annual' | 'monthly'): string {
  const d = new Date();
  if (kind === 'annual') return String(d.getFullYear());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Admin records (or edits) one subscription installment for a building.
 * The form is intentionally compact — building + period kind + amount +
 * status + optional method/ref/notes. "Paid" auto-sets `paidAt` to today
 * unless the admin overrides.
 */
export function RecordSubscriptionPaymentModal({
  open,
  onClose,
  buildings,
  initial,
  defaultBuildingId,
  onSaved,
  onDeleted,
}: RecordSubscriptionPaymentModalProps) {
  const { t } = useI18n();
  const [buildingId, setBuildingId] = useState<string>(defaultBuildingId ?? '');
  const [periodKind, setPeriodKind] = useState<'annual' | 'monthly'>('annual');
  const [periodLabel, setPeriodLabel] = useState<string>(defaultPeriodLabel('annual'));
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());
  const [paid, setPaid] = useState(false);
  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState<'cash' | 'transfer' | 'card' | 'other' | null>(null);
  const [externalRef, setExternalRef] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setBuildingId(initial.buildingId);
      setPeriodKind(initial.periodKind);
      setPeriodLabel(initial.periodLabel);
      setAmountStr(String(initial.amount));
      setDueDate(initial.dueDate.slice(0, 10));
      setPaid(initial.status === 'paid');
      setPaidAt(initial.paidAt ? initial.paidAt.slice(0, 10) : todayIso());
      setMethod(initial.method ?? null);
      setExternalRef(initial.externalRef ?? '');
      setNotes(initial.notes ?? '');
    } else {
      setBuildingId(defaultBuildingId ?? '');
      setPeriodKind('annual');
      setPeriodLabel(defaultPeriodLabel('annual'));
      setAmountStr('');
      setDueDate(todayIso());
      setPaid(false);
      setPaidAt(todayIso());
      setMethod(null);
      setExternalRef('');
      setNotes('');
    }
  }, [open, initial, defaultBuildingId]);

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b._id === buildingId) ?? null,
    [buildings, buildingId]
  );

  // When the admin picks a fresh building (creation flow), prefill amount
  // from the computed annual/monthly figure so they don't have to retype.
  useEffect(() => {
    if (initial || !selectedBuilding) return;
    setAmountStr(
      String(periodKind === 'annual' ? selectedBuilding.annual : selectedBuilding.monthly)
    );
  }, [initial, selectedBuilding, periodKind]);

  const amount = useMemo(() => {
    const n = parseFloat(amountStr);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [amountStr]);

  const valid = !!buildingId && amount !== null && periodLabel.trim().length > 0 && dueDate.length >= 8;

  async function submit() {
    if (!valid || !selectedBuilding) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        buildingId,
        amount,
        currency: selectedBuilding.currency,
        periodKind,
        periodLabel: periodLabel.trim(),
        dueDate: new Date(dueDate).toISOString(),
        status: paid ? 'paid' : 'pending',
        paidAt: paid ? new Date(paidAt).toISOString() : null,
        method,
        externalRef: externalRef.trim(),
        notes: notes.trim(),
      };
      if (initial) {
        const r = await api.patch(`/buildings/admin/payments/${initial._id}`, body);
        onSaved?.(r.data.payment as SubscriptionPayment);
      } else {
        const r = await api.post('/buildings/admin/payments', body);
        onSaved?.(r.data.payment as SubscriptionPayment);
      }
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('sub_err_save'));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!initial) return;
    setSubmitting(true);
    try {
      await api.delete(`/buildings/admin/payments/${initial._id}`);
      onDeleted?.(initial._id);
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('sub_err_delete'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[type.title, { marginBottom: spacing.xs }]}>
          {initial ? t('sub_edit_title') : t('sub_new_title')}
        </Text>
        <Text style={[type.small, { marginBottom: spacing.lg }]}>
          {initial ? t('sub_edit_body') : t('sub_new_body')}
        </Text>

        <Text style={styles.label}>{t('sub_field_building')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {buildings.map((b) => (
            <TouchableOpacity
              key={b._id}
              onPress={() => setBuildingId(b._id)}
              style={[styles.chip, buildingId === b._id && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, buildingId === b._id && styles.chipTextActive]}>{b.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>{t('sub_field_period_kind')}</Text>
        <View style={styles.chipRow}>
          {(['annual', 'monthly'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              onPress={() => {
                setPeriodKind(k);
                if (!initial) setPeriodLabel(defaultPeriodLabel(k));
              }}
              style={[styles.chip, periodKind === k && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, periodKind === k && styles.chipTextActive]}>
                {t(k === 'annual' ? 'sub_kind_annual' : 'sub_kind_monthly')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{t('sub_field_period_label')}</Text>
        <TextInput
          value={periodLabel}
          onChangeText={setPeriodLabel}
          placeholder={periodKind === 'annual' ? '2026' : '2026-05'}
          placeholderTextColor={palette.textSubtle}
          style={[styles.input, { maxWidth: 200 }]}
          autoCapitalize="none"
        />

        <Text style={styles.label}>
          {t('sub_field_amount')}
          {selectedBuilding ? ` (${selectedBuilding.currency})` : ''}
        </Text>
        <TextInput
          value={amountStr}
          onChangeText={setAmountStr}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={palette.textSubtle}
          style={[styles.input, { maxWidth: 200 }]}
        />

        <Text style={styles.label}>{t('sub_field_due_date')}</Text>
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={palette.textSubtle}
          style={[styles.input, { maxWidth: 200 }]}
          autoCapitalize="none"
        />

        <View style={styles.paidRow}>
          <TouchableOpacity
            onPress={() => setPaid(!paid)}
            style={[styles.chip, paid && styles.chipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, paid && styles.chipTextActive]}>
              {paid ? t('sub_paid') : t('sub_pending')}
            </Text>
          </TouchableOpacity>
          {paid && (
            <TextInput
              value={paidAt}
              onChangeText={setPaidAt}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.textSubtle}
              style={[styles.input, { maxWidth: 160 }]}
              autoCapitalize="none"
            />
          )}
        </View>

        {paid && (
          <>
            <Text style={styles.label}>{t('sub_field_method')}</Text>
            <View style={styles.chipRow}>
              {METHODS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setMethod(method === m.id ? null : m.id)}
                  style={[styles.chip, method === m.id && styles.chipActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, method === m.id && styles.chipTextActive]}>{t(m.labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{t('sub_field_external_ref')}</Text>
            <TextInput
              value={externalRef}
              onChangeText={setExternalRef}
              placeholder={t('sub_field_external_ref_ph')}
              placeholderTextColor={palette.textSubtle}
              style={styles.input}
              autoCapitalize="none"
            />
          </>
        )}

        <Text style={styles.label}>{t('sub_field_notes')}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t('sub_field_notes_ph')}
          placeholderTextColor={palette.textSubtle}
          style={[styles.input, { minHeight: 56 }]}
          multiline
        />

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button label={t('cancel')} variant="secondary" onPress={onClose} disabled={submitting} style={{ flex: 1 }} />
          <Button
            label={submitting ? t('saving') : t('save')}
            onPress={submit}
            disabled={!valid || submitting}
            loading={submitting}
            style={{ flex: 1 }}
          />
        </View>
        {initial && (
          <Button label={t('sub_remove')} variant="danger" onPress={remove} disabled={submitting} style={{ marginTop: spacing.sm }} />
        )}
        <View style={{ height: spacing.lg }} />
      </ScrollView>
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
    backgroundColor: palette.inputBg,
    ...textStart,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 13, color: palette.textMuted, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
