import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { palette, radii, spacing, type, textStart } from './theme';
import { Button } from './ui';
import { BottomSheet } from './BottomSheet';
import {
  createMaintenance,
  type MaintenanceCategory,
  type MaintenanceRequest,
} from '../api/maintenance';
import { apiErrorMessage } from '../api/useApiResource';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

// The create form offers the three everyday priorities. Mock 'medium' maps to
// the server's 'normal'; 'urgent' is reserved for admins to escalate later.
type CreatePriority = 'low' | 'normal' | 'high';

const PRIO_KEY: Record<CreatePriority, StringKey> = {
  low: 'prio_low',
  normal: 'prio_medium',
  high: 'prio_high',
};

const TCAT_KEY: Record<MaintenanceCategory, StringKey> = {
  plumbing: 'tcat_plumbing',
  electrical: 'tcat_electrical',
  elevator: 'qa_elevator_title',
  common_area: 'maint_place_common',
  other: 'sub_method_other',
};

type Place = 'unit' | 'common';

export interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
  /** The filer's own unit, or null when they have none (e.g. an admin). */
  unit?: { _id: string; number: string } | null;
  /** Called with the created request after a successful save. */
  onCreated: (request: MaintenanceRequest) => void;
}

const PRIORITIES: CreatePriority[] = ['low', 'normal', 'high'];
const CATEGORIES: { value: MaintenanceCategory; glyph: string }[] = [
  { value: 'plumbing', glyph: '🚿' },
  { value: 'electrical', glyph: '⚡' },
  { value: 'elevator', glyph: '🛗' },
  { value: 'common_area', glyph: '🏢' },
  { value: 'other', glyph: '🛠️' },
];

export function NewTicketModal({ open, onClose, unit, onCreated }: NewTicketModalProps) {
  const hasUnit = !!unit;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<CreatePriority>('normal');
  const [category, setCategory] = useState<MaintenanceCategory>('other');
  const [place, setPlace] = useState<Place>(hasUnit ? 'unit' : 'common');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setPriority('normal');
    setCategory('other');
    setPlace(hasUnit ? 'unit' : 'common');
    setSubmitting(false);
    setError(null);
  }, [open, hasUnit]);

  const valid = title.trim().length > 0;

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const request = await createMaintenance({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        priority,
        unitId: place === 'unit' && unit ? unit._id : null,
      });
      onCreated(request);
    } catch (e) {
      setError(apiErrorMessage(e, t('ticket_err_create')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.xs }]}>{t('new_ticket_title')}</Text>

      <Text style={styles.label}>{t('new_ticket_scope')}</Text>
      <View style={styles.chipRow}>
        {hasUnit && (
          <TouchableOpacity
            onPress={() => setPlace('unit')}
            style={[styles.chip, place === 'unit' && styles.chipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, place === 'unit' && styles.chipTextActive]}>
              {t('new_ticket_scope_unit')} {unit ? `(${unit.number})` : ''}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setPlace('common')}
          style={[styles.chip, place === 'common' && styles.chipActive]}
          activeOpacity={0.85}
        >
          <Text style={[styles.chipText, place === 'common' && styles.chipTextActive]}>
            {t('new_ticket_scope_common')}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[type.small, { marginTop: 4 }]}>
        {place === 'unit' ? t('new_ticket_scope_hint_unit') : t('new_ticket_scope_hint_common')}
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} disabled={submitting} />
        <Button
          label={t('submit')}
          onPress={submit}
          disabled={!valid || submitting}
          loading={submitting}
          style={{ flex: 1 }}
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
    ...textStart,
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
  chipText: { fontSize: 12, color: palette.textMuted, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  chipGlyph: { fontSize: 13 },
  error: { ...type.small, color: palette.danger, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
