import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api/client';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';
import { palette, radii, spacing, type, textStart } from './theme';
import { useI18n } from '../i18n';
import type { AdminBuilding } from '../pages/BuildingsPage';

// Curated allow-list of timezones the admin can choose for a building.
// Grouped: MENA first (the product's primary market), then a small set of
// global anchors. The runtime accepts any IANA id, but the picker only
// surfaces these so admins don't have to know the spelling.
const TIMEZONE_OPTIONS: ReadonlyArray<string> = [
  'UTC',
  // MENA
  'Asia/Jerusalem',
  'Asia/Amman',
  'Asia/Beirut',
  'Asia/Damascus',
  'Asia/Baghdad',
  'Asia/Riyadh',
  'Asia/Kuwait',
  'Asia/Qatar',
  'Asia/Dubai',
  'Asia/Tehran',
  'Africa/Cairo',
  'Africa/Algiers',
  'Africa/Tunis',
  'Africa/Casablanca',
  // Global anchors
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/**
 * Bottom-sheet form used both for "create building" and "edit building".
 * When `initial` is supplied the form pre-fills its fields and PATCHes the
 * existing record; otherwise it POSTs a new one.
 */
export interface BuildingFormModalProps {
  open: boolean;
  onClose: () => void;
  /** If set, the form edits this building; otherwise creates a new one. */
  initial?: AdminBuilding | null;
  onSaved?: (b: AdminBuilding) => void;
}

const CURRENCY_OPTIONS = ['ILS', 'USD', 'EUR', 'GBP', 'JOD'];

export function BuildingFormModal({ open, onClose, initial, onSaved }: BuildingFormModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [timezone, setTimezone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(initial?.name ?? '');
    setAddress(initial?.address ?? '');
    setCurrency(initial?.currency ?? 'ILS');
    setTimezone(initial?.settings?.timezone ?? 'UTC');
  }, [open, initial]);

  const trimmedName = name.trim();
  const valid = trimmedName.length > 0;

  // Show the curated list, plus the building's current value if it isn't
  // already in the list (e.g. a legacy free-text entry from before we
  // switched to a picker). This guarantees the existing value stays visible.
  const timezoneOptions = useMemo<readonly string[]>(() => {
    if (!timezone || TIMEZONE_OPTIONS.includes(timezone)) return TIMEZONE_OPTIONS;
    return [timezone, ...TIMEZONE_OPTIONS];
  }, [timezone]);

  async function submit() {
    if (!valid) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: trimmedName,
        currency,
      };
      const timezoneClean = timezone.trim();
      if (timezoneClean) body.settings = { timezone: timezoneClean };
      if (initial) {
        body.address = address.trim();
        const r = await api.patch(`/buildings/${initial._id}`, body);
        onSaved?.(r.data.building as AdminBuilding);
      } else {
        body.address = address.trim() || undefined;
        if (timezoneClean) body.timezone = timezoneClean;
        const r = await api.post('/buildings', body);
        onSaved?.(r.data.building as AdminBuilding);
      }
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('buildings_err_save'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[type.title, { marginBottom: spacing.xs }]}>
          {initial ? t('buildings_edit_title') : t('buildings_new_title')}
        </Text>
        <Text style={[type.small, { marginBottom: spacing.lg }]}>
          {initial ? t('buildings_edit_body') : t('buildings_new_body')}
        </Text>

        <Text style={styles.label}>{t('buildings_field_name')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('settings_building_name_placeholder')}
          placeholderTextColor={palette.textSubtle}
          style={styles.input}
          maxLength={120}
        />

        <Text style={styles.label}>{t('buildings_field_address')}</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder={t('buildings_field_address_ph')}
          placeholderTextColor={palette.textSubtle}
          style={styles.input}
          maxLength={400}
        />

        <Text style={styles.label}>{t('buildings_field_currency')}</Text>
        <View style={styles.chipRow}>
          {CURRENCY_OPTIONS.map((code) => (
            <TouchableOpacity
              key={code}
              onPress={() => setCurrency(code)}
              style={[styles.chip, currency === code && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, currency === code && styles.chipTextActive]}>{code}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{t('buildings_field_timezone')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {timezoneOptions.map((tz) => (
            <TouchableOpacity
              key={tz}
              onPress={() => setTimezone(tz)}
              style={[styles.chip, timezone === tz && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, timezone === tz && styles.chipTextActive]}>{tz}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={t('cancel')}
            variant="secondary"
            onPress={onClose}
            disabled={submitting}
            style={{ flex: 1 }}
          />
          <Button
            label={submitting ? t('saving') : t('save')}
            onPress={submit}
            disabled={!valid || submitting}
            loading={submitting}
            style={{ flex: 1 }}
          />
        </View>
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
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.md },
});
