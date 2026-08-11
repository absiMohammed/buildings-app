import { useCallback, useState } from 'react';
import {
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ACTIONS, hasAction } from '../auth/capabilities';
import {
  createPoll,
  getPoll,
  listPolls,
  votePoll,
  type Poll,
  type PollDetail,
} from '../api/polls';
import { apiErrorMessage, useApiResource } from '../api/useApiResource';
import { relativeDay } from '../utils/format';
import { Icon } from '../components/Icon';
import { palette, radii, spacing, type } from '../components/theme';
import { Button, Card, EmptyState, Pill, ProgressBar, SectionHeader } from '../components/ui';
import { NewPollModal } from '../components/NewPollModal';
import { useConfirm } from '../components/ConfirmProvider';
import { useI18n } from '../i18n';

export function PollsPage() {
  const { capabilities: caps } = useAuth();
  const canCreate = hasAction(caps, ACTIONS.POLL_CREATE);
  const canVote = hasAction(caps, ACTIONS.POLL_VOTE);
  const { t, tf } = useI18n();
  const { confirm } = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);

  const polls = useApiResource(listPolls, '');

  if (polls.loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (!polls.data) {
    return (
      <View style={styles.center}>
        <EmptyState
          iconName="polls"
          title={t('nav_polls')}
          body={polls.error ?? undefined}
          action={{ label: t('back'), onPress: () => void polls.refresh() }}
        />
      </View>
    );
  }

  const list = polls.data;
  const open = list.filter((p) => p.status === 'open');
  const closed = list.filter((p) => p.status === 'closed');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={polls.refreshing} onRefresh={() => void polls.refresh()} />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.caption}>{t('polls_open_caps')}</Text>
          <Text style={type.display}>{open.length}</Text>
          <Text style={type.small}>{tf('polls_closed_quarter', { count: closed.length })}</Text>
        </View>
        {canCreate && (
          <Button
            label={t('new')}
            variant="primary"
            style={{ paddingHorizontal: 16 }}
            onPress={() => setCreateOpen(true)}
          />
        )}
      </View>

      {!canVote && (
        <View style={styles.readonlyBanner}>
          <Text style={styles.readonlyText}>{t('polls_readonly_banner')}</Text>
        </View>
      )}

      <SectionHeader title={t('polls_section_open')} />
      <View style={{ gap: spacing.md }}>
        {open.length === 0 ? (
          <Card><Text style={type.small}>{t('polls_none_open')}</Text></Card>
        ) : (
          open.map((p) => (
            <PollCard key={p._id} poll={p} canVote={canVote} onChanged={() => void polls.reload()} />
          ))
        )}
      </View>

      <SectionHeader title={t('polls_section_closed')} />
      <View style={{ gap: spacing.md }}>
        {closed.map((p) => (
          <PollCard key={p._id} poll={p} canVote={false} onChanged={() => void polls.reload()} />
        ))}
      </View>

      <View style={{ height: spacing.xl }} />

      <NewPollModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (input) => {
          try {
            await createPoll(input);
            await polls.reload();
            setCreateOpen(false);
          } catch (e) {
            await confirm({ title: t('nav_polls'), message: apiErrorMessage(e, '') });
          }
        }}
      />
    </ScrollView>
  );
}

/**
 * A single poll. Base info (title, description, options) comes from the list;
 * per-poll detail (the current user's vote and — only once closed — the vote
 * tallies) is fetched lazily from `getPoll` when the card is expanded. The
 * server never exposes live counts while a poll is open, so open polls show
 * their options as ballots only, no running totals.
 */
