import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api/client';
import { Button, Card, EmptyState, SectionHeader } from '../components/ui';
import { MODULES } from '../auth/capabilities';
import { palette, radii, spacing, type, textStart } from '../components/theme';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

interface PricingResponse {
  pricing: {
    prices: Record<string, number>;
    currency: string;
    updatedAt?: string;
  };
}

interface FeatureDef {
  id: string;
  labelKey: StringKey;
}

// Order shapes the form. Keep parity with the toggle list in
// BuildingDetailPage so admin can correlate the price to the on/off switch.
const PRICED_FEATURES: FeatureDef[] = [
  { id: MODULES.PAYMENTS, labelKey: 'nav_payments' },
  { id: MODULES.EXPENSES, labelKey: 'nav_expenses' },
  { id: MODULES.POLLS, labelKey: 'nav_polls' },
  { id: MODULES.MAINTENANCE, labelKey: 'nav_maintenance' },
  { id: MODULES.DOCUMENTS, labelKey: 'nav_docs' },
  { id: MODULES.UNITS, labelKey: 'nav_units' },
  { id: MODULES.USERS, labelKey: 'nav_users' },
  { id: MODULES.HOUSEHOLD, labelKey: 'nav_household' },
];

/**
 * Admin's feature-pricing surface. Each feature has an annual price set in
 * the system currency; per-building monthly installment is computed as
 * annual / 12 at read time and shown on the AdminPayments + Building detail
 * screens. Saving sends a partial map so the admin can adjust one row
 * without touching the others.
 */
export function AdminPricingPage() {
  const { t, tf } = useI18n();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState('USD');
  const [originalPrices, setOriginalPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get<PricingResponse>('/buildings/admin/pricing');
      const p = r.data.pricing.prices ?? {};
      setOriginalPrices(p);
      setPrices(
        Object.fromEntries(
          PRICED_FEATURES.map((f) => [f.id, p[f.id] == null ? '' : String(p[f.id])])
        )
      );
      setCurrency(r.data.pricing.currency ?? 'USD');
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('pricing_err_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const totalAnnual = useMemo(() => {
    return Object.values(prices).reduce((s, v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) && n >= 0 ? s + n : s;
    }, 0);
  }, [prices]);

  const dirty = useMemo(() => {
    return PRICED_FEATURES.some((f) => {
      const current = parseFloat(prices[f.id] ?? '');
      const original = originalPrices[f.id] ?? 0;
      if (!Number.isFinite(current)) return prices[f.id] !== '' && original !== 0;
      return current !== original;
    });
  }, [prices, originalPrices]);

  async function save() {
    setError(null);
    const payload: Record<string, number> = {};
    for (const f of PRICED_FEATURES) {
      const raw = prices[f.id] ?? '';
      if (raw.trim() === '') {
        payload[f.id] = 0;
        continue;
      }
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n < 0) {
        setError(tf('pricing_err_invalid', { name: t(f.labelKey) }));
        return;
      }
      payload[f.id] = Math.round(n * 100) / 100;
    }
    setSaving(true);
    try {
      const r = await api.patch<PricingResponse>('/buildings/admin/pricing', {
        prices: payload,
      });
      const p = r.data.pricing.prices ?? {};
      setOriginalPrices(p);
      setPrices(
        Object.fromEntries(
          PRICED_FEATURES.map((f) => [f.id, p[f.id] == null ? '' : String(p[f.id])])
        )
      );
      setCurrency(r.data.pricing.currency ?? currency);
      setSavedAt(Date.now());
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('pricing_err_save'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (error && Object.keys(originalPrices).length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState icon="💸" title={t('pricing_err_load')} body={error} action={{ label: t('back'), onPress: () => void fetch() }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('pricing_title').toUpperCase()}</Text>
          <Text style={type.display}>{currency}</Text>
          <Text style={type.small}>{t('pricing_subtitle')}</Text>
        </View>
      </View>

      <Card>
        <Text style={type.small}>{t('pricing_total_annual')}</Text>
        <Text style={[type.display, { marginTop: 4 }]}>{currency} {totalAnnual.toFixed(2)}</Text>
        <Text style={[type.small, { marginTop: 4, color: palette.textSubtle }]}>
          {tf('pricing_total_monthly', { value: (totalAnnual / 12).toFixed(2), currency })}
        </Text>
      </Card>

      <SectionHeader title={t('pricing_section_features')} />
      <Card padded={false}>
        {PRICED_FEATURES.map((f, i) => (
          <View key={f.id} style={[styles.row, i < PRICED_FEATURES.length - 1 && styles.divider]}>
            <Text style={[type.body, { flex: 1, fontWeight: '600' }]}>{t(f.labelKey)}</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.currencyTag}>{currency}</Text>
              <TextInput
                value={prices[f.id] ?? ''}
                onChangeText={(v) => setPrices((p) => ({ ...p, [f.id]: v }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={palette.textSubtle}
                style={styles.amount}
              />
            </View>
          </View>
        ))}
      </Card>
      <Text style={[type.small, { color: palette.textSubtle, marginTop: spacing.sm }]}>
        {t('pricing_hint')}
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button
          label={saving ? t('saving') : savedAt ? t('settings_saved') : t('save')}
          onPress={save}
          disabled={!dirty || saving}
          loading={saving}
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.divider },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currencyTag: { color: palette.textSubtle, fontSize: 12, fontWeight: '700' },
  amount: {
    minWidth: 80,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
    textAlign: 'right',
    ...textStart,
  },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
