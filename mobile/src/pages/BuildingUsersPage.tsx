import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { api } from '../api/client';
import { setBuildingAdmin, resetUserPassword, getUserLoginLink } from '../api/users';
import { listBuildingUnits, type Unit } from '../api/units';
import { Avatar, Card, EmptyState, Notice, Pill, PhoneText } from '../components/ui';
import { CreateUserModal } from '../components/CreateUserModal';
import { EditUserModal } from '../components/EditUserModal';
import { UserActionSheet, type UserSheetItem } from '../components/UserActionSheet';
import {
  ListToolbar,
  SearchField,
  FilterSheet,
  isFilterActive,
  type FilterGroup,
  type FilterValue,
} from '../components/ListChrome';
import { useConfirm } from '../components/ConfirmProvider';
import { formatPhone, ltrPhone, palette, radii, spacing, type } from '../components/theme';
import { useI18n } from '../i18n';
import type { Role } from '../auth/AuthContext';
import type { StringKey } from '../i18n/strings';
import type { AppStackParamList } from '../navigation/types';

interface AdminUser {
  _id: string;
  email: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  unitId?: string | null;
  isBuildingAdmin?: boolean;
}

const ROLE_KEY: Record<Role, StringKey> = {
  admin: 'role_admin',
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
  independent: 'role_independent',
};

const STATUS_KEY: Record<AdminUser['status'], StringKey> = {
  active: 'user_status_active',
  invited: 'user_status_invited',
  suspended: 'user_status_suspended',
};

const roleTone: Record<Role, 'accent' | 'positive' | 'warning' | 'neutral'> = {
  admin: 'accent',
  owner: 'positive',
  renter: 'warning',
  dependent: 'neutral',
  independent: 'neutral',
};

const statusTone: Record<AdminUser['status'], 'positive' | 'accent' | 'danger'> = {
  active: 'positive',
  invited: 'accent',
  suspended: 'danger',
};

// Roles a resident row can carry within a building (super-admin never lives
// in a building, so it is intentionally absent from the filter).
const BUILDING_ROLES: Role[] = ['owner', 'renter', 'dependent', 'independent'];
const STATUSES: AdminUser['status'][] = ['active', 'invited', 'suspended'];

/**
 * Per-building user list. Shares the buildings-screen architecture: a compact
 * toolbar (count + filter + add), search field, multi-criteria filter sheet,
 * a tap-to-open action sheet per row.
 */
