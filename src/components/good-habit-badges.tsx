import { Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chevron, Icon } from '@/components/icon';
import { NextBadgeRow } from '@/components/next-badge-row';
import { goodHabitNextBadges, TrackerBadges } from '@/lib/trophy-case';
import { colors, font, radius, type } from '@/theme';

/** The next badge for one good habit at a time, starting with the closest. Switching doesn't change any habit. */
export function GoodHabitBadges({ list, hiddenIds }: { list: readonly TrackerBadges[]; hiddenIds: readonly string[] }) {
  const badges = goodHabitNextBadges(list, hiddenIds);
  const [chosenId, setChosenId] = useState<string>();
  if (!badges.length) return null;
  const badge = badges.find((item) => item.tracker.id === chosenId) ?? badges[0];
  const next = badges[(badges.indexOf(badge) + 1) % badges.length];
  // The whole card opens Habits; the name, switch and badge inside keep their own jobs.
  const openHabits = () => router.navigate(`/habits?view=good&at=${Date.now()}` as Href);
  return <Pressable accessible={false} onPress={openHabits} style={styles.card}>
    <View style={styles.top}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${badge.name}`} onPress={() => router.push(`/tracker/${encodeURIComponent(badge.tracker.id)}` as Href)} style={styles.heading}>
        <Text style={styles.eyebrow}>GOOD HABITS</Text>
        <Text style={styles.name}>{badge.name}</Text>
      </Pressable>
      {badges.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Show ${next.name} instead`} hitSlop={8} onPress={() => setChosenId(next.tracker.id)} style={styles.swap}>
        <Icon name="swap" size={13} color={colors.textMuted} /><Text style={styles.swapText} numberOfLines={2}>{next.name}</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Open Habits, Good Habits" hitSlop={10} onPress={openHabits}><Chevron color={colors.textMuted} /></Pressable>
    </View>
    <NextBadgeRow badge={badge} />
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: 20 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { flex: 1, gap: 3 },
  eyebrow: { ...type.eyebrow, color: colors.habitsNav },
  name: { color: colors.text, fontSize: 18, fontFamily: font.bold },
  swap: { maxWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, paddingHorizontal: 10, paddingVertical: 5 },
  swapText: { flexShrink: 1, color: colors.textMuted, fontSize: 12, fontFamily: font.semibold },
});
