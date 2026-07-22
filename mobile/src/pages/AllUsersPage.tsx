import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api/client';
import { setBuildingAdmin, setUserStatus, resetUserPassword, getUserLoginLink } from '../api/users';
import { Avatar, Card, EmptyState, Pill, PhoneText } from '../components/ui';
import { CreateUserModal } from '../components/CreateUserModal';
import { UserActionSheet, type UserSheetItem } from '../components/UserActionSheet';
import { useConfirm } from '../components/ConfirmProvider';
import {
  ListToolbar,
  SearchField,
  FilterSheet,
  isFilterActive,
  type FilterGroup,
  type FilterValue,
} from '../components/ListChrome';
import { palette, spacing, type } from '../components/theme';
import { useI18n } from '../i18n';
import type { Role } from '../auth/AuthContext';
import type { StringKey } from '../i18n/strings';

/**
 * System-admin's cross-building user roster — ONE row per user regardless of
 * building. Each row summarizes every building the user belongs to (role +
 * units). Tap a user to edit their name or jump into a building's roster.
 */

interface MembershipRow {
  buildingId: string;
  buildingName: string;
  buildingStatus?: 'active' | 'inactive';
  role: Role;
  isBuildingAdmin: boolean;
  unitIds: string[];
  unitNumbers: string[];
}

interface AdminUserRow {
  _id: string;
  email?: string | null;
  phone: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'invited' | 'suspended';
  memberships: MembershipRow[];
}

const ROLE_KEY: Record<Role, StringKey> = {
  admin: 'role_admin',
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
  independent: 'role_independent',
};

const STATUS_KEY: Record<AdminUserRow['status'], StringKey> = {
  active: 'user_status_active',
  invited: 'user_status_invited',
  suspended: 'user_status_suspended',
};

const statusTone: Record<AdminUserRow['status'], 'positive' | 'accent' | 'danger'> = {
  active: 'positive',
  invited: 'accent',
  suspended: 'danger',
};

const ROSTER_ROLES: Role[] = ['owner', 'renter', 'dependent', 'independent'];

