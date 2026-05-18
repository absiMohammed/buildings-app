import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, type Role } from '../auth/AuthContext';
import { ACTIONS, EMPTY_CAPABILITIES, hasAction } from '../auth/capabilities';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import { Button, Card, EmptyState, IconCircle, Pill, SectionHeader } from '../components/ui';
import { relativeDay, type MockTicket } from '../mocks/fixtures';
import { useMockStore } from '../mocks/store';
import { NewTicketModal } from '../components/NewTicketModal';
import { TAB_BAR_HEIGHT } from '../components/BottomTabBar';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const categoryGlyph: Record<MockTicket['category'], string> = {
  plumbing: '🚿',
  electrical: '⚡',
  hvac: '❄️',
  general: '🛠️',
};

const priorityTone: Record<MockTicket['priority'], 'danger' | 'warning' | 'neutral'> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

const statusTone: Record<MockTicket['status'], 'warning' | 'accent' | 'positive' | 'neutral' | 'danger'> = {
  submitted: 'accent',
  rejected: 'danger',
  open: 'warning',
  in_progress: 'accent',
  resolved: 'positive',
  closed: 'neutral',
};

const STATUS_KEY: Record<MockTicket['status'], StringKey> = {
  submitted: 'ticket_submitted',
  rejected: 'ticket_rejected',
  open: 'ticket_open',
  in_progress: 'ticket_in_progress',
  resolved: 'ticket_resolved',
  closed: 'ticket_closed',
};

const CATEGORY_KEY: Record<MockTicket['category'], StringKey> = {
  plumbing: 'tcat_plumbing',
  electrical: 'tcat_electrical',
  hvac: 'tcat_hvac',
  general: 'tcat_general',
};

const PRIORITY_KEY: Record<MockTicket['priority'], StringKey> = {
  high: 'maint_priority_high',
  medium: 'maint_priority_medium',
  low: 'maint_priority_low',
};

