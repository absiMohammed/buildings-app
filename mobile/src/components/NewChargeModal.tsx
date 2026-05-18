import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fmtMoney, type MockUnit, type PaymentType } from '../mocks/fixtures';
import { palette, radii, spacing, type, textStart } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const CHARGE_TYPES: { value: PaymentType; labelKey: StringKey; glyph: string }[] = [
  { value: 'special_assessment', labelKey: 'new_charge_type_special', glyph: '★' },
  { value: 'building_dues', labelKey: 'new_charge_type_dues', glyph: '🏢' },
  { value: 'utilities', labelKey: 'new_charge_type_utilities', glyph: '💡' },
];

export interface NewChargeModalProps {
  open: boolean;
  onClose: () => void;
  units: MockUnit[];
  currency: string;
  onCreate: (input: {
    unitNumbers: string[];
    amountPerUnit: number;
    type: PaymentType;
    description: string;
    dueDate: string;
  }) => void;
}

function isoFromDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function NewChargeModal({ open, onClose, units, currency, onCreate }: NewChargeModalProps) {
  // Default to habitable units only — construction shouldn't be billed.
  const eligible = useMemo(
    () => units.filter((u) => u.occupancyStatus !== 'under_construction'),
    [units]
  );

  const [description, setDescription] = useState('');
  const [chargeType, setChargeType] = useState<PaymentType>('special_assessment');
  const [amountText, setAmountText] = useState('');
  const [daysFromNow, setDaysFromNow] = useState('14');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { t, tf } = useI18n();

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setChargeType('special_assessment');
    setAmountText('');
    setDaysFromNow('14');
    setSelected(new Set(eligible.map((u) => u.number)));
  }, [open, eligible]);

  const amountN = parseFloat(amountText.replace(/,/g, ''));
  const daysN = parseInt(daysFromNow, 10);
  const validAmount = Number.isFinite(amountN) && amountN > 0;
  const validDays = Number.isFinite(daysN) && daysN >= 0 && daysN <= 365;
  const validDescription = description.trim().length > 0;
  const selectedUnits = eligible.filter((u) => selected.has(u.number));
  const total = validAmount ? amountN * selectedUnits.length : 0;
  const valid = validAmount && validDays && validDescription && selectedUnits.length > 0;

  function toggleUnit(num: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(num)) n.delete(num);
      else n.add(num);
      return n;
    });
  }

  function selectAll() {
    setSelected(new Set(eligible.map((u) => u.number)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  function submit() {
    if (!valid) return;
    onCreate({
      unitNumbers: selectedUnits.map((u) => u.number),
      amountPerUnit: amountN,
      type: chargeType,
      description: description.trim(),
      dueDate: isoFromDaysFromNow(daysN),
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.xs }]}>{t('new_charge_title')}</Text>
      <Text style={[type.small, { marginBottom: spacing.md }]}>
        {t('new_charge_body')}
      </Text>

      <Text style={styles.label}>{t('new_charge_description')}</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={t('new_charge_description_ph')}
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
      />

      <Text style={styles.label}>{t('new_charge_type')}</Text>
      <View style={styles.chipRow}>
        {CHARGE_TYPES.map((ct) => (
          <TouchableOpacity
            key={ct.value}
            onPress={() => setChargeType(ct.value)}
            style={[styles.typeChip, chargeType === ct.value && styles.typeChipActive]}
            activeOpacity={0.85}
          >
            <Text style={styles.typeChipGlyph}>{ct.glyph}</Text>
            <Text style={[styles.typeChipText, chargeType === ct.value && styles.typeChipTextActive]}>{t(ct.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t('new_charge_amount_per_unit')}</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={palette.textSubtle}
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t('new_charge_due_days')}</Text>
          <TextInput
            value={daysFromNow}
            onChangeText={setDaysFromNow}
            keyboardType="number-pad"
            placeholder="14"
            placeholderTextColor={palette.textSubtle}
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.unitsHeader}>
        <Text style={styles.label}>{t('new_charge_apply_units')}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={selectAll}>
            <Text style={styles.toggleLink}>{t('select_all')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearAll}>
            <Text style={styles.toggleLink}>{t('clear')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.unitList} nestedScrollEnabled>
        {eligible.map((u) => {
          const checked = selected.has(u.number);
          return (
            <TouchableOpacity
              key={u._id}
              onPress={() => toggleUnit(u.number)}
              style={[styles.unitRow, checked && styles.unitRowActive]}
              activeOpacity={0.85}
            >
              <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                {checked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.unitLabel}>{tf('unit_filter_unit_prefix', { n: u.number })}</Text>
                <Text style={styles.unitMeta}>
                  {u.ownerName ?? t('units_unassigned')} · {t('new_unit_floor')} {u.floor}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.summary}>
        <Text style={styles.summaryRow}>
          {selectedUnits.length === 1
            ? t('new_charge_selected_one')
            : tf('new_charge_selected_many', { count: selectedUnits.length })}
        </Text>
        {validAmount && (
          <Text style={styles.summaryRow}>
            {tf('new_charge_total_billed', { amount: fmtMoney(total, currency) })}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label={t('new_charge_create')} onPress={submit} disabled={!valid} style={{ flex: 1 }} />
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
  row: { flexDirection: 'row', gap: spacing.md },
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

  unitsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLink: { color: palette.accent, fontSize: 12, fontWeight: '600', marginTop: spacing.md },
  unitList: { maxHeight: 200, marginTop: 4 },
  unitRow: {
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
  unitRowActive: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
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
  unitLabel: { fontSize: 14, color: palette.text, fontWeight: '600' },
  unitMeta: { fontSize: 11, color: palette.textSubtle, marginTop: 2 },

  summary: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md,
  },
  summaryRow: { fontSize: 13, color: palette.textMuted, marginTop: 2 },
  summaryStrong: { color: palette.text, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
