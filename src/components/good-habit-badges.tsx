import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chevron } from '@/components/icon';
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
  return <View style={styles.card}>
    <View style={styles.top}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>GOOD HABITS</Text>
        <Text style={styles.name}>{badge.name}</Text>
      </View>
      {badges.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Show ${next.name} instead`} hitSlop={8} onPress={() => setChosenId(next.tracker.id)} style={styles.swap}>
        <Text style={styles.swapText} numberOfLines={2}>{next.name}</Text><Chevron size={14} color={colors.textMuted} />
      </Pressable>}
    </View>
    <NextBadgeRow badge={badge} />
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: 20 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { flex: 1, gap: 3 },
  eyebrow: { ...type.eyebrow, color: colors.habitsNav },
  name: { color: colors.text, fontSize: 18, fontFamily: font.bold },
  swap: { maxWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, paddingLeft: 10, paddingRight: 6, paddingVertical: 5 },
  swapText: { flexShrink: 1, color: colors.textMuted, fontSize: 12, fontFamily: font.semibold },
});
