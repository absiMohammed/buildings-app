import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { ACTIONS, hasAction } from '../auth/capabilities';
import { Icon, type IconName } from '../components/Icon';
import { palette, shadow, spacing, type } from '../components/theme';
import { Button, Card, EmptyState, IconCircle, Pill, SectionHeader } from '../components/ui';
import { relativeDay } from '../utils/format';
import {
  listMaintenance,
  updateMaintenance,
  type MaintenanceCategory,
  type MaintenancePriority,
  type MaintenanceRequest,
  type MaintenanceStatus,
} from '../api/maintenance';
import { apiErrorMessage, useApiResource } from '../api/useApiResource';
import { NewTicketModal } from '../components/NewTicketModal';
import { useConfirm } from '../components/ConfirmProvider';
import { TAB_BAR_HEIGHT } from '../components/BottomTabBar';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/strings';

const categoryIcon: Record<MaintenanceCategory, IconName> = {
  plumbing: 'maintenance',
  electrical: 'quick',
  elevator: 'elevator',
  common_area: 'buildings',
  other: 'more',
};

const priorityTone: Record<MaintenancePriority, 'danger' | 'warning' | 'neutral'> = {
  urgent: 'danger',
  high: 'danger',
  normal: 'warning',
  low: 'neutral',
};

const statusTone: Record<MaintenanceStatus, 'warning' | 'accent' | 'positive' | 'neutral'> = {
  open: 'warning',
  in_progress: 'accent',
  resolved: 'positive',
  closed: 'neutral',
};

const STATUS_KEY: Record<MaintenanceStatus, StringKey> = {
  open: 'ticket_open',
  in_progress: 'ticket_in_progress',
  resolved: 'ticket_resolved',
  closed: 'ticket_closed',
};

// The strings file only carries plumbing/electrical labels; the remaining
// server categories reuse the closest existing generic keys.
const CATEGORY_KEY: Record<MaintenanceCategory, StringKey> = {
  plumbing: 'tcat_plumbing',
  electrical: 'tcat_electrical',
  elevator: 'qa_elevator_title',
  common_area: 'maint_place_common',
  other: 'sub_method_other',
};

// Server has four priorities; the strings file has three labels, so 'urgent'
// borrows the 'high' label (no dedicated key, and it shares the danger tone).
const PRIORITY_KEY: Record<MaintenancePriority, StringKey> = {
  urgent: 'maint_priority_high',
  high: 'maint_priority_high',
  normal: 'maint_priority_medium',
  low: 'maint_priority_low',
};

function isActive(s: MaintenanceStatus): boolean {
  return s === 'open' || s === 'in_progress';
}

