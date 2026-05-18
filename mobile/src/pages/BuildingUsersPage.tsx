import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { api } from '../api/client';
import { Avatar, Button, Card, EmptyState, Pill } from '../components/ui';
import { InviteModal, type InviteUnitOption } from '../components/InviteModal';
import { palette, radii, spacing, type, textStart } from '../components/theme';
import { useI18n } from '../i18n';
import type { Role } from '../auth/AuthContext';
import type { StringKey } from '../i18n/strings';
import type { AppStackParamList } from '../navigation/types';

interface AdminUser {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  unitId?: string | null;
  isBuildingAdmin?: boolean;
}

interface AdminUnit {
  _id: string;
  number: string;
}

const ROLE_KEY: Record<Role, StringKey> = {
  admin: 'role_admin',
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
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
};

const statusTone: Record<AdminUser['status'], 'positive' | 'accent' | 'danger'> = {
  active: 'positive',
  invited: 'accent',
  suspended: 'danger',
};

/**
 * Per-building user list. The admin lands here from BuildingsPage and can
 * invite new residents (admin must specify the target building, which this
 * page injects into InviteModal) and toggle status / kick / promote.
 */
export function BuildingUsersPage() {
  const route = useRoute<RouteProp<AppStackParamList, 'BuildingUsers'>>();
  const { t, tf } = useI18n();
  const buildingId = route.params?.buildingId;
  const buildingName = route.params?.buildingName ?? '';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [units, setUnits] = useState<AdminUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const [usersR, unitsR] = await Promise.all([
        api.get(`/buildings/${buildingId}/users`),
        api.get(`/buildings/${buildingId}/units`),
      ]);
      setUsers((usersR.data?.users ?? []) as AdminUser[]);
      setUnits((unitsR.data?.units ?? []) as AdminUnit[]);
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

  // The system admin's invite flow is intentionally narrow: they can only
  // appoint the building's admin (one owner with `isBuildingAdmin`). Once
  // an admin exists for this building, the invite button hides — all
  // subsequent invites are the building admin's responsibility.
  const hasBuildingAdmin = useMemo(
    () => users.some((u) => u.role === 'owner' && u.isBuildingAdmin && u.status !== 'suspended'),
    [users]
  );

  // Compute slot signals per unit so InviteModal can disable taken roles.
  const inviteUnits: InviteUnitOption[] = useMemo(() => {
    return units.map((u) => {
      const occupants = users.filter((x) => x.unitId === u._id && x.status !== 'suspended');
      return {
        _id: u._id,
        number: u.number,
        hasOwner: occupants.some((x) => x.role === 'owner'),
        hasRenter: occupants.some((x) => x.role === 'renter'),
      };
    });
  }, [users, units]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.firstName ?? '').toLowerCase().includes(q) ||
        (u.lastName ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

  async function setUserStatus(target: AdminUser, next: 'active' | 'suspended') {
    try {
      const r = await api.patch(`/users/${target._id}/status`, { status: next });
      const updated = r.data?.user as AdminUser;
      setUsers((prev) => prev.map((u) => (u._id === target._id ? { ...u, ...updated } : u)));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      Alert.alert(t('users_err_save'), msg ?? '');
    }
  }

  function openActions(target: AdminUser) {
    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: t('cancel'), style: 'cancel' },
    ];
    if (target.status === 'active') {
      buttons.unshift({
        text: t('users_action_deactivate'),
        style: 'destructive',
        onPress: () => setUserStatus(target, 'suspended'),
      });
    } else if (target.status === 'suspended') {
      buttons.unshift({
        text: t('users_action_activate'),
        onPress: () => setUserStatus(target, 'active'),
      });
    }
    Alert.alert(
      `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim() || target.email,
      `${target.email} · ${t(ROLE_KEY[target.role])}`,
      buttons
    );
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
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('nav_users').toUpperCase()}</Text>
          <Text style={type.display}>{users.length}</Text>
          <Text style={type.small}>{buildingName || tf('buildings_users_in', { n: '' })}</Text>
        </View>
        {hasBuildingAdmin ? null : (
          <Button
            label={t('buildings_appoint_admin')}
            variant="primary"
            onPress={() => setInviteOpen(true)}
            style={{ paddingHorizontal: 16 }}
          />
        )}
      </View>
      {hasBuildingAdmin && (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{t('buildings_admin_appointed_note')}</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

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

      <Card padded={false}>
        {filtered.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState icon="👥" title={t('users_no_match')} body="" />
          </View>
        ) : (
          filtered.map((u, i) => (
            <View key={u._id}>
              <TouchableOpacity activeOpacity={0.85} style={styles.row} onPress={() => openActions(u)}>
                <Avatar name={`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
                    {`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email}
                  </Text>
                  <Text style={type.small} numberOfLines={1}>
                    {u.email}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-start', gap: 4 }}>
                  <Pill label={t(ROLE_KEY[u.role])} tone={roleTone[u.role]} />
                  <Pill label={t(STATUS_KEY[u.status])} tone={statusTone[u.status]} />
                </View>
              </TouchableOpacity>
              {i < filtered.length - 1 && <View style={styles.divider} />}
            </View>
          ))
        )}
      </Card>

      <View style={{ height: spacing.xl }} />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        // Admin can only appoint the building admin (owner + flag). Role
        // chip is locked, dependent/renter not offered.
        defaultRole="owner"
        lockedRole="owner"
        allowedRoles={['owner']}
        markBuildingAdmin
        units={inviteUnits}
        buildingId={buildingId}
        onInvited={() => {
          setInviteOpen(false);
          void fetch();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
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
  noteBox: {
    padding: spacing.md,
    backgroundColor: palette.accentSoft,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  noteText: { color: palette.accent, fontSize: 13, fontWeight: '600' },
  searchWrap: { position: 'relative', marginBottom: spacing.md },
  searchIcon: {
    position: 'absolute',
    start: spacing.md,
    top: spacing.sm + 2,
    fontSize: 16,
    color: palette.textSubtle,
    zIndex: 1,
  },
  search: {
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md + 24,
    backgroundColor: palette.inputBg,
    fontSize: 15,
    color: palette.text,
    ...textStart,
  },
});
