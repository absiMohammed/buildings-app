import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fmtMoney } from '../utils/format';
import { paymentMethodLabel } from '../utils/labels';
import { remainingOf, type Payment, type PaymentMethod } from '../api/payments';
import { palette, radii, spacing, type } from './theme';
import { Button } from './ui';
import { AmountInput, parseAmount } from './AmountInput';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';

type ClaimMethod = Exclude<PaymentMethod, 'credit'>;
const METHODS: ClaimMethod[] = ['transfer', 'cash', 'other'];

/**
 * Resident "I paid" sheet: amount (≤ remaining), how it was paid, optional
 * transfer reference — lands as a pending claim for the admin to confirm.
 */
export function ClaimModal({
  open,
  payment,
  currency,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  payment: Payment | null;
  currency: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (input: { amount: number; method: ClaimMethod; externalRef: string; note: string }) => void;
}) {
  const { t } = useI18n();
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<ClaimMethod>('transfer');
  const [externalRef, setExternalRef] = useState('');
  const [note, setNote] = useState('');

  const remaining = payment ? remainingOf(payment) : 0;

  useEffect(() => {
    if (!open) return;
    setAmountText(remaining > 0 ? String(remaining) : '');
    setMethod('transfer');
    setExternalRef('');
    setNote('');
    // Reset per opening; `remaining` is derived from the target payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment?._id]);

  const amount = parseAmount(amountText) ?? 0;
  const valid = amount > 0 && amount <= remaining + 0.005;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.xs }]}>{t('claim_title')}</Text>
      <Text style={[type.small, { marginBottom: spacing.md }]}>{t('claim_body')}</Text>

      <Text style={styles.label}>{t('record_payment_amount')}</Text>
      <AmountInput
        value={amountText}
        onChangeValue={setAmountText}
        currency={currency}
        placeholder={t('record_payment_amount_ph')}
      />
      {payment && (
        <Text style={[type.small, { marginTop: 4 }]}>
          {fmtMoney(remaining, currency)}
        </Text>
      )}

      <View style={styles.methodRow}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMethod(m)}
            style={[styles.chip, method === m && styles.chipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, method === m && styles.chipTextActive]}>
              {paymentMethodLabel(t, m)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('claim_ref')}</Text>
      <TextInput
        value={externalRef}
        onChangeText={setExternalRef}
        placeholder="TRX-…"
        placeholderTextColor={palette.textSubtle}
        autoCapitalize="characters"
        style={styles.input}
      />

      <Text style={styles.label}>{t('record_payment_note')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t('record_payment_note_ph')}
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
      />

      <View style={styles.actions}>
        <Button label={t('cancel')} variant="secondary" onPress={onClose} style={styles.flex1} />
        <Button
          label={t('claim_submit')}
          onPress={() => onSubmit({ amount, method, externalRef, note })}
          disabled={!valid}
          loading={submitting}
          style={styles.flex1}
        />
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
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.text,
  },
  methodRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 13, color: palette.textMuted, fontWeight: '600' },
  chipTextActive: { color: palette.textInverse },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  flex1: { flex: 1 },
});
