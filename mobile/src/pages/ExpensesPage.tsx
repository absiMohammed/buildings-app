import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useAuth, useCurrency, type Role } from '../auth/AuthContext';
import { ACTIONS, EMPTY_CAPABILITIES, hasAction } from '../auth/capabilities';
import { palette, radii, spacing, type, textStart } from '../components/theme';
import { Button, Card, IconCircle, Pill, SectionHeader } from '../components/ui';
import { BottomSheet } from '../components/BottomSheet';
import { expensesTrend, fmtMoney, fmtMoneyCompact, relativeDay, type MockExpense } from '../mocks/fixtures';
import { useMockStore } from '../mocks/store';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const categoryGlyph: Record<MockExpense['category'], string> = {
  maintenance: '🔧',
  utilities: '💡',
  cleaning: '🧹',
  security: '🛡️',
  landscaping: '🌿',
  insurance: '📄',
};

const CATEGORIES: MockExpense['category'][] = ['maintenance', 'utilities', 'cleaning', 'security', 'landscaping', 'insurance'];

const CATEGORY_KEY: Record<MockExpense['category'], StringKey> = {
  maintenance: 'cat_maintenance',
  utilities: 'cat_utilities',
  cleaning: 'cat_cleaning',
  security: 'cat_security',
  landscaping: 'cat_landscaping',
  insurance: 'cat_insurance',
};

export function ExpensesPage() {
  const { user, capabilities: caps } = useAuth();
  const role = (user?.role ?? 'renter') as Role;
  const currency = useCurrency();
  const canCreate = hasAction(caps, ACTIONS.EXPENSE_CREATE);
  const { expenses: allExpenses, addExpense } = useMockStore();
  const { t, tf } = useI18n();

  const expenses = useMemo(
    () => (role === 'admin' ? allExpenses : allExpenses.slice(0, 3)),
    [role, allExpenses]
  );

  const trend = expensesTrend();
  const [modalOpen, setModalOpen] = useState(false);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    expenses.forEach((e) => (m[e.category] = (m[e.category] ?? 0) + e.amount));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
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

        <Card>
          <Text style={type.caption}>{t('expenses_trend_caps')}</Text>
          <LineChart
            data={trend.map((t) => ({ value: t.value, label: t.label, labelTextStyle: { color: palette.textSubtle, fontSize: 11 } }))}
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
                <IconCircle glyph={categoryGlyph[cat as MockExpense['category']]} tone="warning" size={36} />
                <Text style={[type.body, { flex: 1, fontWeight: '600' }]}>{t(CATEGORY_KEY[cat as MockExpense['category']])}</Text>
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
                  <Text style={type.small}>{e.vendor} · {relativeDay(e.date)}</Text>
                </View>
                <Text style={type.body}>{fmtMoneyCompact(e.amount, currency)}</Text>
              </View>
              {i < expenses.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <NewExpenseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(input) => {
          addExpense(input);
          setModalOpen(false);
        }}
      />
    </>
  );
}

function NewExpenseModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: Omit<MockExpense, '_id' | 'date'>) => void;
}) {
  const { t } = useI18n();
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<MockExpense['category']>('maintenance');

  const amountNum = parseFloat(amount.replace(/,/g, ''));
  const valid = description.trim().length > 0 && vendor.trim().length > 0 && Number.isFinite(amountNum) && amountNum > 0;

  function reset() {
    setDescription('');
    setVendor('');
    setAmount('');
    setCategory('maintenance');
  }

  function submit() {
    if (!valid) return;
    onSubmit({ description: description.trim(), vendor: vendor.trim(), amount: amountNum, category });
    reset();
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
                <Text style={[modalStyles.chipText, category === c && modalStyles.chipTextActive]}>{t(CATEGORY_KEY[c])}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={modalStyles.actions}>
            <Button label={t('cancel')} variant="secondary" onPress={() => { reset(); onClose(); }} style={{ flex: 1 }} />
            <Button label={t('new_expense_add')} onPress={submit} disabled={!valid} style={{ flex: 1 }} />
          </View>
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
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
