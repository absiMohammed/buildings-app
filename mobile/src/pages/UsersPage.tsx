import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatPhone, ltrPhone, palette, spacing, type } from '../components/theme';
import { Avatar, Card, EmptyState, Pill, PhoneText } from '../components/ui';
import {
  ListToolbar,
  SearchField,
  FilterSheet,
  SheetMenuItem,
  SheetHeader,
  isFilterActive,
  type FilterGroup,
  type FilterValue,
} from '../components/ListChrome';
import { BottomSheet } from '../components/BottomSheet';
import { listUsers, setUserStatus, setUserRole, setBuildingAdmin, type BuildingUser } from '../api/users';
import { listUnits } from '../api/units';
import { useApiResource } from '../api/useApiResource';
import type { Role } from '../auth/AuthContext';
import { useAuth } from '../auth/AuthContext';
import { ACTIONS, hasAction } from '../auth/capabilities';
import { InviteModal } from '../components/InviteModal';
import { UserSettingsModal } from '../components/UserSettingsModal';
import { EditUserModal } from '../components/EditUserModal';
import { useConfirm } from '../components/ConfirmProvider';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const ROLE_KEY: Record<Role, StringKey> = {
  admin: 'role_admin',
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
  independent: 'role_independent',
};

const STATUS_KEY: Record<BuildingUser['status'], StringKey> = {
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

const statusTone: Record<BuildingUser['status'], 'positive' | 'accent' | 'danger'> = {
  active: 'positive',
  invited: 'accent',
  suspended: 'danger',
};

const BUILDING_ROLES: Role[] = ['owner', 'renter', 'dependent', 'independent'];
const STATUSES: BuildingUser['status'][] = ['active', 'invited', 'suspended'];

export function UsersPage() {
  const { user, capabilities: caps } = useAuth();
  const canInvite = hasAction(caps, ACTIONS.USER_INVITE);
  const canManage = hasAction(caps, ACTIONS.USER_MANAGE);
  const canPromote = hasAction(caps, ACTIONS.USER_PROMOTE);
  const { t, tf } = useI18n();
  const { confirm } = useConfirm();

  const fetcher = useCallback(async () => {
    const [users, units] = await Promise.all([listUsers(), listUnits()]);
    return { users, units };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    fetcher,
    t('users_err_load'),
  );

  const users = useMemo(() => data?.users ?? [], [data]);
  const units = useMemo(() => data?.units ?? [], [data]);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterValue>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<{ id: string; label: string } | null>(null);
  const [actionTarget, setActionTarget] = useState<BuildingUser | null>(null);
  const [editTarget, setEditTarget] = useState<BuildingUser | null>(null);
  // Deferred until the action sheet closes — opening another Modal (confirm or
  // settings) while this one is still dismissing freezes iOS.
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // unitId → unit number, so rows/search can show the number the server
  // only exposes as an id on the user record.
  const unitNumberById = useMemo(() => {
    const m = new Map<string, string>();
    units.forEach((u) => m.set(u._id, u.number));
    return m;
  }, [units]);

  function unitNumberOf(u: BuildingUser): string | undefined {
    return u.unitId ? unitNumberById.get(u.unitId) : undefined;
  }

  const roleF = filters.role ?? 'all';
  const statusF = filters.status ?? 'all';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleF !== 'all' && u.role !== roleF) return false;
      if (statusF !== 'all' && u.status !== statusF) return false;
      if (!q) return true;
      const unit = u.unitId ? unitNumberById.get(u.unitId) : undefined;
      return (
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        (!!unit && unit.toLowerCase().includes(q))
      );
    });
  }, [query, roleF, statusF, users, unitNumberById]);

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

  async function mutate(action: () => Promise<unknown>) {
    try {
      await action();
      await reload();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      await confirm({ title: t('users_err_save'), message: msg ?? '', confirmLabel: t('done') });
    }
  }

  function openActions(target: BuildingUser) {
    if (!canManage && !canPromote) return;
    setActionTarget(target);
  }

  async function toggleStatus(target: BuildingUser) {
    setActionTarget(null);
    if (target.status === 'active') {
      const ok = await confirm({
        title: t('users_action_deactivate'),
        message: `${target.firstName} ${target.lastName}`,
        confirmLabel: t('users_action_deactivate'),
        destructive: true,
      });
      if (ok) await mutate(() => setUserStatus(target._id, 'suspended'));
    } else {
      await mutate(() => setUserStatus(target._id, 'active'));
    }
  }

  async function promoteRole(target: BuildingUser) {
    setActionTarget(null);
    const ok = await confirm({
      title: t('users_promote_title'),
      message: tf('users_promote_body', { name: `${target.firstName} ${target.lastName}` }),
      confirmLabel: t('users_promote_confirm'),
    });
    if (ok) await mutate(() => setUserRole(target._id, 'admin'));
  }

  async function toggleBuildingAdmin(target: BuildingUser) {
    setActionTarget(null);
    if (!target.buildingId) return;
    const next = !target.isBuildingAdmin;
    // Removing the last building admin deactivates the whole building — warn.
    if (!next) {
      const activeAdmins = users.filter(
        (u) => u.isBuildingAdmin && (u.status === 'active' || u.status === 'invited'),
      );
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
    await mutate(() => setBuildingAdmin(target.buildingId as string, target._id, next));
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ListToolbar
        countLabel={`${t('users_residents_caps')} · ${filtered.length}`}
        onFilter={() => setFilterOpen(true)}
        filterActive={filtersActive}
        onAdd={canInvite ? () => setInviteOpen(true) : undefined}
        addA11yLabel={t('new_invite')}
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
            const unit = unitNumberOf(u);
            const name = `${u.firstName} ${u.lastName}`.trim();
            return (
              <View key={u._id}>
                <TouchableOpacity
                  activeOpacity={canManage || canPromote ? 0.85 : 1}
                  onPress={() => openActions(u)}
                  style={styles.row}
                >
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
            <SheetHeader
              title={
                `${actionTarget.firstName} ${actionTarget.lastName}`.trim() ||
                ltrPhone(formatPhone(actionTarget.phone))
              }
              subtitle={`${ltrPhone(formatPhone(actionTarget.phone))} · ${t(ROLE_KEY[actionTarget.role])}`}
            />

            {canManage && (
              <SheetMenuItem
                icon="edit"
                label={t('users_action_edit')}
                onPress={() => {
                  const target = actionTarget;
                  setPendingAction(() => () => setEditTarget(target));
                  setActionTarget(null);
                }}
              />
            )}

            {canManage && (
              <SheetMenuItem
                icon="settings"
                label={t('users_action_settings')}
                onPress={() => {
                  const target = actionTarget;
                  setPendingAction(() => () =>
                    setSettingsTarget({
                      id: target._id,
                      label: `${target.firstName} ${target.lastName} · ${t(ROLE_KEY[target.role])}`,
                    }),
                  );
                  setActionTarget(null);
                }}
              />
            )}

            {canPromote && actionTarget.buildingId && (
              <SheetMenuItem
                icon="shield"
                label={
                  actionTarget.isBuildingAdmin
                    ? t('demote_building_admin')
                    : t('promote_building_admin')
                }
                tone={actionTarget.isBuildingAdmin ? 'neutral' : 'warning'}
                onPress={() => {
                  const target = actionTarget;
                  setPendingAction(() => () => void toggleBuildingAdmin(target));
                  setActionTarget(null);
                }}
              />
            )}

            {canPromote && actionTarget.role === 'owner' && (
              <SheetMenuItem
                icon="shield"
                label={t('users_action_promote_admin')}
                onPress={() => {
                  const target = actionTarget;
                  setPendingAction(() => () => void promoteRole(target));
                  setActionTarget(null);
                }}
              />
            )}
            {canPromote && actionTarget.role === 'admin' && actionTarget._id !== user?._id && (
              <SheetMenuItem
                icon="user"
                label={t('users_action_demote_owner')}
                onPress={() => {
                  const target = actionTarget;
                  setPendingAction(() => () => void mutate(() => setUserRole(target._id, 'owner')));
                  setActionTarget(null);
                }}
              />
            )}

            {canManage && (
              <SheetMenuItem
                icon="power"
                label={
                  actionTarget.status === 'active'
                    ? t('users_action_deactivate')
                    : t('users_action_activate')
                }
                tone={actionTarget.status === 'active' ? 'danger' : 'neutral'}
                onPress={() => {
                  const target = actionTarget;
                  setPendingAction(() => () => void toggleStatus(target));
                  setActionTarget(null);
                }}
              />
            )}

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

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        defaultRole="renter"
        units={units.map((u) => ({
          _id: u._id,
          number: u.number,
          hasOwner: !!u.ownerId,
          hasRenter: users.some(
            (x) => x.unitId === u._id && x.role === 'renter' && x.status !== 'suspended',
          ),
        }))}
        onInvited={() => void reload()}
      />

      <UserSettingsModal
        open={!!settingsTarget}
        onClose={() => setSettingsTarget(null)}
        userId={settingsTarget?.id ?? ''}
        userLabel={settingsTarget?.label ?? ''}
        initial={null}
      />

      <EditUserModal
        open={!!editTarget}
        userId={editTarget?._id ?? ''}
        initialFirstName={editTarget?.firstName ?? ''}
        initialLastName={editTarget?.lastName ?? ''}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          void reload();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  errorBox: {
    padding: spacing.md,
    backgroundColor: palette.dangerSoft,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.md },
});
