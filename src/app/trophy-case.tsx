import { Href, Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BADGE_ACCENTS, badgeImages, BadgeDatesModal } from '@/components/badge-art';
import { useTrophyCase } from '@/hooks/use-trophy-case';
import { HABIT_MILESTONES } from '@/lib/habit-milestones';
import { nextBadge, TrackerBadges, TrophyTab } from '@/lib/trophy-case';
import { colors, font, layout } from '@/theme';

const TABS: { id: TrophyTab; title: string }[] = [{ id: 'good', title: 'Good Habits' }, { id: 'quit', title: 'Quitting & Tapering' }];

export default function TrophyCaseScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { list } = useTrophyCase();
  const shown = list.map((badges) => ({ badges, next: nextBadge(badges), count: badges.awards.filter((award) => award.dates.length).length })).filter((item) => item.next || item.count);
  const [picked, setPicked] = useState<TrophyTab | null>(tabParam === 'good' || tabParam === 'quit' ? tabParam : null);
  const tab: TrophyTab = picked ?? (shown.some((item) => !item.badges.quit) || !shown.length ? 'good' : 'quit');
  // Closest to the next badge first; archived habits, which have no next badge, end up last.
  const items = shown.filter((item) => item.badges.quit === (tab === 'quit'))
    .sort((a, b) => Number(!!a.badges.tracker.archived) - Number(!!b.badges.tracker.archived) || (b.next?.progress ?? 0) - (a.next?.progress ?? 0));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.tabRow}>
      {TABS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => setPicked(item.id)} style={[styles.tab, tab === item.id && styles.tabActive]}><Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.title}</Text></Pressable>)}
    </View>
    {items.length > 0 ? <>
      <View style={styles.summary}>
        <Text style={styles.total}>{total}</Text>
        <View style={styles.summaryCopy}>
          <Text style={styles.totalLabel}>{total === 1 ? 'badge earned' : 'badges earned'}</Text>
          <Text style={styles.help}>Stick with it to unlock the next one. Earned badges stay yours, even after a slip.</Text>
        </View>
      </View>
      {items.map(({ badges }) => <HabitBadges key={badges.tracker.id} badges={badges} />)}
    </> : <View style={styles.card}>
      <Text style={styles.name}>Nothing to earn here yet</Text>
      <Text style={styles.help}>{tab === 'good' ? 'Add a good habit and set a goal, and your first badge is one day away.' : 'Start a quit timer, and your first badge is one day away.'}</Text>
      <Link href={(tab === 'good' ? '/good-habit-types' : '/tracker-form') as Href} style={styles.link}>{tab === 'good' ? '+ Add a good habit' : '+ Add a tracker'}</Link>
    </View>}
  </ScrollView></SafeAreaView>;
}

function HabitBadges({ badges }: { badges: TrackerBadges }) {
  const [selected, setSelected] = useState<number | null>(null);
  const next = nextBadge(badges);
  const images = badgeImages(badges.tracker);
  return <View style={styles.card}>
    <Text style={styles.name}>{badges.name}{badges.tracker.archived ? <Text style={styles.archived}>  Archived</Text> : null}</Text>
    {next && <>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(Math.round(next.progress * 100), 2)}%`, backgroundColor: BADGE_ACCENTS[next.index] }]} /></View>
      <Text style={styles.line}>{next.line}</Text>
    </>}
    <View style={styles.grid}>
      {HABIT_MILESTONES.map((milestone, index) => {
        const times = badges.awards[index]?.dates.length ?? 0;
        return <Pressable key={milestone.days} accessibilityRole="button" accessibilityLabel={`${milestone.label}, ${times ? `earned ${times} ${times === 1 ? 'time' : 'times'}` : 'not earned yet'}. View details.`} onPress={() => setSelected(index)} style={styles.tile}>
          <Image source={images[index]} resizeMode="contain" style={[styles.image, !times && styles.locked]} accessible={false} />
          <Text style={[styles.label, times > 0 && { color: BADGE_ACCENTS[index] }]}>{milestone.label}</Text>
          <Text style={styles.times}>{times > 1 ? `×${times}` : times ? 'Earned' : 'Locked'}</Text>
        </Pressable>;
      })}
    </View>
    <BadgeDatesModal index={selected} award={selected === null ? undefined : badges.awards[selected]} images={images} onClose={() => setSelected(null)} />
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: 16, gap: 14 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  summaryCopy: { flex: 1, gap: 2 },
  total: { color: colors.accent, fontSize: 48, fontFamily: font.extrabold },
  totalLabel: { color: colors.text, fontSize: 17, fontFamily: font.bold },
  help: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: font.regular },
  tabRow: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8 },
  tabActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong },
  tabText: { color: colors.textMuted, fontSize: 12, fontFamily: font.bold, textAlign: 'center' },
  tabTextActive: { color: colors.text, fontFamily: font.semibold },
  archived: { color: colors.textMuted, fontSize: 13, fontFamily: font.medium },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: 16, gap: 8 },
  name: { color: colors.text, fontSize: 18, fontFamily: font.bold },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  line: { color: colors.textMuted, fontSize: 13, fontFamily: font.medium },
  link: { color: colors.accent, fontSize: 15, fontFamily: font.bold, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, rowGap: 12 },
  tile: { width: '33.33%', alignItems: 'center' },
  image: { width: 76, height: 84 },
  locked: { opacity: 0.25 },
  label: { color: colors.textMuted, fontSize: 13, fontFamily: font.bold, marginTop: 2 },
  times: { color: colors.textDim, fontSize: 11, fontFamily: font.medium, marginTop: 1 },
});
