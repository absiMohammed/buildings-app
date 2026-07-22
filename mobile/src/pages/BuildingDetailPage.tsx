import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  I18nManager,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MapView, { Marker } from 'react-native-maps';
import { api } from '../api/client';
import { Button, Card, CollapsibleCard, EmptyState, Pill } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { BuildingFormModal } from '../components/BuildingFormModal';
import { MapPicker, type LatLng } from '../components/MapPicker';
import { useConfirm } from '../components/ConfirmProvider';
import { listBuildingUnits, type Unit } from '../api/units';
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
  const { confirm } = useConfirm();
  const buildingId = route.params?.buildingId;

  const [building, setBuilding] = useState<AdminBuilding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [latDraft, setLatDraft] = useState('');
  const [lngDraft, setLngDraft] = useState('');
  const [savingGeo, setSavingGeo] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // Units count for this building (management lives on its own screen).
  const [units, setUnits] = useState<Unit[]>([]);

  // Local copy of the enabled set so the toggles feel responsive; persisted
  // on tap (one PATCH per toggle, debounced by state).
  const [enabledSet, setEnabledSet] = useState<Set<string>>(new Set());
  const [savingFeatures, setSavingFeatures] = useState(false);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const [bRes, uRes] = await Promise.all([
        api.get('/buildings'),
        buildingId ? listBuildingUnits(buildingId).catch(() => [] as Unit[]) : Promise.resolve([] as Unit[]),
      ]);
      const all = (bRes.data?.buildings ?? []) as AdminBuilding[];
      const b = all.find((x) => x._id === buildingId) ?? null;
      setBuilding(b);
      setUnits(uRes as Unit[]);
      setLatDraft(b?.settings?.geoCenter?.lat == null ? '' : String(b.settings.geoCenter.lat));
      setLngDraft(b?.settings?.geoCenter?.lng == null ? '' : String(b.settings.geoCenter.lng));
      // Hydrate the toggle set. `null` from server = no restriction; mirror
      // that by defaulting every toggleable feature to ON.
      const list =
        b?.enabledModules == null
          ? TOGGLEABLE_FEATURES.map((f) => f.id)
          : b.enabledModules;
      setEnabledSet(new Set(list));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('buildings_err_load'));
    } finally {
      setLoading(false);
    }
  }, [buildingId, t]);

  // Refetch on focus so status changes made on inner screens (e.g. activating
  // the building right after appointing its admin) show up on return.
  useFocusEffect(
    useCallback(() => {
      void fetch();
    }, [fetch]),
  );

  // Show the building's own name in the nav bar (not the generic "Buildings").
  useEffect(() => {
    if (building) navigation.setOptions({ title: building.name });
  }, [building, navigation]);

  const geoDirty = useMemo(() => {
    const lat = building?.settings?.geoCenter?.lat;
    const lng = building?.settings?.geoCenter?.lng;
    return (
      latDraft.trim() !== (lat == null ? '' : String(lat)) ||
      lngDraft.trim() !== (lng == null ? '' : String(lng))
    );
  }, [latDraft, lngDraft, building]);

  // Current draft coordinates as a LatLng, or null when either is not a
  // finite number. Drives both the read-only preview and the map picker seed.
  const geoPreview = useMemo<LatLng | null>(() => {
    const lat = parseFloat(latDraft);
    const lng = parseFloat(lngDraft);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [latDraft, lngDraft]);

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
      await confirm({ title: t('settings_error_geo_lat_invalid'), confirmLabel: t('continue') });
      return;
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      await confirm({ title: t('settings_error_geo_lng_invalid'), confirmLabel: t('continue') });
      return;
    }
    setSavingGeo(true);
    try {
      await patchBuilding({ settings: { geoCenter: { lat, lng } } });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('buildings_err_save'), message: msg ?? t('buildings_err_save'), confirmLabel: t('continue') });
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
      await confirm({ title: t('buildings_err_save'), message: msg ?? t('buildings_err_save'), confirmLabel: t('continue') });
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
    // Deactivation is destructive (residents lose access) — confirm first.
    if (next === 'inactive') {
      const ok = await confirm({
        title: t('buildings_action_deactivate'),
        confirmLabel: t('buildings_action_deactivate'),
        cancelLabel: t('cancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      const r = await api.patch(`/buildings/${building._id}/status`, { status: next });
      // Refresh local state so the pill + control reflect the new status.
      setBuilding(r.data.building as AdminBuilding);
    } catch (e) {
      // The backend rejects activation with 400 (code BUILDING_NEEDS_ADMIN)
      // when no building admin exists — localize that case; otherwise surface
      // the server message (then a generic fallback).
      const err = (e as { response?: { data?: { error?: { code?: string; message?: string } } } })
        ?.response?.data?.error;
      const needsAdmin = err?.code === 'BUILDING_NEEDS_ADMIN';
      await confirm({
        title: needsAdmin ? t('buildings_activate_needs_admin_title') : t('buildings_err_status'),
        message: needsAdmin
          ? t('buildings_activate_needs_admin')
          : err?.message ?? t('buildings_err_status'),
        confirmLabel: t('continue'),
      });
    }
  }

  async function confirmDelete() {
    if (!building) return;
    const ok = await confirm({
      title: tf('buildings_delete_title', { name: building.name }),
      message: t('buildings_delete_body'),
      confirmLabel: t('remove'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/buildings/${building._id}`);
      navigation.goBack();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('buildings_err_delete'), message: msg ?? t('buildings_err_delete'), confirmLabel: t('continue') });
    }
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
        <Pill
          label={t(building.status === 'active' ? 'buildings_status_active' : 'buildings_status_inactive')}
          tone={building.status === 'active' ? 'positive' : 'warning'}
        />
        {building.address || building.currency ? (
          <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>
            {[building.address, building.currency].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      <View style={styles.actionBar}>
        <IconAction
          icon="power"
          label={building.status === 'active' ? t('buildings_action_deactivate') : t('buildings_action_activate')}
          tone={building.status === 'active' ? 'danger' : 'positive'}
          onPress={toggleStatus}
        />
        <IconAction icon="edit" label={t('buildings_edit_title')} onPress={() => setEditOpen(true)} />
        <IconAction
          icon="users"
          label={t('buildings_action_users')}
          onPress={() => navigation.navigate('BuildingUsers', { buildingId: building._id, buildingName: building.name })}
        />
        <IconAction
          icon="trash"
          label={t('buildings_action_delete')}
          tone="danger"
          onPress={() => void confirmDelete()}
        />
      </View>

      {/* Units — dedicated screen */}
      <Card padded={false}>
        <NavRow
          icon="units"
          title={t('buildings_units_title')}
          subtitle={tf('buildings_units_count', { n: units.length })}
          onPress={() =>
            navigation.navigate('BuildingUnits', {
              buildingId: building._id,
              buildingName: building.name,
            })
          }
        />
      </Card>

      {/* Actions (gates / doors / elevators) — dedicated screen */}
      <Card padded={false}>
        <NavRow
          icon="gate"
          title={t('actions_section_title')}
          subtitle={t('actions_section_hint')}
          onPress={() =>
            navigation.navigate('BuildingActions', {
              buildingId: building._id,
              buildingName: building.name,
              currency: building.currency,
            })
          }
        />
      </Card>

      {/* Location — title is the card header; tap to collapse */}
      <CollapsibleCard title={t('settings_section_geo_center')}>
      <View style={styles.collapseBody}>
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
        <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>{t('building_location')}</Text>
        {geoPreview ? (
          <View style={styles.mapPreview}>
            <MapView
              style={{ flex: 1 }}
              pointerEvents="none"
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              region={{
                latitude: geoPreview.lat,
                longitude: geoPreview.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker coordinate={{ latitude: geoPreview.lat, longitude: geoPreview.lng }} />
            </MapView>
          </View>
        ) : null}
        <View style={{ alignItems: 'flex-start', marginTop: spacing.md }}>
          <Button
            label={t('building_set_location')}
            variant="secondary"
            onPress={() => setMapOpen(true)}
            style={{ paddingHorizontal: 16 }}
          />
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
      </View>
      </CollapsibleCard>

      {/* Features / benefits — title is the card header; tap to collapse */}
      <CollapsibleCard title={t('buildings_features_title')}>
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
      </CollapsibleCard>

      <View style={{ height: spacing.xl }} />

      <BuildingFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={building}
        onSaved={(b) => {
          setBuilding(b);
          setEditOpen(false);
        }}
      />

      <MapPicker
        visible={mapOpen}
        initial={geoPreview}
        onPick={(coords) => {
          setLatDraft(String(coords.lat));
          setLngDraft(String(coords.lng));
          setMapOpen(false);
        }}
        onClose={() => setMapOpen(false)}
      />
    </ScrollView>
  );
}

function NavRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navRow} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.navRowIcon, { backgroundColor: palette.accentSoft }]}>
        <Icon name={icon} size={20} color={palette.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, { fontWeight: '600' }]}>{title}</Text>
        <Text style={type.small} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Icon name={I18nManager.isRTL ? 'chevronLeft' : 'chevronRight'} size={20} color={palette.textSubtle} />
    </TouchableOpacity>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  tone = 'accent',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'positive' | 'danger';
}) {
  const color = tone === 'danger' ? palette.danger : tone === 'positive' ? palette.success : palette.accent;
  const bg = tone === 'danger' ? palette.dangerSoft : tone === 'positive' ? palette.successSoft : palette.accentSoft;
  return (
    <TouchableOpacity style={styles.iconAction} activeOpacity={0.8} onPress={onPress}>
      <View style={[styles.iconActionCircle, { backgroundColor: bg }]}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <Text style={styles.iconActionLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconAction: { alignItems: 'center', gap: 6, flex: 1 },
  iconActionCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  iconActionLabel: { ...type.small, color: palette.textMuted, fontWeight: '600' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  navRowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  collapseBody: { padding: spacing.lg },
  fieldLabel: { ...type.small, color: palette.textMuted, marginBottom: 6 },
  geoRow: { flexDirection: 'row', gap: spacing.sm },
  mapPreview: { height: 140, borderRadius: radii.md, overflow: 'hidden', marginTop: spacing.sm },
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
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  featureDivider: { borderBottomWidth: 1, borderBottomColor: palette.divider },
});
