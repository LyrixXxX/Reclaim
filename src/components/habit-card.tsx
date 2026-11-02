import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { habitConsistencyStreak, habitPeriodProgress } from '@/lib/habit';
import { habitCanLogToday, todayHabitCount } from '@/lib/habit-log';
import { localDateKey } from '@/lib/progress';
import { trackerDisplayName } from '@/lib/tracker-management';
import { HistoricalEntry, Tracker } from '@/models/tracker';
import { colors, layout, spacing } from '@/theme';

export function HabitCard({ tracker, entries, onLog }: { tracker: Tracker; entries: HistoricalEntry[]; onLog: () => void }) {
  const progress = habitPeriodProgress(tracker, entries);
  const streak = habitConsistencyStreak(tracker, entries);
  const percent = Math.min(100, Math.round((progress.amount / Math.max(1, progress.goal)) * 100));
  const today = localDateKey();
  const canLog = habitCanLogToday(tracker, entries, today);
  return (
    <View style={styles.card}>
    <Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id } }} asChild>
      <Pressable style={({ pressed }) => pressed && styles.pressed}>
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}><Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
          <View style={styles.copy}><Text style={styles.name}>{trackerDisplayName(tracker)}</Text><Text style={styles.goal}>{tracker.frequencyCount}× per {tracker.frequencyPeriod}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </View>
        <View style={styles.stats}>
          <View><Text style={styles.label}>THIS {progress.period.toUpperCase()}</Text><Text style={styles.value}>{progress.amount}<Text style={styles.valueMuted}> / {progress.goal}</Text></Text></View>
          <View><Text style={styles.label}>CONSISTENCY</Text><Text style={styles.value}>{streak}<Text style={styles.valueMuted}> periods</Text></Text></View>
        </View>
        <View style={styles.track}><View style={[styles.fill, { width: `${percent}%`, backgroundColor: tracker.color }]} /></View>
      </Pressable>
    </Link>
    <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${tracker.name} completion`} disabled={!canLog} onPress={onLog} style={[styles.logButton, !canLog && styles.logDisabled]}><Text style={styles.logText}>{`+ Log completion · ${todayHabitCount(entries, tracker.id, today)} today`}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: layout.radius, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }, pressed: { opacity: 0.86 },
  logButton: { minHeight: 48, marginTop: 16, borderRadius: 12, backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center' }, logDisabled: { opacity: 0.6 }, logText: { color: colors.habitsNav, fontSize: 14, fontWeight: '600' },
  top: { flexDirection: 'row', alignItems: 'center' }, icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, iconText: { fontSize: 20, fontWeight: '600' }, copy: { flex: 1 }, name: { color: colors.text, fontSize: 16, fontWeight: '600' }, goal: { color: colors.textDim, fontSize: 11, marginTop: 4 }, chevron: { color: colors.textDim, fontSize: 28 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 }, label: { color: colors.textDim, fontSize: 11, letterSpacing: 1, fontWeight: '600' }, value: { color: colors.text, fontSize: 19, fontWeight: '600', marginTop: 5 }, valueMuted: { color: colors.textMuted, fontSize: 11, fontWeight: '600' }, track: { height: 5, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden', marginTop: 18 }, fill: { height: '100%', borderRadius: 5 },
});
