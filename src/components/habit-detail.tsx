import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecoveryChart } from '@/components/recovery-chart';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { HabitMilestoneShowcase } from '@/components/habit-milestone-showcase';
import { DurationProgress } from '@/components/duration-progress';
import { useNow } from '@/hooks/use-now';
import { formatLocalStartDateTime } from '@/lib/date-format';
import { habitCompletionSeries, habitConsistencyStreak, habitPeriodProgress } from '@/lib/habit';
import { habitMilestones } from '@/lib/habit-milestones';
import { localDateKey } from '@/lib/progress';
import { RollingRange, rollingBounds } from '@/lib/rolling-range';
import { trackerDisplayName } from '@/lib/tracker-management';
import { HistoricalEntry, Tracker } from '@/models/tracker';
import { HistoricalEntryInput } from '@/lib/history';
import { colors, layout, spacing } from '@/theme';

export function HabitDetail({
  tracker,
  entries,
  saveEntry,
}: {
  tracker: Tracker;
  entries: HistoricalEntry[];
  saveEntry: (entry: HistoricalEntryInput) => void;
}) {
  const now = useNow();
  const [range, setRange] = useState<RollingRange>('30D');
  const [offset, setOffset] = useState(0);
  const progress = habitPeriodProgress(tracker, entries);
  const streak = habitConsistencyStreak(tracker, entries);
  const allSeries = tracker.startedAt ? habitCompletionSeries(tracker.startedAt, entries, new Date(now)) : [];
  const bounds = rollingBounds(range, offset, new Date(now));
  const series = allSeries.filter((point) => point.date >= bounds.start && point.date <= bounds.end);
  const total = allSeries.at(-1)?.cumulative ?? 0;
  const today = localDateKey();
  const todayEntry = entries.find((entry) => entry.eventDate === today);
  const logCompletion = () => saveEntry({
    id: todayEntry?.id,
    trackerId: tracker.id,
    eventDate: today,
    outcome: 'stayed_on_plan',
    value: (todayEntry?.value ?? 0) + 1,
    note: todayEntry?.note,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroIcon, { backgroundColor: `${tracker.color}1F` }]}><Text style={[styles.heroIconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
        <Text style={styles.title}>{trackerDisplayName(tracker)}</Text>
        <Text style={styles.subtitle}>{tracker.frequencyCount} times per {tracker.frequencyPeriod}. Missing a period pauses consistency without erasing cumulative progress.</Text>
        <Link href={{ pathname: '/tracker-form', params: { id: tracker.id } }} style={styles.editLink}>Edit tracker</Link>

        <View style={styles.goalPanel}>
          <Text style={styles.label}>CURRENT {progress.period.toUpperCase()}</Text>
          <View style={styles.goalRow}><Text style={styles.goalValue}>{progress.amount}</Text><Text style={styles.goalTarget}> / {progress.goal} completions</Text></View>
          {tracker.startedAt && <Text style={styles.started}>Habit started {formatLocalStartDateTime(tracker.startedAt)}</Text>}
          {tracker.startedAt && <DurationProgress startedAt={tracker.startedAt} now={now} color={tracker.color} />}
          <Pressable accessibilityRole="button" onPress={logCompletion} style={styles.logButton}><Text style={styles.logButtonText}>+ Log completion</Text></Pressable>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>CONSISTENCY STREAK</Text></View>
          <View style={styles.divider} />
          <View style={styles.stat}><Text style={styles.statValue}>{total}</Text><Text style={styles.statLabel}>TOTAL COMPLETIONS</Text></View>
        </View>

        <HabitMilestoneShowcase awards={habitMilestones(tracker, entries, tracker.startedAt, new Date(now))} />

        <View style={styles.chartPanel}>
          <Text style={styles.label}>SUCCESSFUL COMPLETION CHART</Text>
          <Text style={styles.chartTitle}>Progress keeps accumulating</Text>
          <RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={range === 'ALL' ? allSeries[0]?.date ?? bounds.end : bounds.start} end={bounds.end} accent={tracker.color} />
          <RecoveryChart points={series} color={tracker.color} valueLabel="completions" />
        </View>

        <View style={styles.actions}>
          <Link href={{ pathname: '/history', params: { id: tracker.id } }} style={styles.historyLink}>Open completion history</Link>
        </View>
        {tracker.notes && <View style={styles.notes}><Text style={styles.label}>PRIVATE NOTES</Text><Text style={styles.notesText}>{tracker.notes}</Text></View>}
        <Text style={styles.footer}>No account · No cloud sync · No medical guidance</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, alignItems: 'center', paddingBottom: 40 },
  heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, heroIconText: { fontSize: 34, fontWeight: '800' }, title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 18 }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 450 }, editLink: { color: colors.habitsNav, backgroundColor: colors.surface, borderColor: colors.habitsNav, borderWidth: 1, borderRadius: 14, fontSize: 14, fontWeight: '800', paddingHorizontal: 20, paddingVertical: 12, marginTop: 12, overflow: 'hidden', textAlign: 'center', minWidth: 140 },
  goalPanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 18, alignItems: 'center' }, label: { color: colors.textDim, fontSize: 9, letterSpacing: 1.2, fontWeight: '800' }, goalRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 7 }, goalValue: { color: colors.text, fontSize: 50, fontWeight: '900' }, goalTarget: { color: colors.textMuted, fontSize: 13 }, started: { color: colors.textMuted, fontSize: 10, marginTop: 7 }, logButton: { backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13, marginTop: 18 }, logButtonText: { color: colors.background, fontSize: 12, fontWeight: '800' },
  stats: { width: '100%', flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, marginTop: 14, paddingVertical: 17 }, stat: { flex: 1, alignItems: 'center' }, statValue: { color: colors.text, fontSize: 23, fontWeight: '800' }, statLabel: { color: colors.textDim, fontSize: 8, letterSpacing: 1, fontWeight: '800', marginTop: 5 }, divider: { width: 1, backgroundColor: colors.border },
  chartPanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 14 }, chartTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 5, marginBottom: 8 }, actions: { width: '100%', marginTop: 14 }, historyLink: { color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, textAlign: 'center', fontSize: 12, fontWeight: '700', overflow: 'hidden' }, notes: { width: '100%', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 26, paddingTop: 18 }, notesText: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 8 }, footer: { color: colors.textDim, fontSize: 10, marginTop: 30 },
});