export function AllUsersPage() {
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterValue>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<AdminUserRow | null>(null);
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get('/buildings/users/all');
      setUsers((r.data?.users ?? []) as AdminUserRow[]);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? t('users_err_load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  // Distinct buildings across all users' memberships, for the building filter.
  const buildingOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) for (const m of u.memberships) map.set(m.buildingId, m.buildingName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const roleF = filters.role ?? 'all';
  const buildingF = filters.building ?? 'all';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleF !== 'all' && !u.memberships.some((m) => m.role === roleF)) return false;
      if (buildingF === 'none' && u.memberships.length > 0) return false;
      if (buildingF !== 'all' && buildingF !== 'none' && !u.memberships.some((m) => m.buildingId === buildingF))
        return false;
      if (!q) return true;
      const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
      return (
        name.includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        u.memberships.some(
          (m) =>
            m.buildingName.toLowerCase().includes(q) ||
            m.unitNumbers.some((n) => n.toLowerCase().includes(q)),
        )
      );
    });
  }, [users, query, roleF, buildingF]);

  const filterGroups: FilterGroup[] = [
    {
      id: 'role',
      title: t('filter_group_role'),
      options: [
        { value: 'all', label: t('filter_opt_all'), count: users.length },
        ...ROSTER_ROLES.map((r) => ({
          value: r,
          label: t(ROLE_KEY[r]),
          count: users.filter((u) => u.memberships.some((m) => m.role === r)).length,
        })),
      ],
    },
    {
      id: 'building',
      title: t('filter_group_building'),
      options: [
        { value: 'all', label: t('filter_opt_all') },
        {
          value: 'none',
          label: t('users_filter_no_building'),
          count: users.filter((u) => u.memberships.length === 0).length,
        },
        ...buildingOptions.map((b) => ({
          value: b.id,
          label: b.name,
          count: users.filter((u) => u.memberships.some((m) => m.buildingId === b.id)).length,
        })),
      ],
    },
  ];
  const filtersActive = isFilterActive(filterGroups, filters);

  async function mutate(action: () => Promise<unknown>) {
    try {
      await action();
      await fetch();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('users_err_save'), message: msg ?? '', confirmLabel: t('done') });
    }
  }

  async function toggleBuildingAdmin(u: AdminUserRow, m: MembershipRow) {
    await mutate(() => setBuildingAdmin(m.buildingId, u._id, !m.isBuildingAdmin));
  }

  async function sendLogin(u: AdminUserRow) {
    try {
      const r = await getUserLoginLink(u._id);
      if (r.whatsappUrl) await Linking.openURL(r.whatsappUrl);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('users_err_save'), message: msg ?? '', confirmLabel: t('done') });
    }
  }

  async function resendCredentials(u: AdminUserRow) {
    const ok = await confirm({
      title: t('users_resend_confirm_title'),
      message: t('users_resend_confirm_body'),
      confirmLabel: t('users_resend_confirm_ok'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    try {
      const r = await resetUserPassword(u._id);
      if (r.whatsappUrl) await Linking.openURL(r.whatsappUrl);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('users_err_save'), message: msg ?? '', confirmLabel: t('done') });
    }
  }

  async function toggleStatus(u: AdminUserRow) {
    if (u.status === 'active') {
      const ok = await confirm({
        title: t('users_action_deactivate'),
        message: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.phone,
        confirmLabel: t('users_action_deactivate'),
        destructive: true,
      });
      if (ok) await mutate(() => setUserStatus(u._id, 'suspended'));
    } else {
      await mutate(() => setUserStatus(u._id, 'active'));
    }
  }

  // The action-sheet items for the selected user — mirrors what the building
  // roster offers, but with one building-admin toggle per building they're in.
  const sheetItems: UserSheetItem[] = actionTarget
    ? [
        {
          key: 'edit',
          icon: 'edit',
          label: t('edit_user_title'),
          onPress: () => setEditTarget(actionTarget),
        },
        {
          key: 'send',
          icon: 'message',
          label: t('users_action_send_login'),
          onPress: () => void sendLogin(actionTarget),
        },
        {
          key: 'resend',
          icon: 'key',
          label: t('users_action_resend'),
          onPress: () => void resendCredentials(actionTarget),
        },
        ...actionTarget.memberships.map((m) => ({
          key: `ba-${m.buildingId}`,
          icon: 'shield' as const,
          label: `${m.buildingName} — ${m.isBuildingAdmin ? t('demote_building_admin') : t('promote_building_admin')}`,
          tone: (m.isBuildingAdmin ? 'neutral' : 'warning') as 'neutral' | 'warning',
          onPress: () => void toggleBuildingAdmin(actionTarget, m),
        })),
        {
          key: 'status',
          icon: 'power',
          label: actionTarget.status === 'active' ? t('users_action_deactivate') : t('users_action_activate'),
          tone: actionTarget.status === 'active' ? ('danger' as const) : ('neutral' as const),
          onPress: () => void toggleStatus(actionTarget),
        },
      ]
    : [];

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
        countLabel={`${t('nav_users')} · ${filtered.length}`}
        onFilter={() => setFilterOpen(true)}
        filterActive={filtersActive}
        onAdd={() => setCreateOpen(true)}
        addA11yLabel={t('create_user_title')}
      />

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
            return (
              <View key={u._id}>
                <TouchableOpacity activeOpacity={0.85} style={styles.row} onPress={() => setActionTarget(u)}>
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
                    {u.memberships.length === 0 ? (
                      <Text style={[type.small, { color: palette.textSubtle }]} numberOfLines={1}>
                        {t('users_filter_no_building')}
                      </Text>
                    ) : (
                      u.memberships.map((m) => (
                        <Text
                          key={m.buildingId}
                          style={[type.small, { color: palette.textSubtle }]}
                          numberOfLines={1}
                        >
                          {m.buildingName} · {t(ROLE_KEY[m.role])}
                          {m.unitNumbers.length ? ` · ${m.unitNumbers.join(', ')}` : ''}
                        </Text>
                      ))
                    )}
                  </View>
                  <Pill label={t(STATUS_KEY[u.status])} tone={statusTone[u.status]} />
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
            ? `${actionTarget.firstName ?? ''} ${actionTarget.lastName ?? ''}`.trim() || actionTarget.phone
            : ''
        }
        subtitle={
          actionTarget
            ? actionTarget.memberships.map((m) => m.buildingName).join(' · ') || t('users_filter_no_building')
            : undefined
        }
        items={sheetItems}
      />

      <CreateUserModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        editUser={
          editTarget
            ? {
                _id: editTarget._id,
                firstName: editTarget.firstName,
                lastName: editTarget.lastName,
                phone: editTarget.phone,
                memberships: editTarget.memberships.map((m) => ({
                  buildingId: m.buildingId,
                  role: m.role as 'owner' | 'renter' | 'dependent' | 'independent',
                  unitIds: m.unitIds,
                  isBuildingAdmin: m.isBuildingAdmin,
                })),
              }
            : undefined
        }
        onCreated={() => {
          setEditTarget(null);
          void fetch();
        }}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title={t('filter_title')}
        groups={filterGroups}
        value={filters}
        onChange={(groupId, optionValue) => setFilters((prev) => ({ ...prev, [groupId]: optionValue }))}
        onClear={() => setFilters({})}
        clearLabel={t('filter_clear')}
        doneLabel={t('filter_done')}
      />

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => void fetch()} />
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
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
});
