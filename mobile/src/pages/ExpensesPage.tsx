import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useAuth, useCurrency } from '../auth/AuthContext';
import { ACTIONS, hasAction } from '../auth/capabilities';
import { type IconName } from '../components/Icon';
import { palette, radii, spacing, type, textStart } from '../components/theme';
import { Button, Card, EmptyState, IconCircle, Pill, SectionHeader } from '../components/ui';
import { BottomSheet } from '../components/BottomSheet';
import {
  createExpense,
  listExpenses,
  type Expense,
  type ExpenseCategory,
} from '../api/expenses';
import { apiErrorMessage, useApiResource } from '../api/useApiResource';
import { fmtMoney, fmtMoneyCompact, relativeDay } from '../utils/format';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const categoryIcon: Record<ExpenseCategory, IconName> = {
  maintenance: 'maintenance',
  utilities: 'quick',
  repairs: 'maintenance',
  cleaning: 'household',
  insurance: 'shield',
  other: 'more',
};

// Server category set. 'security'/'landscaping' from the old mock now map to
// 'other'; we simply offer the real categories.
const CATEGORIES: ExpenseCategory[] = [
  'maintenance',
  'utilities',
  'repairs',
  'cleaning',
  'insurance',
  'other',
];

// Only the categories that have i18n keys are mapped; 'repairs'/'other' fall
// back to their (lowercase) id, which matches the style of the existing labels.
const CATEGORY_KEY: Partial<Record<ExpenseCategory, StringKey>> = {
  maintenance: 'cat_maintenance',
  utilities: 'cat_utilities',
  cleaning: 'cat_cleaning',
  insurance: 'cat_insurance',
};

function catLabel(t: (k: StringKey) => string, cat: ExpenseCategory): string {
  const key = CATEGORY_KEY[cat];
  return key ? t(key) : cat;
}

/** Sum expense amounts into the last six calendar months (real data only). */
function buildTrend(expenses: Expense[]): { value: number; label: string }[] {
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      value: 0,
    };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i] as const));
  for (const e of expenses) {
    const d = new Date(e.incurredAt);
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i !== undefined) buckets[i].value += e.amount;
  }
  return buckets.map((b) => ({ value: b.value, label: b.label }));
}