export function BuildingUsersPage() {
  const route = useRoute<RouteProp<AppStackParamList, 'BuildingUsers'>>();
  const { t, tf } = useI18n();
  const { confirm } = useConfirm();
  const buildingId = route.params?.buildingId;
  const buildingName = route.params?.buildingName ?? '';
  // When arrived from a specific unit, scope the roster + the add flow to it.
  const unitId = route.params?.unitId;
  const unitNumber = route.params?.unitNumber;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<AdminUser | null>(null);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [filters, setFilters] = useState<FilterValue>({});
  const [filterOpen, setFilterOpen] = useState(false);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const [usersR, unitsList] = await Promise.all([
        api.get(`/buildings/${buildingId}/users`),
        buildingId ? listBuildingUnits(buildingId).catch(() => [] as Unit[]) : Promise.resolve([] as Unit[]),
      ]);
      setUsers((usersR.data?.users ?? []) as AdminUser[]);
      setUnits(unitsList);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('users_err_load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildingId, t]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const hasBuildingAdmin = useMemo(
    () => users.some((u) => u.role === 'owner' && u.isBuildingAdmin && u.status !== 'suspended'),
    [users],
  );

  const unitNumberById = useMemo(() => {
    const m = new Map<string, string>();
    units.forEach((u) => m.set(u._id, u.number));
    return m;
  }, [units]);

  const roleF = filters.role ?? 'all';
  const statusF = filters.status ?? 'all';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (unitId && u.unitId !== unitId) return false;
      if (roleF !== 'all' && u.role !== roleF) return false;
      if (statusF !== 'all' && u.status !== statusF) return false;
      if (!q) return true;
      return (
        (u.firstName ?? '').toLowerCase().includes(q) ||
        (u.lastName ?? '').toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q)
      );
    });
  }, [users, query, roleF, statusF, unitId]);

  const filterGroups: FilterGroup[] = [
    {
      id: 'role',
      title: t('filter_group_role'),
      options: [
        { value: 'all', label: t('filter_opt_all'), count: users.length },
        ...BUILDING_ROLES.map((r) => ({
          value: r,
          label: t(ROLE_KEY[r]),
          count: users.filter((u) => u.role === r).length,
        })),
      ],
    },
    {
      id: 'status',
      title: t('filter_group_status'),
      options: [
        { value: 'all', label: t('filter_opt_all') },
        ...STATUSES.map((s) => ({
          value: s,
          label: t(STATUS_KEY[s]),
          count: users.filter((u) => u.status === s).length,
        })),
      ],
    },
  ];
  const filtersActive = isFilterActive(filterGroups, filters);

  // Shared action-sheet items for the tapped user — preset to THIS building.
  const sheetItems: UserSheetItem[] = actionTarget
    ? [
        { key: 'edit', icon: 'edit', label: t('users_action_edit'), onPress: () => setEditTarget(actionTarget) },
        { key: 'send', icon: 'message', label: t('users_action_send_login'), onPress: () => void sendLogin(actionTarget) },
        { key: 'resend', icon: 'key', label: t('users_action_resend'), onPress: () => void resendCredentials(actionTarget) },
        {
          key: 'ba',
          icon: 'shield',
          label: actionTarget.isBuildingAdmin ? t('demote_building_admin') : t('promote_building_admin'),
          tone: actionTarget.isBuildingAdmin ? 'neutral' : 'warning',
          onPress: () => void toggleBuildingAdmin(actionTarget),
        },
        ...(actionTarget.status === 'active' || actionTarget.status === 'suspended'
          ? [
              {
                key: 'status',
                icon: 'power' as const,
                label:
                  actionTarget.status === 'active'
                    ? t('users_action_deactivate')
                    : t('users_action_activate'),
                tone: (actionTarget.status === 'active' ? 'danger' : 'neutral') as 'danger' | 'neutral',
                onPress: () => void toggleStatus(actionTarget),
              },
            ]
          : []),
      ]
    : [];

  async function setUserStatus(target: AdminUser, next: 'active' | 'suspended') {
    try {
      const r = await api.patch(`/users/${target._id}/status`, { status: next });
      const updated = r.data?.user as AdminUser;
      setUsers((prev) => prev.map((u) => (u._id === target._id ? { ...u, ...updated } : u)));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('users_err_save'), message: msg ?? '', confirmLabel: t('done') });
    }
  }

  function openActions(target: AdminUser) {
    setActionTarget(target);
  }

  async function toggleStatus(target: AdminUser) {
    setActionTarget(null);
    if (target.status === 'active') {
      const ok = await confirm({
        title: t('users_action_deactivate'),
        message: `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim() || target.phone,
        confirmLabel: t('users_action_deactivate'),
        destructive: true,
      });
      if (ok) await setUserStatus(target, 'suspended');
    } else if (target.status === 'suspended') {
      await setUserStatus(target, 'active');
    }
  }

  async function sendLogin(target: AdminUser) {
    try {
      const r = await getUserLoginLink(target._id);
      if (r.whatsappUrl) await Linking.openURL(r.whatsappUrl);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('users_err_save'), message: msg ?? '', confirmLabel: t('done') });
    }
  }

  async function resendCredentials(target: AdminUser) {
    const ok = await confirm({
      title: t('users_resend_confirm_title'),
      message: t('users_resend_confirm_body'),
      confirmLabel: t('users_resend_confirm_ok'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    try {
      const r = await resetUserPassword(target._id);
      if (r.whatsappUrl) await Linking.openURL(r.whatsappUrl);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('users_err_save'), message: msg ?? '', confirmLabel: t('done') });
    }
  }

  async function toggleBuildingAdmin(target: AdminUser) {
    setActionTarget(null);
    if (!buildingId) return;
    const next = !target.isBuildingAdmin;
    // Active/invited building admins right now (the ones that keep a building
    // "managed" and therefore activatable).
    const activeAdmins = users.filter(
      (u) => u.isBuildingAdmin && (u.status === 'active' || u.status === 'invited'),
    );

    // Removing the last building admin deactivates the whole building — warn.
    if (!next) {
      const isLast = activeAdmins.length === 1 && activeAdmins[0]?._id === target._id;
      if (isLast) {
        const ok = await confirm({
          title: t('users_last_admin_title'),
          message: t('users_last_admin_body'),
          confirmLabel: t('users_last_admin_confirm'),
          cancelLabel: t('cancel'),
          destructive: true,
        });
        if (!ok) return;
      }
    }

    try {
      const updated = await setBuildingAdmin(buildingId, target._id, next);
      setUsers((prev) =>
        prev.map((u) =>
          u._id === target._id ? { ...u, isBuildingAdmin: updated.isBuildingAdmin } : u,
        ),
      );
      // Appointing the building's first admin makes it activatable — offer to
      // activate the whole building right away (system-admin only endpoint).
      if (next && activeAdmins.length === 0) {
        const activate = await confirm({
          title: t('users_activate_building_title'),
          message: t('users_activate_building_body'),
          confirmLabel: t('users_activate_building_confirm'),
          cancelLabel: t('cancel'),
        });
        if (activate) {
          try {
            await api.patch(`/buildings/${buildingId}/status`, { status: 'active' });
          } catch (e) {
            const msg = (e as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message;
            await confirm({ title: t('buildings_err_status'), message: msg ?? '', confirmLabel: t('done') });
          }
        }
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('users_err_save'), message: msg ?? '', confirmLabel: t('done') });
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
        countLabel={`${unitNumber ? `${buildingName} · ${unitNumber}` : buildingName || t('nav_users')} · ${filtered.length}`}
        onFilter={() => setFilterOpen(true)}
        filterActive={filtersActive}
        onAdd={() => setInviteOpen(true)}
        addA11yLabel={t('create_user_title')}
      />

      {!hasBuildingAdmin && (
        <Notice
          tone="warning"
          message={t('buildings_appoint_admin')}
          style={styles.notice}
        />
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SearchField value={query} onChangeText={setQuery} placeholder={t('users_search_ph')} />

      <Card padded={false}>
        {filtered.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState iconName="users" title={t('users_no_match')} body="" />
          </View>
        ) : (
          filtered.map((u, i) => {
            const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
            const unit = u.unitId ? unitNumberById.get(u.unitId) : undefined;
            return (
              <View key={u._id}>
                <TouchableOpacity activeOpacity={0.85} style={styles.row} onPress={() => openActions(u)}>
                  <Avatar name={name || u.phone} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {name ? (
                      <>
                        <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
                          {name}
                        </Text>
                        <PhoneText phone={u.phone} numberOfLines={1} style={type.small} />
                      </>
                    ) : (
                      <PhoneText phone={u.phone} numberOfLines={1} style={[type.body, { fontWeight: '600' }]} />
                    )}
                    {unit ? (
                      <Text style={[type.small, { color: palette.textSubtle }]} numberOfLines={1}>
                        {tf('users_meta_unit_only', { unit })}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-start', gap: 4 }}>
                    {u.isBuildingAdmin && <Pill label={t('users_pill_building_admin')} tone="accent" />}
                    <Pill label={t(ROLE_KEY[u.role])} tone={roleTone[u.role]} />
                    <Pill label={t(STATUS_KEY[u.status])} tone={statusTone[u.status]} />
                  </View>
                </TouchableOpacity>
                {i < filtered.length - 1 && <View style={styles.divider} />}
              </View>
            );
          })
        )}
      </Card>

      <View style={{ height: spacing.xl }} />

      <UserActionSheet
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={
          actionTarget
            ? `${actionTarget.firstName ?? ''} ${actionTarget.lastName ?? ''}`.trim() ||
              ltrPhone(formatPhone(actionTarget.phone))
            : ''
        }
        subtitle={
          actionTarget
            ? `${ltrPhone(formatPhone(actionTarget.phone))} · ${t(ROLE_KEY[actionTarget.role])}`
            : undefined
        }
        items={sheetItems}
      />

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

      <CreateUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        // Locked to the building being viewed — role picker (owner/tenant/
        // follower/independent) + building-admin toggle; no super-admin option.
        building={buildingId ? { _id: buildingId, name: buildingName } : undefined}
        // When scoped to a unit, lock the add flow to that unit too.
        lockedUnit={unitId && unitNumber ? { _id: unitId, number: unitNumber } : undefined}
        onCreated={() => {
          void fetch();
        }}
      />

      <EditUserModal
        open={!!editTarget}
        userId={editTarget?._id ?? ''}
        initialFirstName={editTarget?.firstName ?? ''}
        initialLastName={editTarget?.lastName ?? ''}
        onClose={() => setEditTarget(null)}
        onSaved={(next) => {
          const id = editTarget?._id;
          setUsers((prev) =>
            prev.map((u) => (u._id === id ? { ...u, firstName: next.firstName, lastName: next.lastName } : u)),
          );
          setEditTarget(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { height: 1, backgroundColor: palette.divider, marginHorizontal: spacing.md },
  errorBox: {
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  notice: { marginBottom: spacing.md },
});