export function MaintenancePage() {
  const insets = useSafeAreaInsets();
  const { user, capabilities: caps } = useAuth();
  const canCreate = hasAction(caps, ACTIONS.TICKET_CREATE);
  const canResolve = hasAction(caps, ACTIONS.TICKET_RESOLVE);
  const [reportOpen, setReportOpen] = useState(false);
  const { t, tf } = useI18n();
  const { confirm } = useConfirm();

  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    listMaintenance,
    'Could not load maintenance requests.',
  );

  const tickets = useMemo(() => data ?? [], [data]);
  const myId = user?._id ?? '';
  const myUnitId = user?.unit?._id ?? null;
  const myUnitNumber = user?.unit?.number ?? null;

  const buckets = useMemo(() => {
    const active = tickets.filter((x) => isActive(x.status));
    const done = tickets.filter((x) => !isActive(x.status));
    const mine = tickets.filter((x) => x.filedBy === myId);
    return { active, done, mine };
  }, [tickets, myId]);

  function placeLabel(unitId: string | null): string {
    if (!unitId) return t('maint_place_common');
    if (myUnitId && unitId === myUnitId && myUnitNumber) {
      return tf('maint_place_unit', { n: myUnitNumber });
    }
    // Other units aren't populated with a number in the payload.
    return tf('maint_place_unit', { n: '—' });
  }

  async function applyStatus(ticket: MaintenanceRequest, status: MaintenanceStatus) {
    try {
      await updateMaintenance(ticket._id, { status });
      await reload();
    } catch (e) {
      await confirm({ title: ticket.title, message: apiErrorMessage(e, 'Could not update ticket.') });
    }
  }

  async function changeStatus(ticket: MaintenanceRequest) {
    const opts: { text: string; status: MaintenanceStatus }[] = [];
    if (ticket.status !== 'in_progress') opts.push({ text: t('maint_status_in_progress'), status: 'in_progress' });
    if (ticket.status !== 'resolved') opts.push({ text: t('maint_status_resolved'), status: 'resolved' });
    if (ticket.status === 'resolved') opts.push({ text: t('ticket_closed'), status: 'closed' });
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      opts.push({ text: t('maint_status_reopen'), status: 'open' });
    }
    for (const o of opts) {
      if (await confirm({ title: ticket.title, message: t('maint_status_alert_body'), confirmLabel: o.text })) {
        await applyStatus(ticket, o.status);
        return;
      }
    }
  }

  function reportPressed() {
    if (!canCreate) return;
    setReportOpen(true);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.center}>
        <EmptyState
          iconName="maintenance"
          title={error}
          action={{ label: t('back'), onPress: () => void refresh() }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        {/* Admin: everything in the building, movable through the status flow. */}
        {canResolve && (
          <>
            <SectionHeader title={t('maint_section_building_active')} />
            {buckets.active.length === 0 ? (
              <Card>
                <Text style={type.small}>{t('maint_all_clear')}</Text>
              </Card>
            ) : (
              <View style={{ gap: spacing.md }}>
                {buckets.active.map((ticket) => (
                  <TicketCard
                    key={ticket._id}
                    ticket={ticket}
                    place={placeLabel(ticket.unitId)}
                    reporterName={ticket.filedBy === myId ? t('maint_reporter_you') : null}
                    extra={
                      <View style={styles.actionsRow}>
                        <Button
                          label={t('update_status')}
                          variant="secondary"
                          onPress={() => void changeStatus(ticket)}
                          style={{ flex: 1 }}
                        />
                      </View>
                    }
                  />
                ))}
              </View>
            )}

            {buckets.done.length > 0 && (
              <>
                <SectionHeader title={t('maint_section_building_history')} />
                <View style={{ gap: spacing.md }}>
                  {buckets.done.map((ticket) => (
                    <TicketCard
                      key={ticket._id}
                      ticket={ticket}
                      place={placeLabel(ticket.unitId)}
                      reporterName={ticket.filedBy === myId ? t('maint_reporter_you') : null}
                      extra={
                        <View style={styles.actionsRow}>
                          <Button
                            label={t('update_status')}
                            variant="secondary"
                            onPress={() => void changeStatus(ticket)}
                            style={{ flex: 1 }}
                          />
                        </View>
                      }
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Everyone: the tickets I filed. */}
        <SectionHeader title={t('maint_section_my_reports')} />
        {buckets.mine.length === 0 ? (
          <EmptyState iconName="maintenance" title={t('maint_no_reports')} body={t('maint_no_reports_body')} />
        ) : (
          <View style={{ gap: spacing.md }}>
            {buckets.mine.map((ticket) => (
              <TicketCard
                key={ticket._id}
                ticket={ticket}
                place={placeLabel(ticket.unitId)}
                reporterName={t('maint_reporter_you')}
              />
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
          <Icon name="add" size={18} color="#fff" />
          <Text style={styles.fabLabel}>{t('new_report_label')}</Text>
        </TouchableOpacity>
      )}

      <NewTicketModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        unit={user?.unit ?? null}
        onCreated={() => {
          setReportOpen(false);
          void reload();
        }}
      />
    </View>
  );
}

function TicketCard({
  ticket,
  place,
  reporterName,
  extra,
}: {
  ticket: MaintenanceRequest;
  place: string;
  reporterName: string | null;
  extra?: React.ReactNode;
}) {
  const { t, tf } = useI18n();
  const meta = reporterName
    ? tf('maint_meta_line', { place, relative: relativeDay(ticket.createdAt), name: reporterName })
    : `${place} · ${relativeDay(ticket.createdAt)}`;
  return (
    <Card>
      <View style={styles.row}>
        <IconCircle iconName={categoryIcon[ticket.category]} tone={priorityTone[ticket.priority]} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>{ticket.title}</Text>
          <Text style={type.small}>{meta}</Text>
        </View>
        <Pill label={t(STATUS_KEY[ticket.status])} tone={statusTone[ticket.status]} />
      </View>
      {ticket.description ? (
        <Text style={[type.small, { marginTop: spacing.sm }]}>{ticket.description}</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
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
  fabLabel: { color: '#fff', fontWeight: '600' },
});
