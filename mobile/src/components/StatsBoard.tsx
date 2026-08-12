import { StyleSheet, Text, View } from 'react-native';
import { Card, IconCircle, ProgressBar } from './ui';
import type { IconName } from './Icon';
import { palette, spacing, type } from './theme';

export interface StatsBoardRow {
  id: string;
  icon: IconName;
  tone: 'accent' | 'positive' | 'warning' | 'danger' | 'neutral';
  label: string;
  value: string;
  caption?: string;
}

/**
 * The dashboard's "بالأرقام" numbers card: a titled 2-column grid of stat
 * rows (icon bubble · label · big value · muted caption) with an optional
 * progress line at the bottom — everything visible at once, no horizontal
 * scrolling.
 */
export function StatsBoard({
  title,
  rows,
  progress,
}: {
  title: string;
  rows: StatsBoardRow[];
  progress?: { label: string; value: number; max: number; display: string };
}) {
  if (rows.length === 0 && !progress) return null;
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <IconCircle iconName="trend" tone="accent" size={36} />
        <Text style={[type.body, styles.title]}>{title}</Text>
      </View>
      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row.id} style={styles.cell}>
            <View style={styles.cellHeader}>
              <IconCircle iconName={row.icon} tone={row.tone} size={30} />
              <Text style={styles.cellLabel} numberOfLines={1}>{row.label}</Text>
            </View>
            <Text style={styles.cellValue} numberOfLines={1}>{row.value}</Text>
            {row.caption ? (
              <Text style={styles.cellCaption} numberOfLines={1}>{row.caption}</Text>
            ) : null}
          </View>
        ))}
      </View>
      {progress && (
        <View style={styles.progressWrap}>
          <View style={styles.progressHeader}>
            <Text style={styles.cellLabel}>{progress.label}</Text>
            <Text style={styles.progressValue}>{progress.display}</Text>
          </View>
          <ProgressBar value={progress.value} max={progress.max} tone="positive" />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  title: { fontWeight: '700', flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Two columns; vertical rhythm via bottom margin rather than `gap` so the
  // 50% widths never overflow the row.
  cell: { width: '50%', marginBottom: spacing.lg, paddingEnd: spacing.md },
  cellHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cellLabel: { fontSize: 12, color: palette.textMuted, fontWeight: '600', flexShrink: 1 },
  cellValue: { fontSize: 20, fontWeight: '800', color: palette.text, marginTop: 6 },
  cellCaption: { fontSize: 11, color: palette.textSubtle, marginTop: 2 },
  progressWrap: { marginTop: -spacing.xs },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressValue: { fontSize: 14, fontWeight: '800', color: palette.success },
});
