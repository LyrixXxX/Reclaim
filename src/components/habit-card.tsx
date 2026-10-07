import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { habitConsistencyStreak, habitPeriodProgress } from '@/lib/habit';
import { trackerDisplayName } from '@/lib/tracker-management';
import { HistoricalEntry, Tracker } from '@/models/tracker';
import { colors, layout, spacing } from '@/theme';

export function HabitCard({ tracker, entries }: { tracker: Tracker; entries: HistoricalEntry[] }) {
  const progress = habitPeriodProgress(tracker, entries);
  const streak = habitConsistencyStreak(tracker, entries);
  const total = entries.reduce((sum, entry) => sum + (entry.outcome === 'stayed_on_plan' ? entry.value ?? 1 : 0), 0);
  const percent = Math.min(100, Math.round((progress.amount / Math.max(1, progress.goal)) * 100));
  return (
    <Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}><Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
          <View style={styles.copy}><Text style={styles.name}>{trackerDisplayName(tracker)}</Text><Text style={styles.goal}>{tracker.frequencyCount}× per {tracker.frequencyPeriod}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </View>
        <View style={styles.stats}>
          <View><Text style={styles.label}>THIS {progress.period.toUpperCase()}</Text><Text style={styles.value}>{progress.amount}<Text style={styles.valueMuted}> / {progress.goal}</Text></Text></View>
          <View><Text style={styles.label}>CONSISTENCY</Text><Text style={styles.value}>{streak}<Text style={styles.valueMuted}> periods</Text></Text></View>
          <View><Text style={styles.label}>ALL TIME</Text><Text style={styles.value}>{total}</Text></View>
        </View>
        <View style={styles.track}><View style={[styles.fill, { width: `${percent}%`, backgroundColor: tracker.color }]} /></View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: layout.radius, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }, pressed: { opacity: 0.86 },
  top: { flexDirection: 'row', alignItems: 'center' }, icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, iconText: { fontSize: 20, fontWeight: '800' }, copy: { flex: 1 }, name: { color: colors.text, fontSize: 16, fontWeight: '800' }, goal: { color: colors.textDim, fontSize: 10, marginTop: 4 }, chevron: { color: colors.textDim, fontSize: 28 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 }, label: { color: colors.textDim, fontSize: 8, letterSpacing: 1, fontWeight: '800' }, value: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 5 }, valueMuted: { color: colors.textMuted, fontSize: 10, fontWeight: '600' }, track: { height: 5, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden', marginTop: 18 }, fill: { height: '100%', borderRadius: 5 },
});
