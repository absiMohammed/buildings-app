import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, EmptyState, Pill, SectionHeader } from '../components/ui';
import { palette, spacing, type } from '../components/theme';
import { useI18n } from '../i18n';
import type { AppStackParamList } from '../navigation/types';
import { BuildingFormModal } from '../components/BuildingFormModal';

/**
 * System-admin-only entry point. Lists every building in the system; lets
 * the admin create, edit, activate / deactivate, or delete each one. Tap a
 * row to drill into its detail page (settings + per-building users).
 */
export interface AdminBuilding {
  _id: string;
  name: string;
  address?: string;
  currency: string;
  status: 'active' | 'inactive';
  /** System-admin allow-list of enabled module ids. `null`/undefined = no
   *  restriction (every role's full module set is active for this building). */
  enabledModules?: string[] | null;
  settings?: {
    monthlyDuesDay?: number;
    defaultMonthlyDues?: number;
    timezone?: string;
    geoCenter?: { lat?: number | null; lng?: number | null };
  };
}

export function BuildingsPage() {
  const { user } = useAuth();
  const { t, tf } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [buildings, setBuildings] = useState<AdminBuilding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchBuildings = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get('/buildings');
      setBuildings((r.data?.buildings ?? []) as AdminBuilding[]);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('buildings_err_load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchBuildings();
  }, [fetchBuildings]);

  function confirmDelete(b: AdminBuilding) {
    Alert.alert(tf('buildings_delete_title', { name: b.name }), t('buildings_delete_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/buildings/${b._id}`);
            setBuildings((prev) => prev.filter((x) => x._id !== b._id));
          } catch (e) {
            const msg = (e as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message;
            Alert.alert(t('buildings_err_delete'), msg ?? '');
          }
        },
      },
    ]);
  }

  async function toggleStatus(b: AdminBuilding) {
    const next = b.status === 'active' ? 'inactive' : 'active';
    // Optimistic: flip in state immediately, roll back on failure.
    setBuildings((prev) =>
      prev.map((x) => (x._id === b._id ? { ...x, status: next } : x))
    );
    try {
      await api.patch(`/buildings/${b._id}/status`, { status: next });
    } catch (e) {
      setBuildings((prev) =>
        prev.map((x) => (x._id === b._id ? { ...x, status: b.status } : x))
      );
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      Alert.alert(t('buildings_err_status'), msg ?? '');
    }
  }

  function openActions(b: AdminBuilding) {
    Alert.alert(b.name, b.address || t('buildings_no_address'), [
      {
        text: t('buildings_action_open'),
        onPress: () => navigation.navigate('BuildingDetail', { buildingId: b._id }),
      },
      {
        text: t('buildings_action_users'),
        onPress: () => navigation.navigate('BuildingUsers', { buildingId: b._id, buildingName: b.name }),
      },
      {
        text: b.status === 'active' ? t('buildings_action_deactivate') : t('buildings_action_activate'),
        onPress: () => toggleStatus(b),
      },
      { text: t('remove'), style: 'destructive', onPress: () => confirmDelete(b) },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <View style={[styles.container, styles.center]}>
        <EmptyState
          icon="🛑"
          title={t('settings_admin_only_title')}
          body={t('settings_admin_only_body')}
        />
      </View>
    );
  }

  const active = buildings.filter((b) => b.status === 'active');
  const inactive = buildings.filter((b) => b.status === 'inactive');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void fetchBuildings();
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('buildings_title').toUpperCase()}</Text>
          <Text style={type.display}>{buildings.length}</Text>
          <Text style={type.small}>{t('buildings_subtitle')}</Text>
        </View>
        <Button
          label={t('buildings_new')}
          variant="primary"
          onPress={() => setCreateOpen(true)}
          style={{ paddingHorizontal: 16 }}
        />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {buildings.length === 0 ? (
        <EmptyState
          icon="🏢"
          title={t('buildings_empty_title')}
          body={t('buildings_empty_body')}
          action={{ label: t('buildings_new'), onPress: () => setCreateOpen(true) }}
        />
      ) : (
        <>
          {active.length > 0 && (
            <>
              <SectionHeader title={tf('buildings_active', { n: active.length })} />
              <Card padded={false}>
                {active.map((b, i) => (
                  <BuildingRow
                    key={b._id}
                    b={b}
                    onPress={() => navigation.navigate('BuildingDetail', { buildingId: b._id })}
                    onKebab={() => openActions(b)}
                    isLast={i === active.length - 1}
                  />
                ))}
              </Card>
            </>
          )}
          {inactive.length > 0 && (
            <>
              <SectionHeader title={tf('buildings_inactive', { n: inactive.length })} />
              <Card padded={false}>
                {inactive.map((b, i) => (
                  <BuildingRow
                    key={b._id}
                    b={b}
                    onPress={() => navigation.navigate('BuildingDetail', { buildingId: b._id })}
                    onKebab={() => openActions(b)}
                    isLast={i === inactive.length - 1}
                  />
                ))}
              </Card>
            </>
          )}
        </>
      )}

      <View style={{ height: spacing.xl }} />

      <BuildingFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(b) => {
          setBuildings((prev) => [b, ...prev]);
          setCreateOpen(false);
        }}
      />
    </ScrollView>
  );
}

function BuildingRow({
  b,
  onPress,
  onKebab,
  isLast,
}: {
  b: AdminBuilding;
  onPress: () => void;
  onKebab: () => void;
  isLast: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
            {b.name}
          </Text>
          <Text style={type.small} numberOfLines={1}>
            {b.address || t('buildings_no_address')} · {b.currency}
          </Text>
        </View>
        <Pill
          label={t(b.status === 'active' ? 'buildings_status_active' : 'buildings_status_inactive')}
          tone={b.status === 'active' ? 'positive' : 'warning'}
        />
        <TouchableOpacity onPress={onKebab} hitSlop={8} style={{ paddingHorizontal: 8 }}>
          <Text style={styles.kebab}>⋯</Text>
        </TouchableOpacity>
      </TouchableOpacity>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { height: 1, backgroundColor: palette.divider, marginHorizontal: spacing.md },
  kebab: { fontSize: 18, color: palette.textMuted, fontWeight: '700' },
  errorBox: {
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
});
