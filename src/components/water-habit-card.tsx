import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tracker, WaterLog } from '@/models/tracker';
import { waterDisplayAmount, waterProgress, waterStreak } from '@/lib/water-habit';
import { colors, layout, spacing } from '@/theme';
import { GoodHabitIcon } from './good-habit-icon';

export function WaterHabitCard({ tracker, logs, onLog }: { tracker: Tracker; logs: WaterLog[]; onLog: () => void }) {
  const progress = waterProgress(tracker, logs);
  const unit = tracker.waterDisplayUnit ?? 'fl oz';
  return <View style={styles.card}>
    <Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id } }} asChild><Pressable accessibilityRole="button" style={styles.main}>
      <GoodHabitIcon type="water" size={58} /><View style={styles.copy}><Text style={styles.name}>{tracker.displayName || tracker.name}</Text><Text style={styles.meta}>Today · {waterDisplayAmount(progress.amount, unit)} / {progress.goal === null ? '—' : waterDisplayAmount(progress.goal, unit)} {unit}</Text></View><Text style={styles.chevron}>›</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percent }} style={styles.track}><View style={[styles.fill, { width: `${progress.percent}%` }]} /></View>
      <Text style={styles.meta}>{progress.percent}% of daily goal · {waterStreak(tracker, logs)}-day consistency streak</Text>
    </Pressable></Link>
    <Pressable accessibilityRole="button" accessibilityLabel={`Add ${waterDisplayAmount(tracker.waterQuickAddOz ?? 8, unit)} ${unit} of water`} onPress={onLog} style={styles.button}><Text style={styles.buttonText}>+ {waterDisplayAmount(tracker.waterQuickAddOz ?? 8, unit)} {unit}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius },
  main: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, icon: { fontSize: 26 }, copy: { flex: 1 }, name: { color: colors.text, fontSize: 17, fontWeight: '600' }, meta: { color: colors.textMuted, fontSize: 12, marginTop: 4 }, chevron: { color: colors.habitsNav, fontSize: 25 },
  track: { width: '100%', height: 12, backgroundColor: colors.border, borderRadius: 8, overflow: 'hidden', marginTop: 12 }, fill: { height: '100%', backgroundColor: colors.habitsNav, borderRadius: 8 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 16, backgroundColor: colors.accentSoft }, buttonText: { color: colors.habitsNav, fontWeight: '600', fontSize: 15 },
});
