import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Button, Card, EmptyState, Pill, SectionHeader } from '../components/ui';
import { BuildingFormModal } from '../components/BuildingFormModal';
import { ActionFormModal, type BuildingAction } from '../components/ActionFormModal';
import { MODULES } from '../auth/capabilities';
import { palette, radii, spacing, type, textStart } from '../components/theme';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';
import type { AppStackParamList } from '../navigation/types';
import type { AdminBuilding } from './BuildingsPage';

/**
 * System-admin's single-building surface. Scope is intentionally narrow —
 * only what an app-level operator owns:
 *   • building name / address (via the edit modal)
 *   • status (active / inactive)
 *   • location anchor (lat / lng for per-user geo-fences)
 *   • feature permissions (which app modules this building's users can access)
 *
 * Anything operational — monthly dues policy, default amounts, late fees,
 * residents' payments, etc. — is the building admin's responsibility and
 * lives on the building admin's SettingsPage, not here.
 */

interface ToggleableFeature {
  id: string;
  labelKey: StringKey;
}

// Order shapes the toggle list. SYSTEM_BUILDINGS is intentionally omitted —
// that's the admin's own surface and is never building-scoped.
const TOGGLEABLE_FEATURES: ToggleableFeature[] = [
  { id: MODULES.PAYMENTS, labelKey: 'nav_payments' },
  { id: MODULES.EXPENSES, labelKey: 'nav_expenses' },
  { id: MODULES.POLLS, labelKey: 'nav_polls' },
  { id: MODULES.MAINTENANCE, labelKey: 'nav_maintenance' },
  { id: MODULES.DOCUMENTS, labelKey: 'nav_docs' },
  { id: MODULES.UNITS, labelKey: 'nav_units' },
  { id: MODULES.USERS, labelKey: 'nav_users' },
  { id: MODULES.HOUSEHOLD, labelKey: 'nav_household' },
];

function arrEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