export function ExpensesPage() {
  const { capabilities: caps } = useAuth();
  const currency = useCurrency();
  const canCreate = hasAction(caps, ACTIONS.EXPENSE_CREATE);
  const { t, tf } = useI18n();

  const fetcher = useCallback(() => listExpenses(), []);
  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    fetcher,
    t('sub_err_load'),
  );

  // Any resident sees every building expense — no arbitrary slicing.
  const expenses = useMemo(() => data ?? [], [data]);

  const [modalOpen, setModalOpen] = useState(false);

  const trend = useMemo(() => buildTrend(expenses), [expenses]);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    expenses.forEach((e) => (m[e.category] = (m[e.category] ?? 0) + e.amount));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.center}>
        <EmptyState
          iconName="expenses"
          title={error}
          action={{ label: t('back'), onPress: () => void refresh() }}
        />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.caption}>{t('expenses_spend_caps')}</Text>
            <Text style={type.display}>{fmtMoney(total, currency)}</Text>
            <Text style={type.small}>
              {tf('expenses_txn_count', { count: expenses.length, cats: byCategory.length })}
            </Text>
          </View>
          {canCreate ? (
            <Button label={t('new')} variant="primary" onPress={() => setModalOpen(true)} style={{ paddingHorizontal: 16 }} />
          ) : (
            <Pill label={t('expenses_pill_building')} tone="accent" />
          )}
        </View>

        {expenses.length === 0 ? (
          <EmptyState iconName="expenses" title={t('payments_empty_default')} />
        ) : (
          <>
            <Card>
              <Text style={type.caption}>{t('expenses_trend_caps')}</Text>
              <LineChart
                data={trend.map((p) => ({ value: p.value, label: p.label, labelTextStyle: { color: palette.textSubtle, fontSize: 11 } }))}
                thickness={2.5}
                color={palette.warning}
                startFillColor={palette.warning}
                endFillColor={palette.warning}
                startOpacity={0.25}
                endOpacity={0}
                areaChart
                yAxisColor={palette.border}
                xAxisColor={palette.border}
                yAxisTextStyle={{ color: palette.textSubtle, fontSize: 10 }}
                noOfSections={4}
                height={140}
                hideRules
                isAnimated
              />
            </Card>

            <SectionHeader title={t('expenses_section_by_cat')} />
            <Card padded={false}>
              {byCategory.map(([cat, amt], i) => (
                <View key={cat}>
                  <View style={styles.catRow}>
                    <IconCircle iconName={categoryIcon[cat as ExpenseCategory]} tone="warning" size={36} />
                    <Text style={[type.body, { flex: 1, fontWeight: '600' }]}>{catLabel(t, cat as ExpenseCategory)}</Text>
                    <Text style={type.body}>{fmtMoneyCompact(amt, currency)}</Text>
                  </View>
                  {i < byCategory.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </Card>

            <SectionHeader title={t('expenses_section_recent')} />
            <Card padded={false}>
              {expenses.map((e, i) => (
                <View key={e._id}>
                  <View style={styles.txRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { fontWeight: '600' }]}>{e.description}</Text>
                      <Text style={type.small}>{e.vendor} · {relativeDay(e.incurredAt)}</Text>
                    </View>
                    <Text style={type.body}>{fmtMoneyCompact(e.amount, currency)}</Text>
                  </View>
                  {i < expenses.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </Card>
          </>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <NewExpenseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currency={currency}
        onCreated={() => {
          setModalOpen(false);
          void reload();
        }}
      />
    </>
  );
}

function NewExpenseModal({
  open,
  onClose,
  onCreated,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  currency: string;
}) {
  const { t } = useI18n();
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('maintenance');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amountNum = parseFloat(amount.replace(/,/g, ''));
  const valid = description.trim().length > 0 && vendor.trim().length > 0 && Number.isFinite(amountNum) && amountNum > 0;

  function reset() {
    setDescription('');
    setVendor('');
    setAmount('');
    setCategory('maintenance');
    setErr(null);
  }

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      await createExpense({
        category,
        amount: amountNum,
        currency,
        description: description.trim(),
        vendor: vendor.trim(),
        incurredAt: new Date().toISOString(),
      });
      reset();
      onCreated();
    } catch (e) {
      setErr(apiErrorMessage(e, t('sub_err_load')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View>
          <Text style={[type.title, { marginBottom: spacing.sm }]}>{t('new_expense_title')}</Text>
          <Text style={[type.small, { marginBottom: spacing.md }]}>{t('new_expense_body')}</Text>

          <Text style={modalStyles.label}>{t('new_expense_description')}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('new_expense_description_ph')}
            placeholderTextColor={palette.textSubtle}
            style={modalStyles.input}
          />

          <Text style={modalStyles.label}>{t('new_expense_vendor')}</Text>
          <TextInput
            value={vendor}
            onChangeText={setVendor}
            placeholder={t('new_expense_vendor_ph')}
            placeholderTextColor={palette.textSubtle}
            style={modalStyles.input}
          />

          <Text style={modalStyles.label}>{t('new_expense_amount')}</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={t('new_expense_amount_ph')}
            placeholderTextColor={palette.textSubtle}
            style={modalStyles.input}
          />

          <Text style={modalStyles.label}>{t('new_expense_category')}</Text>
          <View style={modalStyles.chipRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                style={[modalStyles.chip, category === c && modalStyles.chipActive]}
                activeOpacity={0.85}
              >
                <Text style={[modalStyles.chipText, category === c && modalStyles.chipTextActive]}>{catLabel(t, c)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {err ? <Text style={[type.small, { color: palette.danger, marginTop: spacing.md }]}>{err}</Text> : null}

          <View style={modalStyles.actions}>
            <Button label={t('cancel')} variant="secondary" onPress={() => { reset(); onClose(); }} style={{ flex: 1 }} disabled={submitting} />
            <Button label={t('new_expense_add')} onPress={submit} disabled={!valid || submitting} loading={submitting} style={{ flex: 1 }} />
          </View>
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 12, color: palette.textMuted, textTransform: 'capitalize', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
