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
import { useI18n } from '../i18n';
import { useAuth, type GeoAction, type UserSettings } from '../auth/AuthContext';
import { palette, radii, spacing, type, textStart } from './theme';

/**
 * Admin-only sheet for editing a single user's policy settings. Submits a
 * partial PATCH to /users/:id/settings; omitted fields stay untouched on the
 * server, so this modal can be opened multiple times to incrementally adjust
 * a user without clobbering previously-set values.
 */
export interface UserSettingsModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userLabel: string;
  /** Current settings, used to prefill the form. */
  initial?: UserSettings | null;
  onSaved?: (next: UserSettings) => void;
}

interface UtilityLine {
  key: string;
  name: string;
  amount: string;
}

const GEO_ACTIONS: GeoAction[] = ['open_gate', 'close_gate', 'open_door', 'call_elevator'];

export function UserSettingsModal({
  open,
  onClose,
  userId,
  userLabel,
  initial,
  onSaved,
}: UserSettingsModalProps) {
  const { t } = useI18n();
  const { building } = useAuth();
  const buildingCenter = building?.settings?.geoCenter ?? null;
  const buildingCenterSet =
    typeof buildingCenter?.lat === 'number' && typeof buildingCenter?.lng === 'number';
  const [maxDependentsStr, setMaxDependentsStr] = useState('');
  const [utilLines, setUtilLines] = useState<UtilityLine[]>([]);
  const [geoEnabled, setGeoEnabled] = useState(false);
  const [radiusStr, setRadiusStr] = useState('');
  const [allowedActions, setAllowedActions] = useState<Set<GeoAction>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMaxDependentsStr(
      initial?.maxDependents == null ? '' : String(initial.maxDependents)
    );
    const utilEntries = Object.entries(initial?.monthlyUtilities ?? {});
    setUtilLines(
      utilEntries.length > 0
        ? utilEntries.map(([name, amount], i) => ({
            key: `init-${i}`,
            name,
            amount: String(amount),
          }))
        : []
    );
    const gf = initial?.geoFence;
    setGeoEnabled(!!gf && (gf.radiusMeters != null || (gf.allowedActions?.length ?? 0) > 0));
    setRadiusStr(gf?.radiusMeters == null ? '' : String(gf.radiusMeters));
    setAllowedActions(new Set(gf?.allowedActions ?? []));
  }, [open, initial]);

  function addUtilityRow() {
    setUtilLines((prev) => [
      ...prev,
      { key: `new-${Date.now()}-${prev.length}`, name: '', amount: '' },
    ]);
  }

  function updateUtility(key: string, patch: Partial<UtilityLine>) {
    setUtilLines((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  function removeUtility(key: string) {
    setUtilLines((prev) => prev.filter((u) => u.key !== key));
  }

  function toggleAction(action: GeoAction) {
    setAllowedActions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
  }

  const utilitiesPayload = useMemo(() => {
    const out: Record<string, number> = {};
    for (const line of utilLines) {
      const name = line.name.trim();
      if (!name) continue;
      const amt = parseFloat(line.amount);
      if (Number.isFinite(amt) && amt >= 0) out[name] = Math.round(amt * 100) / 100;
    }
    return out;
  }, [utilLines]);

  async function save() {
    setError(null);
    const body: Record<string, unknown> = {};

    // maxDependents: '' means clear (null); a non-negative integer otherwise.
    const trimmed = maxDependentsStr.trim();
    if (trimmed === '') {
      body.maxDependents = null;
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n < 0) {
        setError(t('user_settings_err_max_dependents'));
        return;
      }
      body.maxDependents = n;
    }

    body.monthlyUtilities = Object.keys(utilitiesPayload).length ? utilitiesPayload : null;

    if (geoEnabled) {
      const radius = radiusStr.trim() === '' ? null : parseFloat(radiusStr);
      if (radius != null && (!Number.isFinite(radius) || radius < 0)) {
        setError(t('user_settings_err_geo_radius'));
        return;
      }
      // Center is owned by the building (settings.geoCenter); per-user fence
      // only stores the radius + allowed actions. We send null coords so a
      // legacy admin-overridden value gets cleared.
      body.geoFence = {
        centerLat: null,
        centerLng: null,
        radiusMeters: radius,
        allowedActions: Array.from(allowedActions),
      };
    } else {
      body.geoFence = null;
    }

    setSubmitting(true);
    try {
      const r = await api.patch(`/users/${userId}/settings`, body);
      const nextSettings = (r.data?.user?.settings ?? {}) as UserSettings;
      onSaved?.(nextSettings);
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('user_settings_err_save'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[type.title, { marginBottom: spacing.xs }]}>
          {t('user_settings_title')}
        </Text>
        <Text style={[type.small, { marginBottom: spacing.lg }]} numberOfLines={1}>
          {userLabel}
        </Text>

        <Text style={styles.sectionLabel}>{t('user_settings_section_dependents')}</Text>
        <Text style={[type.small, { color: palette.textSubtle }]}>
          {t('user_settings_max_dependents_hint')}
        </Text>
        <TextInput
          value={maxDependentsStr}
          onChangeText={setMaxDependentsStr}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={palette.textSubtle}
          style={styles.input}
        />

        <Text style={styles.sectionLabel}>{t('user_settings_section_utilities')}</Text>
        <Text style={[type.small, { color: palette.textSubtle }]}>
          {t('user_settings_utilities_hint')}
        </Text>
        {utilLines.map((line) => (
          <View key={line.key} style={styles.utilRow}>
            <TextInput
              value={line.name}
              onChangeText={(v) => updateUtility(line.key, { name: v })}
              placeholder={t('user_settings_utility_name_ph')}
              placeholderTextColor={palette.textSubtle}
              style={[styles.input, { flex: 2 }]}
              autoCapitalize="none"
            />
            <TextInput
              value={line.amount}
              onChangeText={(v) => updateUtility(line.key, { amount: v })}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={palette.textSubtle}
              style={[styles.input, { flex: 1 }]}
            />
            <Pressable
              onPress={() => removeUtility(line.key)}
              hitSlop={8}
              style={styles.utilRemove}
            >
              <Text style={styles.utilRemoveText}>×</Text>
            </Pressable>
          </View>
        ))}
        <TouchableOpacity onPress={addUtilityRow} style={styles.addRowBtn} activeOpacity={0.85}>
          <Text style={styles.addRowText}>＋ {t('user_settings_utility_add')}</Text>
        </TouchableOpacity>

        <View style={styles.geoHeader}>
          <Text style={styles.sectionLabel}>{t('user_settings_section_geo')}</Text>
          <Switch
            value={geoEnabled}
            onValueChange={setGeoEnabled}
            trackColor={{ false: palette.surfaceMuted, true: palette.accentSoft }}
            thumbColor={geoEnabled ? palette.accent : palette.textSubtle}
          />
        </View>
        {geoEnabled && (
          <>
            <Text style={[type.small, { color: palette.textSubtle }]}>
              {t('user_settings_geo_center_note')}
            </Text>
            {!buildingCenterSet && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  {t('user_settings_geo_no_center_warning')}
                </Text>
              </View>
            )}
            <TextInput
              value={radiusStr}
              onChangeText={setRadiusStr}
              keyboardType="numeric"
              placeholder={t('user_settings_geo_radius_ph')}
              placeholderTextColor={palette.textSubtle}
              style={styles.input}
            />
            <Text style={[type.small, { marginTop: spacing.sm, color: palette.textMuted }]}>
              {t('user_settings_geo_actions_label')}
            </Text>
            <View style={styles.actionRow}>
              {GEO_ACTIONS.map((a) => {
                const on = allowedActions.has(a);
                return (
                  <TouchableOpacity
                    key={a}
                    onPress={() => toggleAction(a)}
                    style={[styles.chip, on && styles.chipActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>
                      {t(`user_settings_geo_action_${a}` as const)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

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
            onPress={save}
            loading={submitting}
            disabled={submitting}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...type.small,
    color: palette.text,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.inputBg,
    marginTop: 6,
    ...textStart,
  },
  utilRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  utilRemove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
    marginTop: 6,
  },
  utilRemoveText: { fontSize: 20, fontWeight: '700', color: palette.danger, lineHeight: 22 },
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
  geoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  warningBox: {
    marginTop: 6,
    padding: spacing.sm,
    backgroundColor: palette.warningSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.warning,
  },
  warningText: { color: palette.warning, fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
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
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.lg },
});