function PollCard({
  poll,
  canVote,
  onChanged,
}: {
  poll: Poll;
  canVote: boolean;
  onChanged: () => void;
}) {
  const { t, tf } = useI18n();
  const { confirm } = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<PollDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [voting, setVoting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const isClosed = poll.status === 'closed';

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getPoll(poll._id));
    } catch {
      // Keep the base card visible even if the detail fetch fails.
    } finally {
      setLoading(false);
    }
  }, [poll._id]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail && !loading) void loadDetail();
  }

  const myVote = detail?.myVote ?? null;
  const hasVoted = !!myVote;
  const tallies = detail?.tallies;
  const totalVotes = tallies ? Object.values(tallies).reduce((a, b) => a + b, 0) : 0;
  const canBallot = canVote && !isClosed && !hasVoted;

  async function submitVote(optionIds: string[]) {
    if (optionIds.length === 0 || voting) return;
    setVoting(true);
    try {
      await votePoll(poll._id, optionIds);
      setSelected([]);
      await loadDetail();
      onChanged();
    } catch (e) {
      await confirm({ title: t('nav_polls'), message: apiErrorMessage(e, '') });
    } finally {
      setVoting(false);
    }
  }

  function onOptionPress(optionId: string) {
    if (!canBallot) return;
    if (poll.allowMultiple) {
      setSelected((prev) =>
        prev.includes(optionId) ? prev.filter((x) => x !== optionId) : [...prev, optionId],
      );
    } else {
      void submitVote([optionId]);
    }
  }

  return (
    <Card>
      <TouchableOpacity activeOpacity={0.85} onPress={toggle}>
        <View style={styles.pollHeader}>
          <Text style={[type.heading, { flex: 1, marginEnd: spacing.sm }]}>{poll.title}</Text>
          <Pill
            label={isClosed ? t('polls_status_closed') : relativeDay(poll.closesAt)}
            tone={isClosed ? 'neutral' : 'accent'}
          />
        </View>
        {!!poll.description && (
          <Text style={[type.small, { marginTop: 4 }]}>{poll.description}</Text>
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={{ marginTop: spacing.md }}>
          {loading && !detail ? (
            <Text style={type.small}>{t('loading')}</Text>
          ) : (
            <>
              <View style={{ gap: spacing.sm }}>
                {poll.options.map((opt) => {
                  const chosen = myVote?.optionIds.includes(opt.id) ?? false;
                  const picked = selected.includes(opt.id);
                  const count = tallies?.[opt.id] ?? 0;
                  const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                  const active = chosen || picked;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      activeOpacity={canBallot ? 0.85 : 1}
                      disabled={!canBallot}
                      onPress={() => onOptionPress(opt.id)}
                      style={[styles.option, active && styles.optionActive]}
                    >
                      <View style={styles.optionRow}>
                        <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                          {opt.text}
                        </Text>
                        {chosen ? (
                          <Icon name="check" size={16} color={palette.accent} />
                        ) : null}
                        {tallies && <Text style={styles.tallyPct}>{pct}%</Text>}
                      </View>
                      {/* Result bar + share — the server returns tallies once
                          the viewer may see them (closed, admin, or already
                          voted), so presence of tallies is the only gate. */}
                      {tallies && (
                        <View style={styles.tallyRow}>
                          <View style={styles.tallyBar}>
                            <ProgressBar
                              value={count}
                              max={Math.max(totalVotes, 1)}
                              tone={chosen ? 'positive' : 'accent'}
                            />
                          </View>
                          <Text style={styles.tallyValue}>
                            {tf('polls_votes_count', { count })}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {tallies && (
                <Text style={[type.small, { marginTop: spacing.md }]}>
                  {totalVotes === 1 ? t('polls_votes_one') : tf('polls_votes_many', { count: totalVotes })}
                </Text>
              )}

              {canBallot && poll.allowMultiple && (
                <Button
                  label={t('submit')}
                  onPress={() => void submitVote(selected)}
                  disabled={selected.length === 0 || voting}
                  loading={voting}
                  style={{ marginTop: spacing.md }}
                />
              )}

              {hasVoted && !isClosed && (
                <View style={styles.votedBanner}>
                  <Text style={styles.votedText}>{t('polls_voted')}</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  pollHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  option: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: palette.surface,
  },
  optionActive: { borderColor: palette.accent, backgroundColor: palette.infoSoft },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionLabel: { flex: 1, color: palette.text, fontSize: 14, fontWeight: '500' },
  optionLabelActive: { color: palette.accent, fontWeight: '700' },
  tallyPct: { color: palette.accent, fontSize: 14, fontWeight: '800', marginStart: spacing.sm },
  tallyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 8 },
  tallyBar: { flex: 1 },
  // The count caps the row's logical end; align its digits toward the bar.
  tallyValue: {
    color: palette.textSubtle,
    fontSize: 12,
    fontWeight: '600',
    minWidth: 56,
    textAlign: I18nManager.isRTL ? 'left' : 'right',
  },
  readonlyBanner: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.infoSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  readonlyText: { color: palette.info, fontSize: 13 },
  votedBanner: {
    marginTop: spacing.md,
    backgroundColor: palette.successSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  votedText: { color: palette.success, fontWeight: '600' },
});
