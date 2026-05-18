import { Share, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';
import { palette, radii, spacing, type } from './theme';
import { useI18n } from '../i18n';
import type { SubscriptionPayment } from './RecordSubscriptionPaymentModal';

export interface SubscriptionReceiptModalProps {
  open: boolean;
  onClose: () => void;
  payment: SubscriptionPayment | null;
}

/**
 * Read-only card rendering a paid subscription installment as a receipt
 * the admin can share via the OS share sheet. No server PDF generation —
 * the share payload is plain text (email/SMS/print/etc.) so it works on
 * every platform without extra deps.
 */
export function SubscriptionReceiptModal({ open, onClose, payment }: SubscriptionReceiptModalProps) {
  const { t, tf } = useI18n();
  if (!payment) return null;

  const amountText = `${payment.currency} ${payment.amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

  async function share() {
    if (!payment) return;
    const lines = [
      t('receipt_title'),
      '',
      `${t('sub_field_building')}: ${payment.buildingName ?? '—'}`,
      `${t('sub_field_period_label')}: ${payment.periodLabel} (${t(
        payment.periodKind === 'annual' ? 'sub_kind_annual' : 'sub_kind_monthly'
      )})`,
      `${t('sub_field_amount')}: ${amountText}`,
      `${t('sub_field_due_date')}: ${payment.dueDate.slice(0, 10)}`,
    ];
    if (payment.paidAt) lines.push(`${t('receipt_paid_at')}: ${payment.paidAt.slice(0, 10)}`);
    if (payment.method) lines.push(`${t('sub_field_method')}: ${t(`sub_method_${payment.method}` as const)}`);
    if (payment.externalRef) lines.push(`${t('sub_field_external_ref')}: ${payment.externalRef}`);
    if (payment.notes) lines.push(`${t('sub_field_notes')}: ${payment.notes}`);
    lines.push('');
    lines.push(tf('receipt_footer', { id: payment._id }));

    try {
      await Share.share({ message: lines.join('\n'), title: t('receipt_title') });
    } catch {
      // user cancelled — no-op
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.xs }]}>{t('receipt_title')}</Text>
      <Text style={[type.small, { marginBottom: spacing.lg }]}>{t('receipt_body')}</Text>

      <View style={styles.card}>
        <Row label={t('sub_field_building')} value={payment.buildingName ?? '—'} />
        <Row label={t('sub_field_period_label')} value={`${payment.periodLabel} · ${t(payment.periodKind === 'annual' ? 'sub_kind_annual' : 'sub_kind_monthly')}`} />
        <Row label={t('sub_field_amount')} value={amountText} emphasis />
        <Row label={t('sub_field_due_date')} value={payment.dueDate.slice(0, 10)} />
        {payment.paidAt && <Row label={t('receipt_paid_at')} value={payment.paidAt.slice(0, 10)} />}
        {payment.method && (
          <Row label={t('sub_field_method')} value={t(`sub_method_${payment.method}` as const)} />
        )}
        {payment.externalRef && <Row label={t('sub_field_external_ref')} value={payment.externalRef} />}
        {payment.notes && <Row label={t('sub_field_notes')} value={payment.notes} />}
      </View>

      <Text style={[type.small, { color: palette.textSubtle, marginTop: spacing.md }]}>
        {tf('receipt_footer', { id: payment._id })}
      </Text>

      <View style={styles.actions}>
        <Button label={t('close')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label={t('receipt_share')} onPress={share} style={{ flex: 1 }} />
      </View>
      <View style={{ height: spacing.lg }} />
    </BottomSheet>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[type.small, { color: palette.textSubtle }]}>{label}</Text>
      <Text style={[emphasis ? type.heading : type.body, { fontWeight: emphasis ? '700' : '600' }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: palette.surface,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.divider,
    gap: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
