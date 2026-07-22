import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, SectionHeader } from '../components/ui';
import { InviteModal } from '../components/InviteModal';
import { palette, spacing, type } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
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
 * Data note: there is no resident-accessible endpoint to enumerate unit
 * mates — `GET /users` is admin-only. A renter therefore cannot fetch the
 * dependent roster here. We render the household summary from the signed-in
 * user (`useAuth`) + the admin-granted `maxDependents` quota, keep the
 * invite flow (dependents are created through the real POST /invites API via
 * InviteModal), and show an info state in place of a live dependent list.
 */
export function MyHouseholdPage() {
  const { t, tf } = useI18n();
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);

  const myUnitNumber = user?.unit?.number ?? null;
  const myUnitId = user?.unit?._id ?? null;
  const dependentCap = user?.settings?.maxDependents ?? null;

  if (!myUnitNumber || !myUnitId) {
    return (
      <View style={styles.container}>
        <EmptyState
          iconName="household"
          title={t('household_title')}
          body={t('unit_not_found_body')}
        />
      </View>
    );
  }

  // No resident endpoint exposes the dependent roster, so the count shown to
  // the renter is always 0 here — the roster itself lives behind the admin
  // Users screen. The server still enforces `maxDependents` on POST /invites.
  const knownDependents = 0;

  const quotaCopy =
    dependentCap == null
      ? t('household_quota_unset')
      : tf('household_quota', { used: knownDependents, cap: dependentCap });

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
          disabled={dependentCap == null}
        />
      </Card>

      <SectionHeader title={t('household_title')} />
      <Card padded={false}>
        <View style={{ padding: spacing.lg }}>
          <Text style={type.small}>{t('household_no_dependents')}</Text>
        </View>
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
});