export function BuildingDetailPage() {
  const route = useRoute<RouteProp<AppStackParamList, 'BuildingDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { t, tf } = useI18n();
  const buildingId = route.params?.buildingId;

  const [building, setBuilding] = useState<AdminBuilding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [latDraft, setLatDraft] = useState('');
  const [lngDraft, setLngDraft] = useState('');
  const [savingGeo, setSavingGeo] = useState(false);

  // Local copy of the enabled set so the toggles feel responsive; persisted
  // on tap (one PATCH per toggle, debounced by state).
  const [enabledSet, setEnabledSet] = useState<Set<string>>(new Set());
  const [savingFeatures, setSavingFeatures] = useState(false);

  // Per-building actions (gates / elevators / etc.). Each carries its own
  // annual price that folds into the building's subscription total.
  const [actions, setActions] = useState<BuildingAction[]>([]);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<BuildingAction | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    setActionsError(null);
    try {
      const [bRes, aRes] = await Promise.all([
        api.get('/buildings'),
        buildingId ? api.get(`/buildings/${buildingId}/actions`) : Promise.resolve({ data: { actions: [] } }),
      ]);
      const all = (bRes.data?.buildings ?? []) as AdminBuilding[];
      const b = all.find((x) => x._id === buildingId) ?? null;
      setBuilding(b);
      setLatDraft(b?.settings?.geoCenter?.lat == null ? '' : String(b.settings.geoCenter.lat));
      setLngDraft(b?.settings?.geoCenter?.lng == null ? '' : String(b.settings.geoCenter.lng));
      // Hydrate the toggle set. `null` from server = no restriction; mirror
      // that by defaulting every toggleable feature to ON.
      const list =
        b?.enabledModules == null
          ? TOGGLEABLE_FEATURES.map((f) => f.id)
          : b.enabledModules;
      setEnabledSet(new Set(list));
      setActions((aRes.data?.actions ?? []) as BuildingAction[]);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('buildings_err_load'));
    } finally {
      setLoading(false);
    }
  }, [buildingId, t]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const geoDirty = useMemo(() => {
    const lat = building?.settings?.geoCenter?.lat;
    const lng = building?.settings?.geoCenter?.lng;
    return (
      latDraft.trim() !== (lat == null ? '' : String(lat)) ||
      lngDraft.trim() !== (lng == null ? '' : String(lng))
    );
  }, [latDraft, lngDraft, building]);

  const featuresDirty = useMemo(() => {
    if (!building) return false;
    const current =
      building.enabledModules == null
        ? TOGGLEABLE_FEATURES.map((f) => f.id)
        : building.enabledModules;
    return !arrEq(current, Array.from(enabledSet));
  }, [enabledSet, building]);

  async function patchBuilding(body: Record<string, unknown>) {
    if (!building) return null;
    const r = await api.patch(`/buildings/${building._id}`, body);
    const next = r.data.building as AdminBuilding;
    setBuilding(next);
    return next;
  }

  async function saveGeo() {
    const lat = latDraft.trim() === '' ? null : parseFloat(latDraft);
    const lng = lngDraft.trim() === '' ? null : parseFloat(lngDraft);
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      Alert.alert(t('settings_error_geo_lat_invalid'));
      return;
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      Alert.alert(t('settings_error_geo_lng_invalid'));
      return;
    }
    setSavingGeo(true);
    try {
      await patchBuilding({ settings: { geoCenter: { lat, lng } } });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      Alert.alert(t('buildings_err_save'), msg ?? '');
    } finally {
      setSavingGeo(false);
    }
  }

  async function saveFeatures() {
    setSavingFeatures(true);
    try {
      await patchBuilding({ enabledModules: Array.from(enabledSet) });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      Alert.alert(t('buildings_err_save'), msg ?? '');
    } finally {
      setSavingFeatures(false);
    }
  }

  function toggleFeature(id: string, on: boolean) {
    setEnabledSet((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function toggleStatus() {
    if (!building) return;
    const next = building.status === 'active' ? 'inactive' : 'active';
    try {
      const r = await api.patch(`/buildings/${building._id}/status`, { status: next });
      setBuilding(r.data.building as AdminBuilding);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      Alert.alert(t('buildings_err_status'), msg ?? '');
    }
  }

  function confirmDelete() {
    if (!building) return;
    Alert.alert(tf('buildings_delete_title', { name: building.name }), t('buildings_delete_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/buildings/${building._id}`);
            navigation.goBack();
          } catch (e) {
            const msg = (e as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message;
            Alert.alert(t('buildings_err_delete'), msg ?? '');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (!building) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="🏢"
          title={t('buildings_not_found_title')}
          body={error ?? t('buildings_not_found_body')}
          action={{ label: t('back'), onPress: () => navigation.goBack() }}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('buildings_title').toUpperCase()}</Text>
          <Text style={type.display}>{building.name}</Text>
          {building.address ? <Text style={type.small}>{building.address}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-start', gap: 6 }}>
          <Pill
            label={t(building.status === 'active' ? 'buildings_status_active' : 'buildings_status_inactive')}
            tone={building.status === 'active' ? 'positive' : 'warning'}
          />
          <TouchableOpacity onPress={toggleStatus} hitSlop={8}>
            <Text style={styles.linkText}>
              {building.status === 'active' ? t('buildings_action_deactivate') : t('buildings_action_activate')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.ctaRow}>
        <Button
          label={t('buildings_action_users')}
          onPress={() => navigation.navigate('BuildingUsers', { buildingId: building._id, buildingName: building.name })}
          style={{ flex: 1 }}
        />
        <Button label={t('buildings_edit_title')} variant="secondary" onPress={() => setEditOpen(true)} style={{ flex: 1 }} />
      </View>

      <SectionHeader title={t('settings_section_geo_center')} />
      <Card>
        <Text style={styles.fieldLabel}>{t('settings_geo_center_hint')}</Text>
        <View style={styles.geoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{t('settings_geo_lat_label')}</Text>
            <TextInput
              value={latDraft}
              onChangeText={setLatDraft}
              keyboardType="numeric"
              placeholder={t('settings_geo_lat_ph')}
              placeholderTextColor={palette.textSubtle}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{t('settings_geo_lng_label')}</Text>
            <TextInput
              value={lngDraft}
              onChangeText={setLngDraft}
              keyboardType="numeric"
              placeholder={t('settings_geo_lng_ph')}
              placeholderTextColor={palette.textSubtle}
              style={styles.input}
            />
          </View>
        </View>
        <View style={{ alignItems: 'flex-start', marginTop: spacing.md }}>
          <Button
            label={savingGeo ? t('saving') : t('save')}
            onPress={saveGeo}
            disabled={!geoDirty || savingGeo}
            loading={savingGeo}
            style={{ paddingHorizontal: 16 }}
          />
        </View>
      </Card>

      <SectionHeader title={t('buildings_features_title')} />
      <Card padded={false}>
        <Text style={[type.small, { padding: spacing.md, paddingBottom: 0 }]}>
          {t('buildings_features_hint')}
        </Text>
        {TOGGLEABLE_FEATURES.map((f, i) => (
          <View
            key={f.id}
            style={[styles.featureRow, i < TOGGLEABLE_FEATURES.length - 1 && styles.featureDivider]}
          >
            <Text style={[type.body, { flex: 1 }]}>{t(f.labelKey)}</Text>
            <Switch
              value={enabledSet.has(f.id)}
              onValueChange={(v) => toggleFeature(f.id, v)}
              trackColor={{ false: palette.surfaceMuted, true: palette.accentSoft }}
              thumbColor={enabledSet.has(f.id) ? palette.accent : palette.textSubtle}
              ios_backgroundColor={palette.surfaceMuted}
            />
          </View>
        ))}
        <View style={{ padding: spacing.md, alignItems: 'flex-start' }}>
          <Button
            label={savingFeatures ? t('saving') : t('save')}
            onPress={saveFeatures}
            disabled={!featuresDirty || savingFeatures}
            loading={savingFeatures}
            style={{ paddingHorizontal: 16 }}
          />
        </View>
      </Card>

      <SectionHeader title={t('actions_section_title')} />
      <Card padded={false}>
        <Text style={[type.small, { padding: spacing.md, paddingBottom: 0 }]}>
          {t('actions_section_hint')}
        </Text>
        {actions.length === 0 ? (
          <View style={{ padding: spacing.md }}>
            <Text style={type.small}>{t('actions_empty')}</Text>
          </View>
        ) : (
          actions.map((a, i) => (
            <TouchableOpacity
              key={a._id}
              activeOpacity={0.85}
              onPress={() => {
                setEditingAction(a);
                setActionModalOpen(true);
              }}
              style={[styles.actionRow, i < actions.length - 1 && styles.actionDivider]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={type.small} numberOfLines={1}>
                  {t(`action_type_${a.type}` as const)}
                  {a.annualPrice > 0 ? ` · ${building.currency} ${a.annualPrice}` : ''}
                </Text>
              </View>
              <Pill
                label={t(a.status === 'active' ? 'action_status_active' : 'action_status_inactive')}
                tone={a.status === 'active' ? 'positive' : 'warning'}
              />
            </TouchableOpacity>
          ))
        )}
        <View style={{ padding: spacing.md, alignItems: 'flex-start' }}>
          <Button
            label={t('actions_new')}
            variant="primary"
            onPress={() => {
              setEditingAction(null);
              setActionModalOpen(true);
            }}
          />
        </View>
        {actionsError && (
          <Text style={[type.small, { color: palette.danger, paddingHorizontal: spacing.md, paddingBottom: spacing.md }]}>
            {actionsError}
          </Text>
        )}
      </Card>

      <SectionHeader title={t('settings_section_about')} />
      <Card>
        <RowDetail label={t('settings_about_currency')} value={building.currency} />
        <RowDetail label={t('settings_about_timezone')} value={building.settings?.timezone ?? '—'} />
      </Card>

      <View style={{ height: spacing.xl }} />
      <Button label={t('buildings_delete_title_btn')} variant="danger" onPress={confirmDelete} />

      <BuildingFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={building}
        onSaved={(b) => {
          setBuilding(b);
          setEditOpen(false);
        }}
      />

      <ActionFormModal
        open={actionModalOpen}
        onClose={() => setActionModalOpen(false)}
        buildingId={building._id}
        initial={editingAction}
        onSaved={(saved) =>
          setActions((prev) => {
            const idx = prev.findIndex((x) => x._id === saved._id);
            if (idx === -1) return [saved, ...prev];
            const next = prev.slice();
            next[idx] = saved;
            return next;
          })
        }
        onDeleted={(id) => setActions((prev) => prev.filter((x) => x._id !== id))}
      />
    </ScrollView>
  );
}

function RowDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  ctaRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  fieldLabel: { ...type.small, color: palette.textMuted, marginBottom: 6 },
  geoRow: { flexDirection: 'row', gap: spacing.sm },
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  linkText: { color: palette.accent, fontSize: 12, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  actionDivider: { borderBottomWidth: 1, borderBottomColor: palette.divider },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  featureDivider: { borderBottomWidth: 1, borderBottomColor: palette.divider },
});