export function MaintenancePage() {
  const insets = useSafeAreaInsets();
  const { user, capabilities: caps } = useAuth();
  const role = (user?.role ?? 'renter') as Role;
  const canCreate = hasAction(caps, ACTIONS.TICKET_CREATE);
  const canApprove = hasAction(caps, ACTIONS.TICKET_APPROVE);
  const canResolve = hasAction(caps, ACTIONS.TICKET_RESOLVE);
  const { tickets, users, createTicket, approveTicket, rejectTicket, setTicketStatus } = useMockStore();
  const [reportOpen, setReportOpen] = useState(false);
  const { t, tf } = useI18n();

  const myEmail = user?.email ?? '';
  const myUnit = useMemo(
    () => users.find((u) => u.email.toLowerCase() === myEmail.toLowerCase())?.unit,
    [users, myEmail]
  );

  // ----- Per-role bucketing -----
  const buckets = useMemo(() => {
    const mine = tickets.filter((t) => t.reporterEmail.toLowerCase() === myEmail.toLowerCase());

    if (role === 'admin') {
      const pendingApproval = tickets.filter((t) => t.status === 'submitted');
      const buildingActive = tickets.filter(
        (t) => t.scope === 'common' && (t.status === 'open' || t.status === 'in_progress')
      );
      const buildingDone = tickets.filter(
        (t) => t.scope === 'common' && (t.status === 'resolved' || t.status === 'closed' || t.status === 'rejected')
      );
      return { pendingApproval, buildingActive, buildingDone, mine };
    }

    if (role === 'owner') {
      const myUnitActive = tickets.filter(
        (t) =>
          t.scope === 'unit' &&
          t.unit === myUnit &&
          (t.status === 'open' || t.status === 'in_progress')
      );
      const myUnitDone = tickets.filter(
        (t) => t.scope === 'unit' && t.unit === myUnit && (t.status === 'resolved' || t.status === 'closed')
      );
      return { myUnitActive, myUnitDone, mine };
    }

    // renter / dependent — see only their own submissions
    return { mine };
  }, [tickets, role, myEmail, myUnit]);

  function confirmReject(ticket: MockTicket) {
    Alert.alert(
      t('maint_reject_title'),
      tf('maint_reject_body', { title: ticket.title }),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('reject'), style: 'destructive', onPress: () => rejectTicket(ticket._id) },
      ]
    );
  }

  function changeStatus(ticket: MockTicket) {
    const opts: { text: string; status?: MockTicket['status']; style?: 'cancel' | 'destructive' }[] = [
      { text: t('cancel'), style: 'cancel' },
    ];
    if (ticket.status !== 'in_progress') opts.unshift({ text: t('maint_status_in_progress'), status: 'in_progress' });
    if (ticket.status !== 'resolved') opts.unshift({ text: t('maint_status_resolved'), status: 'resolved' });
    if (ticket.status === 'resolved') opts.unshift({ text: t('maint_status_reopen'), status: 'open' });
    Alert.alert(ticket.title, t('maint_status_alert_body'), opts.map((o) => ({
      text: o.text,
      style: o.style,
      onPress: o.status ? () => setTicketStatus(ticket._id, o.status!) : undefined,
    })));
  }

  function reportPressed() {
    if (!canCreate) return;
    setReportOpen(true);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Admin moderation queue */}
        {canApprove && (buckets as any).pendingApproval !== undefined && (
          <>
            <SectionHeader title={tf('maint_section_pending', { count: (buckets as any).pendingApproval.length })} />
            {(buckets as any).pendingApproval.length === 0 ? (
              <Card><Text style={type.small}>{t('maint_nothing_waiting')}</Text></Card>
            ) : (
              <View style={{ gap: spacing.md }}>
                {(buckets as any).pendingApproval.map((ticket: MockTicket) => (
                  <TicketCard
                    key={ticket._id}
                    ticket={ticket}
                    reporterName={nameFor(ticket.reporterEmail, users)}
                    extra={
                      <View style={styles.actionsRow}>
                        <Button label={t('reject')} variant="secondary" onPress={() => confirmReject(ticket)} style={{ flex: 1 }} />
                        <Button label={t('approve')} onPress={() => approveTicket(ticket._id)} style={{ flex: 1 }} />
                      </View>
                    }
                  />
                ))}
              </View>
            )}
          </>
        )}

        {/* Owner: my unit */}
        {role === 'owner' && (
          <>
            <SectionHeader title={tf('maint_section_active_in_unit', { unit: myUnit ?? '—' })} />
            {((buckets as any).myUnitActive ?? []).length === 0 ? (
              <Card><Text style={type.small}>{t('maint_no_active_unit')}</Text></Card>
            ) : (
              <View style={{ gap: spacing.md }}>
                {((buckets as any).myUnitActive as MockTicket[]).map((ticket) => (
                  <TicketCard
                    key={ticket._id}
                    ticket={ticket}
                    reporterName={nameFor(ticket.reporterEmail, users)}
                    extra={
                      canResolve ? (
                        <View style={styles.actionsRow}>
                          <Button label={t('update_status')} variant="secondary" onPress={() => changeStatus(ticket)} style={{ flex: 1 }} />
                        </View>
                      ) : null
                    }
                  />
                ))}
              </View>
            )}

            {((buckets as any).myUnitDone ?? []).length > 0 && (
              <>
                <SectionHeader title={t('maint_section_done')} />
                <View style={{ gap: spacing.md }}>
                  {((buckets as any).myUnitDone as MockTicket[]).map((ticket) => (
                    <TicketCard key={ticket._id} ticket={ticket} reporterName={nameFor(ticket.reporterEmail, users)} />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Admin: building section */}
        {canResolve && role === 'admin' && (
          <>
            <SectionHeader title={t('maint_section_building_active')} />
            {((buckets as any).buildingActive ?? []).length === 0 ? (
              <Card><Text style={type.small}>{t('maint_all_clear')}</Text></Card>
            ) : (
              <View style={{ gap: spacing.md }}>
                {((buckets as any).buildingActive as MockTicket[]).map((ticket) => (
                  <TicketCard
                    key={ticket._id}
                    ticket={ticket}
                    reporterName={nameFor(ticket.reporterEmail, users)}
                    extra={
                      <View style={styles.actionsRow}>
                        <Button label={t('update_status')} variant="secondary" onPress={() => changeStatus(ticket)} style={{ flex: 1 }} />
                      </View>
                    }
                  />
                ))}
              </View>
            )}

            {((buckets as any).buildingDone ?? []).length > 0 && (
              <>
                <SectionHeader title={t('maint_section_building_history')} />
                <View style={{ gap: spacing.md }}>
                  {((buckets as any).buildingDone as MockTicket[]).map((ticket) => (
                    <TicketCard key={ticket._id} ticket={ticket} reporterName={nameFor(ticket.reporterEmail, users)} />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Everyone: my submissions */}
        <SectionHeader title={t('maint_section_my_reports')} />
        {(buckets.mine ?? []).length === 0 ? (
          <EmptyState
            icon="🛠️"
            title={t('maint_no_reports')}
            body={t('maint_no_reports_body')}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {(buckets.mine as MockTicket[]).map((ticket) => (
              <TicketCard key={ticket._id} ticket={ticket} reporterName={t('maint_reporter_you')} />
            ))}
          </View>
        )}

        <View style={{ height: 96 }} />
      </ScrollView>

      {canCreate && (
        <TouchableOpacity
          style={[styles.fab, { bottom: TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + spacing.lg }]}
          activeOpacity={0.9}
          onPress={reportPressed}
        >
          <Text style={styles.fabIcon}>＋</Text>
          <Text style={styles.fabLabel}>{t('new_report_label')}</Text>
        </TouchableOpacity>
      )}

      <NewTicketModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultUnit={myUnit ?? undefined}
        forbidUnitScope={!myUnit}
        onSubmit={(input) => {
          createTicket({ ...input, reporterEmail: myEmail });
          setReportOpen(false);
        }}
      />
    </View>
  );
}

function nameFor(email: string, users: ReturnType<typeof useMockStore>['users']): string {
  const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!u) return email;
  return `${u.firstName} ${u.lastName[0]}.`;
}

function TicketCard({
  ticket,
  reporterName,
  extra,
}: {
  ticket: MockTicket;
  reporterName: string;
  extra?: React.ReactNode;
}) {
  const { t, tf } = useI18n();
  const place = ticket.scope === 'unit' ? tf('maint_place_unit', { n: ticket.unit }) : t('maint_place_common');
  return (
    <Card>
      <View style={styles.row}>
        <IconCircle glyph={categoryGlyph[ticket.category]} tone={priorityTone[ticket.priority]} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>{ticket.title}</Text>
          <Text style={type.small}>
            {tf('maint_meta_line', { place, relative: relativeDay(ticket.createdAt), name: reporterName })}
          </Text>
        </View>
        <Pill label={t(STATUS_KEY[ticket.status])} tone={statusTone[ticket.status]} />
      </View>
      <Text style={[type.small, { marginTop: spacing.sm }]}>{ticket.description}</Text>
      {ticket.status === 'rejected' && ticket.rejectionReason ? (
        <Text style={[type.small, { color: palette.danger, marginTop: 4 }]}>
          {tf('maint_reason_prefix', { reason: ticket.rejectionReason })}
        </Text>
      ) : null}
      <View style={styles.metaRow}>
        <Pill label={t(PRIORITY_KEY[ticket.priority])} tone={priorityTone[ticket.priority]} />
        <Pill label={t(CATEGORY_KEY[ticket.category])} tone="neutral" />
      </View>
      {extra}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },

  fab: {
    position: 'absolute',
    end: spacing.lg,
    backgroundColor: palette.accent,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...shadow,
  },
  fabIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  fabLabel: { color: '#fff', fontWeight: '600' },
});
