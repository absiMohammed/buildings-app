import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';
// Typography is aliased so the `type` form-state variable below doesn't
// shadow the imported typography object.
import { palette, radii, spacing, type as type_, textStart } from './theme';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

export type BuildingActionType = 'open_gate' | 'close_gate' | 'open_door' | 'call_elevator' | 'custom';

export interface BuildingAction {
  _id: string;
  buildingId: string;
  type: BuildingActionType;
  name: string;
  description?: string;
  config?: Record<string, string>;
  annualPrice: number;
  status: 'active' | 'inactive';
}

const TYPE_OPTIONS: Array<{ id: BuildingActionType; labelKey: StringKey }> = [
  { id: 'open_gate', labelKey: 'action_type_open_gate' },
  { id: 'close_gate', labelKey: 'action_type_close_gate' },
  { id: 'open_door', labelKey: 'action_type_open_door' },
  { id: 'call_elevator', labelKey: 'action_type_call_elevator' },
  { id: 'custom', labelKey: 'action_type_custom' },
];

// Suggested config keys per type, rendered as starter rows when the admin
// picks a fresh type. The admin can add/remove/edit rows freely; the server
// stores whatever ends up here.
const CONFIG_HINTS: Partial<Record<BuildingActionType, string[]>> = {
  open_gate: ['api_key', 'api_secret', 'endpoint', 'device_id'],
  close_gate: ['api_key', 'api_secret', 'endpoint', 'device_id'],
  open_door: ['api_key', 'api_secret', 'lock_id'],
  call_elevator: ['api_key', 'api_secret', 'elevator_id', 'floor'],
  custom: ['api_key', 'api_secret'],
};

export interface ActionFormModalProps {
  open: boolean;
  onClose: () => void;
  buildingId: string;
  initial?: BuildingAction | null;
  onSaved?: (a: BuildingAction) => void;
  onDeleted?: (id: string) => void;
}

interface ConfigRow {
  key: string;
  name: string;
  value: string;
}

/**
 * Admin-only sheet for creating or editing a building action. Each action
 * is a typed integration (open_gate / call_elevator / etc.) with its own
 * credentials in `config` (key/value rows the admin types in) plus an
 * annual price that folds into the building's subscription total.
 */
