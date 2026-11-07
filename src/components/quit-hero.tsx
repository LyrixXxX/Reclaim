import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Href, router } from 'expo-router';

import { CravingEvent, SavingsGoal } from '@/models/tracker';
import { formatSavings } from '@/lib/habit-savings';
import { NextBadgeRow } from '@/components/next-badge-row';
import { activeSavingsGoal, cravingsBeaten, QuitStart, quitSummary, TaperStart, totalQuitSavings } from '@/lib/quit-progress';
import { nextBadge, TrackerBadges } from '@/lib/trophy-case';
import { trackerDisplayName } from '@/lib/tracker-management';
import { Chevron, Icon } from '@/components/icon';
import { colors, font, radius, type } from '@/theme';

/** Home's lead card: whichever quit or taper is showing, how far it has come, its next badge and a way through a craving. */
export function QuitHero({ starts, tapers = [], badges = [], featuredId, cravings, goals, now, onFeature }: { starts: QuitStart[]; tapers?: TaperStart[]; badges?: readonly TrackerBadges[]; featuredId?: string; cravings: CravingEvent[]; goals: SavingsGoal[]; now: number; onFeature: (id: string) => void }) {
  const running = starts.filter((item) => item.startedAt);
  const items = [...running.map((item) => item.tracker), ...tapers.map((item) => item.tracker)];
  const tracker = items.find((item) => item.id === featuredId) ?? items[0];
  if (!tracker) return null;
  const quit = running.find((item) => item.tracker.id === tracker.id);
  const taper = tapers.find((item) => item.tracker.id === tracker.id);
  const next = items[(items.indexOf(tracker) + 1) % items.length];
  const name = trackerDisplayName(tracker);
  const summary = quit ? quitSummary(tracker, quit.startedAt!, quit.precision, now) : null;
  const taperStarted = taper?.startedAt ? Date.parse(taper.startedAt) : NaN;
  const taperDays = Number.isFinite(taperStarted) && taperStarted <= now ? Math.floor((now - taperStarted) / 86_400_000) : null;
  const days = summary ? summary.days : taperDays;
  const showing = badges.find((item) => item.tracker.id === tracker.id);
  const badge = quit && showing ? nextBadge(showing) : null;
  const beaten = cravingsBeaten(cravings, tracker.id);
  const goal = activeSavingsGoal(goals, totalQuitSavings(starts, now));

  // The whole card opens Habits; the name, switch, badge and craving buttons inside keep their own jobs.
  const openHabits = () => router.navigate(`/habits?view=quit&at=${Date.now()}` as Href);
  return <Pressable accessible={false} onPress={openHabits} style={[styles.card, { borderColor: `${tracker.color}40` }]}>
    <View style={styles.top}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}`} onPress={() => router.push(`/tracker/${encodeURIComponent(tracker.id)}` as Href)} style={styles.identity}>
        <View style={[styles.icon, { backgroundColor: `${tracker.color}22` }]}><Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
        <Text style={[styles.eyebrow, { color: tracker.color }]} >{name.toUpperCase()}{quit ? '-FREE' : ' · TAPERING'}</Text>
      </Pressable>
      {items.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Show ${trackerDisplayName(next)} instead`} hitSlop={8} onPress={() => onFeature(next.id)} style={styles.swap}>
        <Icon name="swap" size={13} color={colors.textMuted} /><Text style={styles.swapText} numberOfLines={2}>{trackerDisplayName(next)}</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Open Habits, Quitting and Tapering" hitSlop={10} onPress={openHabits}><Chevron color={colors.textMuted} /></Pressable>
    </View>

    {days !== null && <View style={styles.daysRow}>
      <Text style={styles.days} accessibilityLabel={`${days} days`}>{days.toLocaleString()}</Text>
      <Text style={styles.daysLabel}>{days === 1 ? 'day' : 'days'}{quit ? '' : ' at this level'}</Text>
    </View>}
    {taper && taper.amount !== undefined && <Text style={styles.meta}>Current level: <Text style={styles.metaStrong}>{taper.amount} {taper.unit}</Text></Text>}

    {badge && <NextBadgeRow badge={badge} />}

    {((summary && summary.savingsCents > 0) || beaten > 0 || (quit && goal)) && <View style={styles.stats}>
      {summary && summary.savingsCents > 0 && <Text style={[styles.stat, { color: colors.success }]}>{formatSavings(summary.savingsCents)} saved</Text>}
      {beaten > 0 && <Text style={styles.stat}>{beaten} {beaten === 1 ? 'craving' : 'cravings'} beaten</Text>}
      {quit && goal && <Text style={styles.stat}>{goal.remainingCents > 0 ? `${Math.round(goal.progress * 100)}% to ${goal.goal.name}` : `${goal.goal.name}: reached`}</Text>}
    </View>}

    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/craving', params: { tracker: tracker.id } } as unknown as Href)} style={({ pressed }) => [styles.craving, pressed && { opacity: 0.85 }]}>
      <Text style={styles.cravingText}>Having a craving?</Text>
    </Pressable>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, padding: 20, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 15, fontFamily: font.bold },
  eyebrow: { ...type.eyebrow, flexShrink: 1 },
  swap: { maxWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, paddingHorizontal: 10, paddingVertical: 5 },
  swapText: { flexShrink: 1, color: colors.textMuted, fontSize: 12, fontFamily: font.semibold },
  daysRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 },
  days: { color: colors.text, fontSize: 64, lineHeight: 70, letterSpacing: -2.5, fontFamily: font.extrabold, fontVariant: ['tabular-nums'] },
  daysLabel: { color: colors.textMuted, fontSize: 18, fontFamily: font.semibold },
  meta: { ...type.metadata, color: colors.textMuted, fontFamily: font.medium, marginTop: 8 },
  metaStrong: { color: colors.text, fontFamily: font.bold },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  stat: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  craving: { marginTop: 18, minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: `${colors.habitsNav}66`, backgroundColor: `${colors.habitsNav}14`, alignItems: 'center', justifyContent: 'center' },
  cravingText: { color: colors.habitsNav, fontSize: 15, fontFamily: font.bold },
});
