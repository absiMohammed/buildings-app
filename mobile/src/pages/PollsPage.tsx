import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ACTIONS, EMPTY_CAPABILITIES, hasAction } from '../auth/capabilities';
import { palette, radii, shadow, spacing, type } from '../components/theme';
import { Card, Pill, ProgressBar, SectionHeader, Button } from '../components/ui';
import { relativeDay, type MockPoll } from '../mocks/fixtures';
import { useMockStore } from '../mocks/store';
import { NewPollModal } from '../components/NewPollModal';
import { useI18n } from '../i18n';

export function PollsPage() {
  const { user, capabilities: caps } = useAuth();
  const canCreate = hasAction(caps, ACTIONS.POLL_CREATE);
  const canVote = hasAction(caps, ACTIONS.POLL_VOTE);
  const { polls, createPoll, voteOnPoll } = useMockStore();
  const [createOpen, setCreateOpen] = useState(false);
  const { t, tf } = useI18n();

  const open = polls.filter((p) => p.status === 'open');
  const closed = polls.filter((p) => p.status === 'closed');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
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
          open.map((p) => <PollCard key={p._id} poll={p} onVote={(c) => voteOnPoll(p._id, c)} readonly={!canVote} />)
        )}
      </View>

      <SectionHeader title={t('polls_section_closed')} />
      <View style={{ gap: spacing.md }}>
        {closed.map((p) => (
          <PollCard key={p._id} poll={p} onVote={() => {}} readonly />
        ))}
      </View>

      <View style={{ height: spacing.xl }} />

      <NewPollModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(input) => {
          createPoll(input);
          setCreateOpen(false);
        }}
      />
    </ScrollView>
  );
}

function PollCard({ poll, onVote, readonly = false }: { poll: MockPoll; onVote: (choice: 'yes' | 'no') => void; readonly?: boolean }) {
  const { t, tf } = useI18n();
  const yesPct = poll.totalVotes > 0 ? Math.round((poll.yesVotes / poll.totalVotes) * 100) : 0;
  const noPct = poll.totalVotes > 0 ? 100 - yesPct : 0;

  return (
    <Card>
      <View style={styles.pollHeader}>
        <Text style={[type.heading, { flex: 1, marginEnd: spacing.sm }]}>{poll.title}</Text>
        <Pill
          label={poll.status === 'closed' ? t('polls_status_closed') : relativeDay(poll.closesAt)}
          tone={poll.status === 'closed' ? 'neutral' : 'accent'}
        />
      </View>
      <Text style={[type.small, { marginTop: 4 }]}>{poll.description}</Text>

      <View style={styles.tally}>
        <View style={styles.tallyRow}>
          <Text style={styles.tallyLabel}>{t('polls_yes')}</Text>
          <Text style={styles.tallyValue}>{poll.yesVotes} ({yesPct}%)</Text>
        </View>
        <ProgressBar value={poll.yesVotes} max={Math.max(poll.totalVotes, 1)} tone="positive" />

        <View style={[styles.tallyRow, { marginTop: spacing.sm }]}>
          <Text style={styles.tallyLabel}>{t('polls_no')}</Text>
          <Text style={styles.tallyValue}>{poll.noVotes} ({noPct}%)</Text>
        </View>
        <ProgressBar value={poll.noVotes} max={Math.max(poll.totalVotes, 1)} tone="danger" />
      </View>

      <Text style={[type.small, { marginTop: spacing.md }]}>
        {poll.totalVotes === 1 ? t('polls_votes_one') : tf('polls_votes_many', { count: poll.totalVotes })}
      </Text>

      {!readonly && (
        poll.hasVoted ? (
          <View style={styles.votedBanner}>
            <Text style={styles.votedText}>{t('polls_voted')}</Text>
          </View>
        ) : (
          <View style={styles.voteRow}>
            <Button label={t('polls_vote_no')} variant="secondary" style={{ flex: 1 }} onPress={() => onVote('no')} />
            <Button label={t('polls_vote_yes')} variant="primary" style={{ flex: 1 }} onPress={() => onVote('yes')} />
          </View>
        )
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  pollHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  tally: { marginTop: spacing.md, gap: 4 },
  tallyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  tallyLabel: { color: palette.textMuted, fontSize: 13, fontWeight: '500' },
  tallyValue: { color: palette.text, fontSize: 13, fontWeight: '600' },
  voteRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
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
