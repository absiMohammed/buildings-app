import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, Pill, SectionHeader } from '../components/ui';
import { InviteModal } from '../components/InviteModal';
import { palette, spacing, type } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
import { useMockStore } from '../mocks/store';
import { useI18n } from '../i18n';

/**
 * Renter-only surface for managing dependents in the renter's unit.
 *
 * Per the role rules (BRD §5):
 *  - Rule 7: when a renter is present, the renter — not the owner — is
 *    responsible for inviting dependents.
 *  - Rule 5: the renter's invites are bounded by `settings.maxDependents`
 *    set by the admin.
 *
 * The page surfaces the current dependent roster, shows the renter's
 * remaining quota, and opens InviteModal with role + unit locked.
 */
export function MyHouseholdPage() {
  const { t, tf } = useI18n();
  const { user } = useAuth();
  const { users } = useMockStore();
  const [inviteOpen, setInviteOpen] = useState(false);

  const myUnitNumber = user?.unit?.number ?? null;
  const myUnitId = user?.unit?._id ?? null;
  const dependentCap = user?.settings?.maxDependents ?? null;

  const dependents = useMemo(() => {
    if (!myUnitNumber) return [];
    return users.filter(
      (u) => u.unit === myUnitNumber && u.role === 'dependent' && u.status !== 'suspended'
    );
  }, [users, myUnitNumber]);

  if (!myUnitNumber || !myUnitId) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="🏠"
          title={t('household_title')}
          body={t('unit_not_found_body')}
        />
      </View>
    );
  }

  const quotaCopy =
    dependentCap == null
      ? t('household_quota_unset')
      : tf('household_quota', { used: dependents.length, cap: dependentCap });

  const capReached = dependentCap != null && dependents.length >= dependentCap;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <Text style={type.caption}>{t('household_title').toUpperCase()}</Text>
        <Text style={type.display}>{myUnitNumber}</Text>
        <Text style={type.small}>{t('household_subtitle')}</Text>
      </View>

      <Card>
        <Text style={[type.body, { fontWeight: '600' }]}>{quotaCopy}</Text>
        <View style={{ height: spacing.md }} />
        <Button
          label={t('household_invite_dependent')}
          onPress={() => setInviteOpen(true)}
          disabled={capReached || dependentCap == null}
        />
      </Card>

      <SectionHeader title={t('household_title')} />
      <Card padded={false}>
        {dependents.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Text style={type.small}>{t('household_no_dependents')}</Text>
          </View>
        ) : (
          dependents.map((d, i) => (
            <View key={d._id}>
              <View style={styles.row}>
                <Avatar name={`${d.firstName} ${d.lastName}`} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>
                    {d.firstName} {d.lastName}
                  </Text>
                  <Text style={type.small} numberOfLines={1}>
                    {d.email}
                  </Text>
                </View>
                <Pill
                  label={t(
                    d.status === 'active'
                      ? 'user_status_active'
                      : d.status === 'invited'
                        ? 'user_status_invited'
                        : 'user_status_suspended'
                  )}
                  tone={d.status === 'active' ? 'positive' : 'accent'}
                />
              </View>
              {i < dependents.length - 1 && <View style={styles.divider} />}
            </View>
          ))
        )}
      </Card>

      <View style={{ height: spacing.xl }} />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        defaultRole="dependent"
        lockedRole="dependent"
        allowedRoles={['dependent']}
        lockedUnit={{
          _id: myUnitId,
          number: myUnitNumber,
          hasOwner: true,
          hasRenter: true,
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  header: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { height: 1, backgroundColor: palette.divider, marginHorizontal: spacing.md },
});
