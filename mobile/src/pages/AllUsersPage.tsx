import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Avatar, Card, EmptyState, Pill, SectionHeader } from '../components/ui';
import { palette, radii, spacing, type, textStart } from '../components/theme';
import { useI18n } from '../i18n';
import type { Role } from '../auth/AuthContext';
import type { StringKey } from '../i18n/strings';
import type { AppStackParamList } from '../navigation/types';

/**
 * System-admin's cross-building user roster. Read-only here; row-level
 * actions (activate / suspend / appoint building admin) live on the
 * per-building drill-in (BuildingUsersPage). This screen is the natural
 * counterpart to BuildingsPage — same surface, users-shaped.
 */

interface BuildingSummaryLite {
  _id: string;
  name: string;
  status?: 'active' | 'inactive';
}

interface AdminUserRow {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  isBuildingAdmin?: boolean;
  buildingId?: string | null;
  building?: BuildingSummaryLite | null;
}

const ROLE_KEY: Record<Role, StringKey> = {
  admin: 'role_admin',
  owner: 'role_owner',
  renter: 'role_renter',
  dependent: 'role_dependent',
};

const STATUS_KEY: Record<AdminUserRow['status'], StringKey> = {
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

const statusTone: Record<AdminUserRow['status'], 'positive' | 'accent' | 'danger'> = {
  active: 'positive',
  invited: 'accent',
  suspended: 'danger',
};

type RoleFilter = 'all' | Role;

export function AllUsersPage() {
  const { t, tf } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [buildingFilter, setBuildingFilter] = useState<string | 'all'>('all');

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

  // Distinct building list for the filter chip row. Sorted by name; admin
  // (building-agnostic users) goes into a synthetic "no building" bucket.
  const buildingOptions = useMemo<BuildingSummaryLite[]>(() => {
    const map = new Map<string, BuildingSummaryLite>();
    for (const u of users) {
      if (u.building) map.set(u.building._id, u.building);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (buildingFilter !== 'all') {
        const bid = u.building?._id ?? null;
        if (buildingFilter === 'none' && bid != null) return false;
        if (buildingFilter !== 'none' && bid !== buildingFilter) return false;
      }
      if (!q) return true;
      return (
        (u.firstName ?? '').toLowerCase().includes(q) ||
        (u.lastName ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.building?.name ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, query, roleFilter, buildingFilter]);

  const counts = useMemo(() => {
    const m: Record<Role, number> = { admin: 0, owner: 0, renter: 0, dependent: 0 };
    for (const u of users) m[u.role] = (m[u.role] ?? 0) + 1;
    return m;
  }, [users]);

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
          <Text style={type.small}>
            {tf('users_across_roles', { count: Object.keys(counts).filter((k) => counts[k as Role] > 0).length })}
          </Text>
        </View>
      </View>

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

      <SectionHeader title={t('users_filter_label')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(['all', 'admin', 'owner', 'renter', 'dependent'] as RoleFilter[]).map((r) => (
          <TouchableOpacity
            key={r}
            onPress={() => setRoleFilter(r)}
            style={[styles.chip, roleFilter === r && styles.chipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, roleFilter === r && styles.chipTextActive]}>
              {r === 'all' ? t('users_filter_all') : t(ROLE_KEY[r])}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {buildingOptions.length > 0 && (
        <>
          <SectionHeader title={t('users_filter_building')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <TouchableOpacity
              onPress={() => setBuildingFilter('all')}
              style={[styles.chip, buildingFilter === 'all' && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, buildingFilter === 'all' && styles.chipTextActive]}>
                {t('users_filter_all')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setBuildingFilter('none')}
              style={[styles.chip, buildingFilter === 'none' && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, buildingFilter === 'none' && styles.chipTextActive]}>
                {t('users_filter_no_building')}
              </Text>
            </TouchableOpacity>
            {buildingOptions.map((b) => (
              <TouchableOpacity
                key={b._id}
                onPress={() => setBuildingFilter(b._id)}
                style={[styles.chip, buildingFilter === b._id && styles.chipActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, buildingFilter === b._id && styles.chipTextActive]}>
                  {b.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <Card padded={false}>
        {filtered.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState icon="👥" title={t('users_no_match')} body="" />
          </View>
        ) : (
          filtered.map((u, i) => (
            <View key={u._id}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.row}
                onPress={() => {
                  if (u.building) {
                    navigation.navigate('BuildingUsers', {
                      buildingId: u.building._id,
                      buildingName: u.building.name,
                    });
                  }
                }}
                disabled={!u.building}
              >
                <Avatar name={`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
                    {`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email}
                  </Text>
                  <Text style={type.small} numberOfLines={1}>
                    {u.email}
                    {u.building ? ` · ${u.building.name}` : ` · ${t('users_filter_no_building')}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-start', gap: 4 }}>
                  <Pill
                    label={u.isBuildingAdmin ? t('users_pill_building_admin') : t(ROLE_KEY[u.role])}
                    tone={u.isBuildingAdmin ? 'accent' : roleTone[u.role]}
                  />
                  <Pill label={t(STATUS_KEY[u.status])} tone={statusTone[u.status]} />
                </View>
              </TouchableOpacity>
              {i < filtered.length - 1 && <View style={styles.divider} />}
            </View>
          ))
        )}
      </Card>

      <View style={{ height: spacing.xl }} />
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { fontSize: 13, color: palette.textMuted, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
});
