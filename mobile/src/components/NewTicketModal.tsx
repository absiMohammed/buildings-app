import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { palette, radii, spacing, type, textStart } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import type { MockTicket } from '../mocks/fixtures';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const PRIO_KEY: Record<MockTicket['priority'], StringKey> = {
  low: 'prio_low',
  medium: 'prio_medium',
  high: 'prio_high',
};

const TCAT_KEY: Record<MockTicket['category'], StringKey> = {
  plumbing: 'tcat_plumbing',
  electrical: 'tcat_electrical',
  hvac: 'tcat_hvac',
  general: 'tcat_general',
};

type Scope = 'unit' | 'common';
type Priority = MockTicket['priority'];
type Category = MockTicket['category'];

export interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
  // Pre-fills the unit field for unit-scope tickets. Owners/renters/dependents
  // have a unit; admins do not (admins typically only file common tickets).
  defaultUnit?: string;
  /** Disallow picking 'unit' scope — useful for admin who has no unit. */
  forbidUnitScope?: boolean;
  onSubmit: (input: {
    title: string;
    description: string;
    priority: Priority;
    category: Category;
    scope: Scope;
    unit: string;
  }) => void;
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const CATEGORIES: { value: Category; glyph: string }[] = [
  { value: 'plumbing', glyph: '🚿' },
  { value: 'electrical', glyph: '⚡' },
  { value: 'hvac', glyph: '❄️' },
  { value: 'general', glyph: '🛠️' },
];

export function NewTicketModal({ open, onClose, defaultUnit, forbidUnitScope, onSubmit }: NewTicketModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [category, setCategory] = useState<Category>('general');
  const [scope, setScope] = useState<Scope>(forbidUnitScope ? 'common' : 'unit');
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setPriority('medium');
    setCategory('general');
    setScope(forbidUnitScope ? 'common' : defaultUnit ? 'unit' : 'common');
  }, [open, defaultUnit, forbidUnitScope]);

  const valid =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    (scope === 'common' || (defaultUnit ?? '').length > 0);

  function submit() {
    if (!valid) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      category,
      scope,
      unit: scope === 'unit' ? defaultUnit! : 'Common',
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.xs }]}>{t('new_ticket_title')}</Text>
      <Text style={[type.small, { marginBottom: spacing.md }]}>
        {t('new_ticket_body')}
      </Text>

      <Text style={styles.label}>{t('new_ticket_scope')}</Text>
      <View style={styles.chipRow}>
        {!forbidUnitScope && (
          <TouchableOpacity
            onPress={() => setScope('unit')}
            style={[styles.chip, scope === 'unit' && styles.chipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, scope === 'unit' && styles.chipTextActive]}>
              {t('new_ticket_scope_unit')} {defaultUnit ? `(${defaultUnit})` : ''}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setScope('common')}
          style={[styles.chip, scope === 'common' && styles.chipActive]}
          activeOpacity={0.85}
        >
          <Text style={[styles.chipText, scope === 'common' && styles.chipTextActive]}>{t('new_ticket_scope_common')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[type.small, { marginTop: 4 }]}>
        {scope === 'unit'
          ? t('new_ticket_scope_hint_unit')
          : t('new_ticket_scope_hint_common')}
      </Text>

      <Text style={styles.label}>{t('new_ticket_field_title')}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('new_ticket_field_title_ph')}
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
        maxLength={120}
      />

      <Text style={styles.label}>{t('new_ticket_field_desc')}</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={t('new_ticket_field_desc_ph')}
        placeholderTextColor={palette.textSubtle}
        style={[styles.input, styles.multiline]}
        multiline
        numberOfLines={3}
        maxLength={500}
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t('new_ticket_field_priority')}</Text>
          <View style={styles.chipRow}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setPriority(p)}
                style={[styles.smallChip, priority === p && styles.chipActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, priority === p && styles.chipTextActive]}>{t(PRIO_KEY[p])}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.label}>{t('new_ticket_field_category')}</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.value}
            onPress={() => setCategory(c.value)}
            style={[styles.smallChip, category === c.value && styles.chipActive]}
            activeOpacity={0.85}
          >
            <Text style={styles.chipGlyph}>{c.glyph}</Text>
            <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>{t(TCAT_KEY[c.value])}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actions}>
        <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label={t('submit')} onPress={submit} disabled={!valid} style={{ flex: 1 }} />
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
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  smallChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 12, color: palette.textMuted, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  chipGlyph: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
