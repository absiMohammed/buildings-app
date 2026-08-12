import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, EmptyState } from '../components/ui';
import { ListToolbar } from '../components/ListChrome';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import { useConfirm } from '../components/ConfirmProvider';
import {
  listBuildingUnits,
  createBuildingUnit,
  updateBuildingUnit,
  deleteBuildingUnit,
  type Unit,
} from '../api/units';
import { palette, radii, spacing, type, textStart } from '../components/theme';
import { useI18n } from '../i18n';
import type { AppStackParamList } from '../navigation/types';

/**
 * System-admin's per-building units management. Reached from BuildingDetail.
 * Add / edit / delete units, and drill into each unit's residents.
 */
export function BuildingUnitsPage() {
  const route = useRoute<RouteProp<AppStackParamList, 'BuildingUnits'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const buildingId = route.params?.buildingId ?? '';
  const buildingName = route.params?.buildingName ?? '';

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const list = await listBuildingUnits(buildingId);
      setUnits(list);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('buildings_err_load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildingId, t]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  async function removeUnit(u: Unit) {
    const ok = await confirm({
      title: t('buildings_unit_remove'),
      message: u.number,
      confirmLabel: t('remove'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteBuildingUnit(buildingId, u._id);
      setUnits((prev) => prev.filter((x) => x._id !== u._id));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('buildings_err_save'), message: msg ?? t('buildings_err_save'), confirmLabel: t('continue') });
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void fetch();
          }}
        />
      }
    >
      <ListToolbar
        countLabel={`${t('buildings_units_title')} · ${units.length}`}
        onAdd={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        addA11yLabel={t('buildings_units_add')}
      />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {units.length === 0 ? (
        <EmptyState iconName="units" title={t('buildings_units_empty')} body="" />
      ) : (
        <Card padded={false}>
          {units.map((u, i) => (
            <View key={u._id} style={[styles.row, i < units.length - 1 && styles.divider]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{u.number}</Text>
                <Text style={type.small}>
                  {[
                    u.floor != null ? `${t('new_unit_floor')} ${u.floor}` : null,
                    u.bedrooms != null ? `${u.bedrooms} ${t('new_unit_bedrooms')}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('BuildingUsers', {
                    buildingId,
                    buildingName,
                    unitId: u._id,
                    unitNumber: u.number,
                  })
                }
                hitSlop={8}
                style={styles.action}
                accessibilityLabel={t('buildings_unit_users')}
              >
                <Icon name="users" size={18} color={palette.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setEditing(u);
                  setModalOpen(true);
                }}
                hitSlop={8}
                style={styles.action}
              >
                <Icon name="edit" size={18} color={palette.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void removeUnit(u)} hitSlop={8} style={styles.action}>
                <Icon name="trash" size={18} color={palette.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </Card>
      )}

      <UnitFormModal
        open={modalOpen}
        buildingId={buildingId}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={(saved) => {
          setUnits((prev) => {
            const idx = prev.findIndex((x) => x._id === saved._id);
            if (idx === -1)
              return [...prev, saved].sort((a, b) =>
                a.number.localeCompare(b.number, undefined, { numeric: true }),
              );
            const next = prev.slice();
            next[idx] = saved;
            return next;
          });
          setModalOpen(false);
        }}
      />
    </ScrollView>
  );
}

function UnitFormModal({
  open,
  buildingId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  buildingId: string;
  initial: Unit | null;
  onClose: () => void;
  onSaved: (u: Unit) => void;
}) {
  const { t } = useI18n();
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [dues, setDues] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNumber(initial?.number ?? '');
      setFloor(initial?.floor != null ? String(initial.floor) : '');
      setBedrooms(initial?.bedrooms != null ? String(initial.bedrooms) : '');
      setDues(initial?.monthlyDuesAmount != null ? String(initial.monthlyDuesAmount) : '');
      setErr(null);
    }
  }, [open, initial]);

  async function submit() {
    if (!number.trim() || !buildingId) return;
    setSaving(true);
    setErr(null);
    const body = {
      number: number.trim(),
      floor: floor.trim() ? Number(floor) : undefined,
      bedrooms: bedrooms.trim() ? Number(bedrooms) : undefined,
      monthlyDuesAmount: dues.trim() ? Number(dues) : undefined,
    };
    try {
      const saved = initial
        ? await updateBuildingUnit(buildingId, initial._id, body)
        : await createBuildingUnit(buildingId, body);
      onSaved(saved);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setErr(msg ?? t('buildings_err_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.md }]}>{t('buildings_units_add')}</Text>
      <Text style={styles.fieldLabel}>{t('new_unit_number')}</Text>
      <TextInput
        value={number}
        onChangeText={setNumber}
        placeholder={t('new_unit_number_ph')}
        placeholderTextColor={palette.textSubtle}
        style={styles.input}
        autoCapitalize="characters"
      />
      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>{t('new_unit_floor')}</Text>
          <TextInput value={floor} onChangeText={setFloor} keyboardType="number-pad" placeholder="0" placeholderTextColor={palette.textSubtle} style={styles.input} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>{t('new_unit_bedrooms')}</Text>
          <TextInput value={bedrooms} onChangeText={setBedrooms} keyboardType="number-pad" placeholder="0" placeholderTextColor={palette.textSubtle} style={styles.input} />
        </View>
      </View>
      <Text style={styles.fieldLabel}>{t('new_unit_dues')}</Text>
      <TextInput value={dues} onChangeText={setDues} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={palette.textSubtle} style={styles.input} />
      {err ? <Text style={{ color: palette.danger, fontSize: 13, marginTop: spacing.sm }}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <Button label={t('cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} disabled={saving} />
        <Button label={saving ? t('saving') : t('save')} onPress={submit} disabled={!number.trim() || saving} loading={saving} style={{ flex: 1 }} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.divider },
  action: { padding: 6 },
  errorBox: {
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  fieldLabel: { ...type.small, color: palette.textMuted, marginBottom: 6 },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
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
});
