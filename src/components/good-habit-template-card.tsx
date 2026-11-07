import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GoodHabitIcon } from './good-habit-icon';
import { exerciseModeOn, habitProgress, habitStreak, templateConfig } from '@/lib/good-habit-templates';
import { localDateKey } from '@/lib/progress';
import { ActivityRoute, GoodHabitLog, Tracker } from '@/models/tracker';
import { colors, layout, spacing, font } from '@/theme';
import { Chevron } from '@/components/icon';

export function GoodHabitTemplateCard({ tracker, logs, routes }: { tracker: Tracker; logs: GoodHabitLog[]; routes: ActivityRoute[] }) {
  const config = templateConfig(tracker.habitTemplate);
  if (!config || !tracker.habitTemplate) return null;
  const progress = habitProgress(tracker, logs, routes);
  const unit = tracker.habitTemplate === 'exercise' ? exerciseModeOn(tracker, localDateKey()) === 'minutes' ? 'minutes' : 'workouts' : config.unit;
  return <Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id } }} asChild><Pressable accessibilityRole="button" style={styles.card}>
    <View style={styles.row}><GoodHabitIcon type={tracker.habitTemplate} size={58} /><View style={styles.copy}><Text style={styles.name}>{tracker.name}</Text><Text style={styles.meta}>{progress.amount % 1 ? progress.amount.toFixed(1) : progress.amount} / {progress.goal} {unit} · this {config.period}</Text></View><Chevron color={colors.textMuted} /></View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percent }} style={styles.track}><View style={[styles.fill, { width: `${progress.percent}%` }]} /></View><Text style={styles.meta}>{progress.percent}% · {habitStreak(tracker, logs, routes)} {config.period === 'week' ? 'weeks' : 'days'} consistent · Tap to review</Text>
  </Pressable></Link>;
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, gap: 10 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1 }, name: { color: colors.text, fontSize: 17, fontFamily: font.semibold }, meta: { color: colors.textMuted, fontSize: 12 , fontFamily: font.regular}, chevron: { color: colors.habitsNav, fontSize: 25 , fontFamily: font.regular}, track: { height: 12, backgroundColor: colors.border, borderRadius: 8, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.habitsNav },
});