export function ActionFormModal({ open, onClose, buildingId, initial, onSaved, onDeleted }: ActionFormModalProps) {
  const { t } = useI18n();
  const [type, setType] = useState<BuildingActionType>('open_gate');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [annualPriceStr, setAnnualPriceStr] = useState('');
  const [active, setActive] = useState(true);
  const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setType(initial.type);
      setName(initial.name);
      setDescription(initial.description ?? '');
      setAnnualPriceStr(String(initial.annualPrice ?? 0));
      setActive(initial.status === 'active');
      const entries = Object.entries(initial.config ?? {});
      setConfigRows(
        entries.length > 0
          ? entries.map(([name, value], i) => ({ key: `init-${i}`, name, value }))
          : seedRowsFor(initial.type)
      );
    } else {
      setType('open_gate');
      setName('');
      setDescription('');
      setAnnualPriceStr('');
      setActive(true);
      setConfigRows(seedRowsFor('open_gate'));
    }
  }, [open, initial]);

  function seedRowsFor(t: BuildingActionType): ConfigRow[] {
    const keys = CONFIG_HINTS[t] ?? [];
    return keys.map((name, i) => ({ key: `seed-${t}-${i}`, name, value: '' }));
  }

  function addConfigRow() {
    setConfigRows((prev) => [...prev, { key: `new-${Date.now()}-${prev.length}`, name: '', value: '' }]);
  }
  function updateConfigRow(key: string, patch: Partial<ConfigRow>) {
    setConfigRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeConfigRow(key: string) {
    setConfigRows((prev) => prev.filter((r) => r.key !== key));
  }

  const trimmedName = name.trim();
  const annualPrice = useMemo(() => {
    const n = parseFloat(annualPriceStr);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [annualPriceStr]);
  const valid = trimmedName.length > 0 && annualPrice !== null;

  const configPayload = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const r of configRows) {
      const k = r.name.trim();
      if (!k) continue;
      out[k] = r.value;
    }
    return out;
  }, [configRows]);

  async function submit() {
    if (!valid) return;
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        type,
        name: trimmedName,
        description: description.trim() || undefined,
        config: configPayload,
        annualPrice: Math.round((annualPrice ?? 0) * 100) / 100,
        status: active ? 'active' : 'inactive',
      };
      if (initial) {
        const r = await api.patch(`/buildings/${buildingId}/actions/${initial._id}`, body);
        onSaved?.(r.data.action as BuildingAction);
      } else {
        const r = await api.post(`/buildings/${buildingId}/actions`, body);
        onSaved?.(r.data.action as BuildingAction);
      }
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('action_err_save'));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!initial) return;
    setSubmitting(true);
    try {
      await api.delete(`/buildings/${buildingId}/actions/${initial._id}`);
      onDeleted?.(initial._id);
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('action_err_delete'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[type_.title, { marginBottom: spacing.xs }]}>
          {initial ? t('action_edit_title') : t('action_new_title')}
        </Text>
        <Text style={[type_.small, { marginBottom: spacing.lg }]}>
          {initial ? t('action_edit_body') : t('action_new_body')}
        </Text>

        <Text style={styles.label}>{t('action_field_type')}</Text>
        <View style={styles.chipRow}>
          {TYPE_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.id}
              onPress={() => {
                setType(o.id);
                if (!initial) setConfigRows(seedRowsFor(o.id));
              }}
              style={[styles.chip, type === o.id && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, type === o.id && styles.chipTextActive]}>{t(o.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{t('action_field_name')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('action_field_name_ph')}
          placeholderTextColor={palette.textSubtle}
          style={styles.input}
          maxLength={80}
        />

        <Text style={styles.label}>{t('action_field_description')}</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('action_field_description_ph')}
          placeholderTextColor={palette.textSubtle}
          style={[styles.input, { minHeight: 56 }]}
          multiline
          maxLength={280}
        />

        <Text style={styles.label}>{t('action_field_price')}</Text>
        <TextInput
          value={annualPriceStr}
          onChangeText={setAnnualPriceStr}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={palette.textSubtle}
          style={[styles.input, { maxWidth: 160 }]}
        />

        <Text style={[styles.label, { marginTop: spacing.lg }]}>{t('action_field_config')}</Text>
        <Text style={[type_.small, { color: palette.textSubtle }]}>{t('action_field_config_hint')}</Text>
        {configRows.map((row) => (
          <View key={row.key} style={styles.configRow}>
            <TextInput
              value={row.name}
              onChangeText={(v) => updateConfigRow(row.key, { name: v })}
              placeholder={t('action_config_key_ph')}
              placeholderTextColor={palette.textSubtle}
              style={[styles.input, { flex: 1 }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              value={row.value}
              onChangeText={(v) => updateConfigRow(row.key, { value: v })}
              placeholder={t('action_config_value_ph')}
              placeholderTextColor={palette.textSubtle}
              style={[styles.input, { flex: 1 }]}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={/secret|password|key/i.test(row.name)}
            />
            <Pressable onPress={() => removeConfigRow(row.key)} hitSlop={8} style={styles.configRemove}>
              <Text style={styles.configRemoveText}>×</Text>
            </Pressable>
          </View>
        ))}
        <TouchableOpacity onPress={addConfigRow} style={styles.addRowBtn} activeOpacity={0.85}>
          <Text style={styles.addRowText}>＋ {t('action_config_add')}</Text>
        </TouchableOpacity>

        <View style={styles.activeRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type_.body, { fontWeight: '600' }]}>{t('action_field_status')}</Text>
            <Text style={type_.small}>{t('action_field_status_hint')}</Text>
          </View>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ false: palette.surfaceMuted, true: palette.accentSoft }}
            thumbColor={active ? palette.accent : palette.textSubtle}
          />
        </View>

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
          <Button
            label={t('action_remove')}
            variant="danger"
            onPress={remove}
            disabled={submitting}
            style={{ marginTop: spacing.sm }}
          />
        )}
        <View style={{ height: spacing.lg }} />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...type_.small, color: palette.textMuted, marginTop: spacing.md, marginBottom: 4 },
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
  configRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  configRemove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  configRemoveText: { fontSize: 20, fontWeight: '700', color: palette.danger, lineHeight: 22 },
  addRowBtn: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.border,
    alignItems: 'center',
  },
  addRowText: { color: palette.accent, fontWeight: '600' },
  activeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.md },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});

