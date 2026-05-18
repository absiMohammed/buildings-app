import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { palette, radii, shadow, spacing, textStart, type } from '../components/theme';
import { Avatar, Card, Pill, Button } from '../components/ui';
import { type MockUser } from '../mocks/fixtures';
import { useMockStore } from '../mocks/store';
import type { Role } from '../auth/AuthContext';
import { useAuth } from '../auth/AuthContext';
import { ACTIONS, EMPTY_CAPABILITIES, hasAction } from '../auth/capabilities';
import { InviteModal } from '../components/InviteModal';
import { UserSettingsModal } from '../components/UserSettingsModal';
import type { UserSettings } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const ROLE_KEY: Record<Role, StringKey> = {
  admin: 'role_admin',
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
};

const STATUS_KEY: Record<MockUser['status'], StringKey> = {
  active: 'user_status_active',
  invited: 'user_status_invited',
  suspended: 'user_status_suspended',
};

type RoleFilter = 'all' | Role;

const roleTone: Record<Role, 'accent' | 'positive' | 'warning' | 'neutral'> = {
  admin: 'accent',
  owner: 'positive',
  renter: 'warning',
  dependent: 'neutral',
};

const statusTone: Record<MockUser['status'], 'positive' | 'accent' | 'danger'> = {
  active: 'positive',
  invited: 'accent',
  suspended: 'danger',
};

