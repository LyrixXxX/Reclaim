import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Href, router } from 'expo-router';

import { CravingEvent, SavingsGoal } from '@/models/tracker';
import { formatSavings } from '@/lib/habit-savings';
import { activeSavingsGoal, checkpointLabel, cravingsBeaten, featuredQuit, QuitStart, quitSummary, totalQuitSavings } from '@/lib/quit-progress';
import { trackerDisplayName } from '@/lib/tracker-management';
import { Chevron } from '@/components/icon';
import { colors, font, radius, type } from '@/theme';

/** Home's lead card: the featured quit, how far it has come, and a way to get through a craving. */
export function QuitHero({ starts, featuredId, cravings, goals, now, onFeature }: { starts: QuitStart[]; featuredId?: string; cravings: CravingEvent[]; goals: SavingsGoal[]; now: number; onFeature: (id: string) => void }) {
  const featured = featuredQuit(starts, featuredId);
  if (!featured?.startedAt) return null;
  const { tracker } = featured;
  const summary = quitSummary(tracker, featured.startedAt, featured.precision, now);
  const beaten = cravingsBeaten(cravings, tracker.id);
  const goal = activeSavingsGoal(goals, totalQuitSavings(starts, now));
  const running = starts.filter((item) => item.startedAt);
  const next = running[(running.findIndex((item) => item.tracker.id === tracker.id) + 1) % running.length];
  const name = trackerDisplayName(tracker);

  return <View style={[styles.card, { borderColor: `${tracker.color}40` }]}>
    <View style={styles.top}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}`} onPress={() => router.push(`/tracker/${encodeURIComponent(tracker.id)}` as Href)} style={styles.identity}>
        <View style={[styles.icon, { backgroundColor: `${tracker.color}22` }]}><Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
        <Text style={[styles.eyebrow, { color: tracker.color }]} numberOfLines={1}>{name.toUpperCase()}-FREE</Text>
      </Pressable>
      {running.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Show ${trackerDisplayName(next.tracker)} instead`} hitSlop={8} onPress={() => onFeature(next.tracker.id)} style={styles.swap}>
        <Text style={styles.swapText}>{trackerDisplayName(next.tracker)}</Text><Chevron size={14} color={colors.textMuted} />
      </Pressable>}
    </View>

    <View style={styles.daysRow}>
      <Text style={styles.days} accessibilityLabel={`${summary.days} days`}>{summary.days.toLocaleString()}</Text>
      <Text style={styles.daysLabel}>{summary.days === 1 ? 'day' : 'days'}</Text>
    </View>

    <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, summary.checkpointProgress * 100)}%`, backgroundColor: tracker.color }]} /></View>
    <Text style={styles.meta}>Next milestone: <Text style={styles.metaStrong}>{checkpointLabel(summary.nextDays)}</Text> · {summary.daysToNext.toLocaleString()} {summary.daysToNext === 1 ? 'day' : 'days'} to go</Text>

    {(summary.savingsCents > 0 || beaten > 0 || goal) && <View style={styles.stats}>
      {summary.savingsCents > 0 && <Text style={[styles.stat, { color: colors.success }]}>{formatSavings(summary.savingsCents)} saved</Text>}
      {beaten > 0 && <Text style={styles.stat}>{beaten} {beaten === 1 ? 'craving' : 'cravings'} beaten</Text>}
      {goal && <Text style={styles.stat}>{goal.remainingCents > 0 ? `${Math.round(goal.progress * 100)}% to ${goal.goal.name}` : `${goal.goal.name}: reached`}</Text>}
    </View>}

    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/craving', params: { tracker: tracker.id } } as unknown as Href)} style={({ pressed }) => [styles.craving, pressed && { opacity: 0.85 }]}>
      <Text style={styles.cravingText}>Having a craving?</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, padding: 20, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 15, fontFamily: font.bold },
  eyebrow: { ...type.eyebrow, flexShrink: 1 },
  swap: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, paddingLeft: 10, paddingRight: 6, paddingVertical: 5 },
  swapText: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold },
  daysRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 },
  days: { color: colors.text, fontSize: 64, lineHeight: 70, letterSpacing: -2.5, fontFamily: font.extrabold, fontVariant: ['tabular-nums'] },
  daysLabel: { color: colors.textMuted, fontSize: 18, fontFamily: font.semibold },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, marginTop: 12, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  meta: { ...type.metadata, color: colors.textMuted, fontFamily: font.medium, marginTop: 8 },
  metaStrong: { color: colors.text, fontFamily: font.bold },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  stat: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  craving: { marginTop: 18, minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: `${colors.habitsNav}66`, backgroundColor: `${colors.habitsNav}14`, alignItems: 'center', justifyContent: 'center' },
  cravingText: { color: colors.habitsNav, fontSize: 15, fontFamily: font.bold },
});
