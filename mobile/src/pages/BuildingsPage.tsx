import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, EmptyState, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { BottomSheet } from '../components/BottomSheet';
import {
  ListToolbar,
  FilterSheet,
  SheetMenuItem,
  SheetHeader,
  isFilterActive,
  type FilterGroup,
  type FilterValue,
} from '../components/ListChrome';
import { palette, spacing, type } from '../components/theme';
import { useI18n } from '../i18n';
import type { AppStackParamList } from '../navigation/types';
import { BuildingFormModal } from '../components/BuildingFormModal';
import { useConfirm } from '../components/ConfirmProvider';

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
  const { confirm } = useConfirm();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [buildings, setBuildings] = useState<AdminBuilding[]>([]);
  // Set of building ids that have at least one building admin (active or
  // invited). Buildings missing from this set get a "needs admin" hint and
  // cannot be activated by the backend until one is appointed.
  const [adminBuildingIds, setAdminBuildingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<AdminBuilding | null>(null);
  // Action queued to run after the action sheet finishes closing. Presenting a
  // confirm sheet (another Modal) while this one is still dismissing freezes
  // iOS, so we defer such actions to the sheet's onClosed.
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [filters, setFilters] = useState<FilterValue>({});
  const [filterOpen, setFilterOpen] = useState(false);

  const fetchBuildings = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get('/buildings');
      setBuildings((r.data?.buildings ?? []) as AdminBuilding[]);
      // Best-effort: derive which buildings already have an admin so we can
      // flag the ones that still need one. A failure here is non-fatal.
      try {
        const u = await api.get('/buildings/users/all');
        const rows = (u.data?.users ?? []) as Array<{
          isBuildingAdmin?: boolean;
          status?: string;
          buildingId?: string | null;
          building?: { _id?: string } | null;
        }>;
        const ids = new Set<string>();
        for (const row of rows) {
          if (row.isBuildingAdmin && (row.status === 'active' || row.status === 'invited')) {
            const id = row.building?._id ?? row.buildingId;
            if (id) ids.add(String(id));
          }
        }
        setAdminBuildingIds(ids);
      } catch {
        // leave the previous set in place if the roster call fails
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('buildings_err_load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  // Refetch on focus too, so status changes made on inner screens (e.g.
  // activating a building from BuildingUsers) are reflected on return.
  useFocusEffect(
    useCallback(() => {
      void fetchBuildings();
    }, [fetchBuildings]),
  );

  async function confirmDelete(b: AdminBuilding) {
    const ok = await confirm({
      title: tf('buildings_delete_title', { name: b.name }),
      message: t('buildings_delete_body'),
      confirmLabel: t('remove'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/buildings/${b._id}`);
      setBuildings((prev) => prev.filter((x) => x._id !== b._id));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({
        title: t('buildings_err_delete'),
        message: msg ?? t('buildings_err_delete'),
        confirmLabel: t('continue'),
      });
    }
  }

  async function toggleStatus(b: AdminBuilding) {
    const next = b.status === 'active' ? 'inactive' : 'active';
    // Activation requires an appointed building admin. Pre-check locally so we
    // show a localized message instead of the server's English fallback.
    if (next === 'active' && !adminBuildingIds.has(b._id)) {
      await confirm({
        title: t('buildings_activate_needs_admin_title'),
        message: t('buildings_activate_needs_admin'),
        confirmLabel: t('continue'),
      });
      return;
    }
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
      const err = (e as { response?: { data?: { error?: { code?: string; message?: string } } } })
        ?.response?.data?.error;
      // Localize the known "needs a building admin" case; fall back to the
      // server message (then a generic string) for anything else.
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

  function openActions(b: AdminBuilding) {
    setActionTarget(b);
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

  const statusF = filters.status ?? 'all';
  const mgmtF = filters.management ?? 'all';
  const visible = buildings.filter((b) => {
    if (statusF !== 'all' && b.status !== statusF) return false;
    const hasAdmin = adminBuildingIds.has(b._id);
    if (mgmtF === 'needs_admin' && hasAdmin) return false;
    if (mgmtF === 'has_admin' && !hasAdmin) return false;
    return true;
  });

  const filterGroups: FilterGroup[] = [
    {
      id: 'status',
      title: t('filter_group_status'),
      options: [
        { value: 'all', label: t('filter_opt_all'), count: buildings.length },
        {
          value: 'active',
          label: t('buildings_status_active'),
          count: buildings.filter((b) => b.status === 'active').length,
        },
        {
          value: 'inactive',
          label: t('buildings_status_inactive'),
          count: buildings.filter((b) => b.status === 'inactive').length,
        },
      ],
    },
    {
      id: 'management',
      title: t('filter_group_management'),
      options: [
        { value: 'all', label: t('filter_opt_all') },
        {
          value: 'needs_admin',
          label: t('buildings_filter_needs_admin'),
          count: buildings.filter((b) => !adminBuildingIds.has(b._id)).length,
        },
        {
          value: 'has_admin',
          label: t('buildings_filter_has_admin'),
          count: buildings.filter((b) => adminBuildingIds.has(b._id)).length,
        },
      ],
    },
  ];
  const filtersActive = isFilterActive(filterGroups, filters);

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
      <ListToolbar
        countLabel={`${t('buildings_title')} · ${visible.length}`}
        onFilter={() => setFilterOpen(true)}
        filterActive={filtersActive}
        onAdd={() => setCreateOpen(true)}
        addA11yLabel={t('buildings_new_title')}
      />

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
      ) : visible.length === 0 ? (
        <EmptyState icon="🏢" title={t('buildings_empty_title')} body={t('buildings_empty_body')} />
      ) : (
        <Card padded={false}>
          {visible.map((b, i) => (
            <BuildingRow
              key={b._id}
              b={b}
              needsAdmin={!adminBuildingIds.has(b._id)}
              onPress={() => openActions(b)}
              isLast={i === visible.length - 1}
            />
          ))}
        </Card>
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

      <BottomSheet
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onClosed={() => {
          const run = pendingAction;
          setPendingAction(null);
          run?.();
        }}
      >
        {actionTarget ? (
          <View>
            <SheetHeader title={actionTarget.name} subtitle={actionTarget.address || undefined} />

            <SheetMenuItem
              icon="chevronLeft"
              label={t('buildings_action_open')}
              onPress={() => {
                const id = actionTarget._id;
                setPendingAction(() => () => navigation.navigate('BuildingDetail', { buildingId: id }));
                setActionTarget(null);
              }}
            />
            <SheetMenuItem
              icon="users"
              label={t('buildings_action_users')}
              onPress={() => {
                const b = actionTarget;
                setPendingAction(() => () =>
                  navigation.navigate('BuildingUsers', { buildingId: b._id, buildingName: b.name }),
                );
                setActionTarget(null);
              }}
            />
            <SheetMenuItem
              icon="units"
              label={t('buildings_units_title')}
              onPress={() => {
                const b = actionTarget;
                setPendingAction(() => () =>
                  navigation.navigate('BuildingUnits', { buildingId: b._id, buildingName: b.name }),
                );
                setActionTarget(null);
              }}
            />
            <SheetMenuItem
              icon="power"
              label={actionTarget.status === 'active' ? t('buildings_action_deactivate') : t('buildings_action_activate')}
              onPress={() => {
                const b = actionTarget;
                setPendingAction(() => () => void toggleStatus(b));
                setActionTarget(null);
              }}
            />
            <SheetMenuItem
              icon="trash"
              label={t('remove')}
              tone="danger"
              onPress={() => {
                const b = actionTarget;
                setPendingAction(() => () => void confirmDelete(b));
                setActionTarget(null);
              }}
            />
            <SheetMenuItem label={t('cancel')} tone="muted" onPress={() => setActionTarget(null)} />
          </View>
        ) : null}
      </BottomSheet>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title={t('filter_title')}
        groups={filterGroups}
        value={filters}
        onChange={(groupId, optionValue) =>
          setFilters((prev) => ({ ...prev, [groupId]: optionValue }))
        }
        onClear={() => setFilters({})}
        clearLabel={t('filter_clear')}
        doneLabel={t('filter_done')}
      />
    </ScrollView>
  );
}

function BuildingRow({
  b,
  needsAdmin,
  onPress,
  isLast,
}: {
  b: AdminBuilding;
  needsAdmin: boolean;
  onPress: () => void;
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
          {needsAdmin && (
            <View style={styles.warnRow}>
              <Icon name="warning" size={14} color={palette.warning} />
              <Text style={styles.needsAdminHint} numberOfLines={1}>
                {t('buildings_appoint_admin')}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rowRight}>
          <Pill
            label={t(b.status === 'active' ? 'buildings_status_active' : 'buildings_status_inactive')}
            tone={b.status === 'active' ? 'positive' : 'warning'}
          />
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  divider: { height: 1, backgroundColor: palette.divider, marginHorizontal: spacing.md },
  needsAdminHint: { fontSize: 12, color: palette.warning, fontWeight: '700' },
  errorBox: {
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
});