export function UsersPage() {
  const { user, capabilities: caps } = useAuth();
  const canInvite = hasAction(caps, ACTIONS.USER_INVITE);
  const canManage = hasAction(caps, ACTIONS.USER_MANAGE);
  const canPromote = hasAction(caps, ACTIONS.USER_PROMOTE);
  const { users, units, setUserStatus, setUserRole, removeUser } = useMockStore();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<{
    id: string;
    label: string;
    initial: UserSettings | null;
  } | null>(null);
  const { t, tf } = useI18n();

  const counts = useMemo(() => {
    const m: Record<string, number> = { admin: 0, owner: 0, renter: 0, dependent: 0 };
    users.forEach((u) => (m[u.role] += 1));
    return m;
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.unit && u.unit.toLowerCase().includes(q))
      );
    });
  }, [query, roleFilter, users]);

  function openActions(target: MockUser) {
    if (!canManage && !canPromote) return;
    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: t('cancel'), style: 'cancel' },
    ];
    if (canManage) {
      if (target.status === 'active') {
        buttons.unshift({
          text: t('users_action_deactivate'),
          style: 'destructive',
          onPress: () => setUserStatus(target._id, 'suspended'),
        });
      } else {
        buttons.unshift({
          text: t('users_action_activate'),
          onPress: () => setUserStatus(target._id, 'active'),
        });
      }
    }
    if (canPromote) {
      if (target.role === 'owner') {
        buttons.unshift({
          text: t('users_action_promote_admin'),
          onPress: () =>
            Alert.alert(
              t('users_promote_title'),
              tf('users_promote_body', { name: `${target.firstName} ${target.lastName}` }),
              [
                { text: t('cancel'), style: 'cancel' },
                { text: t('users_promote_confirm'), onPress: () => setUserRole(target._id, 'admin') },
              ]
            ),
        });
      } else if (target.role === 'admin' && target._id !== user?._id) {
        buttons.unshift({
          text: t('users_action_demote_owner'),
          onPress: () => setUserRole(target._id, 'owner'),
        });
      }
    }
    if (canManage) {
      buttons.unshift({
        text: t('users_action_settings'),
        onPress: () =>
          setSettingsTarget({
            id: target._id,
            label: `${target.firstName} ${target.lastName} · ${t(ROLE_KEY[target.role])}`,
            initial: (target as MockUser & { settings?: UserSettings }).settings ?? null,
          }),
      });
    }
    if (canManage && target._id !== user?._id) {
      buttons.unshift({
        text: t('users_action_remove'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            tf('users_remove_title', { name: target.firstName }),
            t('users_remove_body'),
            [
              { text: t('cancel'), style: 'cancel' },
              { text: t('remove'), style: 'destructive', onPress: () => removeUser(target._id) },
            ]
          ),
      });
    }
    Alert.alert(`${target.firstName} ${target.lastName}`, `${target.email} · ${t(ROLE_KEY[target.role])}`, buttons);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('users_residents_caps')}</Text>
          <Text style={type.display}>{users.length}</Text>
          <Text style={type.small}>
            {tf('users_across_roles', { count: Object.keys(counts).filter((k) => counts[k] > 0).length })}
          </Text>
        </View>
        {canInvite && (
          <Button
            label={t('new_invite')}
            variant="primary"
            style={{ paddingHorizontal: 16 }}
            onPress={() => setInviteOpen(true)}
          />
        )}
      </View>

      <View style={styles.statsRow}>
        <RoleStat label={t('users_admins')} value={counts.admin} tone="accent" />
        <RoleStat label={t('users_owners')} value={counts.owner} tone="positive" />
        <RoleStat label={t('users_renters')} value={counts.renter} tone="warning" />
        <RoleStat label={t('users_dependents')} value={counts.dependent} tone="neutral" />
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('users_search_ph')}
          placeholderTextColor={palette.textSubtle}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.filterRow}>
        {(['all', 'admin', 'owner', 'renter', 'dependent'] as RoleFilter[]).map((r) => (
          <TouchableOpacity key={r} onPress={() => setRoleFilter(r)} style={[styles.filterBtn, roleFilter === r && styles.filterBtnActive]} activeOpacity={0.85}>
            <Text style={[styles.filterText, roleFilter === r && styles.filterTextActive]}>
              {r === 'all' ? t('users_filter_all') : t(ROLE_KEY[r])}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Card padded={false}>
        {filtered.map((u, i) => (
          <View key={u._id}>
            <TouchableOpacity
              activeOpacity={canManage || canPromote ? 0.85 : 1}
              onPress={() => openActions(u)}
              style={styles.row}
            >
              <Avatar name={`${u.firstName} ${u.lastName}`} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '600' }]}>{u.firstName} {u.lastName}</Text>
                <Text style={type.small}>
                  {u.unit ? tf('users_meta_email_unit', { email: u.email, unit: u.unit }) : u.email}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-start', gap: 4 }}>
                <Pill label={t(ROLE_KEY[u.role])} tone={roleTone[u.role]} />
                <Pill label={t(STATUS_KEY[u.status])} tone={statusTone[u.status]} />
              </View>
              {(canManage || canPromote) && <Text style={styles.kebab}>⋯</Text>}
            </TouchableOpacity>
            {i < filtered.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
        {filtered.length === 0 && <Text style={[type.small, { padding: spacing.lg }]}>{t('users_no_match')}</Text>}
      </Card>

      <View style={{ height: spacing.xl }} />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        defaultRole="renter"
        units={units.map((u) => {
          const occupants = users.filter((x) => x.unit === u.number);
          return {
            _id: u._id,
            number: u.number,
            hasOwner: occupants.some((x) => x.role === 'owner' && x.status !== 'suspended'),
            hasRenter: occupants.some((x) => x.role === 'renter' && x.status !== 'suspended'),
          };
        })}
      />

      <UserSettingsModal
        open={!!settingsTarget}
        onClose={() => setSettingsTarget(null)}
        userId={settingsTarget?.id ?? ''}
        userLabel={settingsTarget?.label ?? ''}
        initial={settingsTarget?.initial ?? null}
      />
    </ScrollView>
  );
}

function RoleStat({ label, value, tone }: { label: string; value: number; tone: 'accent' | 'positive' | 'warning' | 'neutral' }) {
  const fg = tone === 'accent' ? palette.accent : tone === 'positive' ? palette.success : tone === 'warning' ? palette.warning : palette.textSubtle;
  const bg = tone === 'accent' ? palette.accentSoft : tone === 'positive' ? palette.successSoft : tone === 'warning' ? palette.warningSoft : palette.surfaceMuted;
  return (
    <View style={[styles.statTile, { backgroundColor: bg }]}>
      <Text style={[styles.statValue, { color: fg }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statTile: { flex: 1, borderRadius: radii.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: 'flex-start', ...shadow },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: spacing.md,
  },
  searchIcon: { fontSize: 14 },
  search: { flex: 1, paddingVertical: 10, color: palette.text, fontSize: 15, ...textStart },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: spacing.md },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border },
  filterBtnActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  filterText: { fontSize: 12, color: palette.textMuted, textTransform: 'capitalize', fontWeight: '500' },
  filterTextActive: { color: '#fff', fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg },
  kebab: { color: palette.textSubtle, fontSize: 22, marginStart: spacing.sm },
});
