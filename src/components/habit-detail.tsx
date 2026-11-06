import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecoveryChart } from '@/components/recovery-chart';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { TrackerBadgeShowcase } from '@/components/habit-milestone-showcase';
import { useNow } from '@/hooks/use-now';
import { formatLocalStartDateTime } from '@/lib/date-format';
import { habitCompletionSeries, habitConsistencyStreak, habitPeriodProgress } from '@/lib/habit';
import { habitCanLogToday, todayHabitCount } from '@/lib/habit-log';
import { localDateKey } from '@/lib/progress';
import { RollingRange, rollingBounds } from '@/lib/rolling-range';
import { trackerDisplayName } from '@/lib/tracker-management';
import { HistoricalEntry, Tracker } from '@/models/tracker';
import { HistoricalEntryInput } from '@/lib/history';
import { colors, layout, spacing, font } from '@/theme';

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
  const percent = Math.min(100, Math.round(progress.amount / Math.max(1, progress.goal) * 100));
  const today = localDateKey();
  const todayEntry = entries.find((entry) => entry.eventDate === today);
  const canLog = habitCanLogToday(tracker, entries, today);
  const logCompletion = () => { if (!canLog) return; saveEntry({
    id: todayEntry?.id,
    trackerId: tracker.id,
    eventDate: today,
    outcome: 'stayed_on_plan',
    value: todayHabitCount(entries, tracker.id, today) + 1,
    note: todayEntry?.note,
  }); };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroIcon, { backgroundColor: `${tracker.color}1F` }]}><Text style={[styles.heroIconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
        <Text style={styles.title}>{trackerDisplayName(tracker)}</Text>
        <Text style={styles.subtitle}>{tracker.frequencyCount} times per {tracker.frequencyPeriod}. Each completion fills your goal bar. An unfinished current period does not break your consistency streak.</Text>
        <Link href={{ pathname: '/tracker-form', params: { id: tracker.id } }} style={styles.editLink}>Edit tracker</Link>

        <View style={styles.goalPanel}>
          <Text style={styles.label}>CURRENT {progress.period.toUpperCase()}</Text>
          <View style={styles.goalRow}><Text style={styles.goalValue}>{progress.amount}</Text><Text style={styles.goalTarget}> / {progress.goal} completions</Text></View>
          {tracker.startedAt && <Text style={styles.started}>Habit started {formatLocalStartDateTime(tracker.startedAt)}</Text>}
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: tracker.color }]} /></View>
          <Text style={styles.progressCaption}>{`${percent}% of this ${progress.period}'s goal`}</Text>
          <Pressable accessibilityRole="button" disabled={!canLog} onPress={logCompletion} style={[styles.logButton, !canLog && { opacity: 0.55 }]}><Text style={styles.logButtonText}>+ Log completion</Text></Pressable>
        </View>

        <TrackerBadgeShowcase trackerId={tracker.id} />

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>CONSISTENCY STREAK</Text></View>
        </View>

        <View style={styles.chartPanel}>
          <Text style={styles.label}>RECENT COMPLETIONS</Text>
          <Text style={styles.chartTitle}>Completions logged each day</Text>
          <RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={range === 'ALL' ? allSeries[0]?.date ?? bounds.end : bounds.start} end={bounds.end} accent={tracker.color} />
          <RecoveryChart points={series} color={tracker.color} valueLabel="completions" emptyMessage="No completions logged in this range yet." />
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
  heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, heroIconText: { fontSize: 34, fontFamily: font.semibold }, title: { color: colors.text, fontSize: 30, fontFamily: font.bold, marginTop: 18 }, subtitle: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 450 }, editLink: { color: colors.habitsNav, backgroundColor: colors.surface, borderColor: colors.habitsNav, borderWidth: 1, borderRadius: 14, fontSize: 14, fontFamily: font.semibold, paddingHorizontal: 20, paddingVertical: 12, marginTop: 12, overflow: 'hidden', textAlign: 'center', minWidth: 140 },
  goalPanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 18, alignItems: 'center' }, label: { color: colors.textDim, fontSize: 11, letterSpacing: 1.2, fontFamily: font.semibold }, goalRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 7 }, goalValue: { color: colors.text, fontSize: 50, fontFamily: font.bold }, goalTarget: { color: colors.textMuted, fontSize: 13 , fontFamily: font.regular}, started: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 7 }, progressTrack: { alignSelf: 'stretch', height: 14, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden', marginTop: 22 }, progressFill: { height: '100%', borderRadius: 8 }, progressCaption: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 9 }, logButton: { backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13, marginTop: 18 }, logButtonText: { color: colors.background, fontSize: 12, fontFamily: font.semibold },
  stats: { width: '100%', flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, marginTop: 14, paddingVertical: 17 }, stat: { flex: 1, alignItems: 'center' }, statValue: { color: colors.text, fontSize: 23, fontFamily: font.semibold }, statLabel: { color: colors.textDim, fontSize: 11, letterSpacing: 1, fontFamily: font.semibold, marginTop: 5 }, divider: { width: 1, backgroundColor: colors.border },
  chartPanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 14 }, chartTitle: { color: colors.text, fontSize: 17, fontFamily: font.semibold, marginTop: 5, marginBottom: 8 }, actions: { width: '100%', marginTop: 14 }, historyLink: { color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, textAlign: 'center', fontSize: 12, fontFamily: font.bold, overflow: 'hidden' }, notes: { width: '100%', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 26, paddingTop: 18 }, notesText: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 19, marginTop: 8 }, footer: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, marginTop: 30 },
});
