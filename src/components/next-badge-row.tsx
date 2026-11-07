import { Href, router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { BADGE_ACCENTS, badgeImages } from '@/components/badge-art';
import { Chevron } from '@/components/icon';
import { NextBadge, trophyCaseHref } from '@/lib/trophy-case';
import { colors, font, radius } from '@/theme';

/** The next badge for whichever habit or quit a card is showing. Opens the trophy case. */
export function NextBadgeRow({ badge }: { badge: NextBadge }) {
  const percent = Math.round(badge.progress * 100);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Next badge: ${badge.label}. ${badge.line}. Open trophy case`} onPress={() => router.push(trophyCaseHref(badge.tracker) as Href)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
    <Image source={badgeImages(badge.tracker)[badge.index]} resizeMode="contain" style={styles.badge} accessible={false} />
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>NEXT BADGE</Text>
      <Text style={styles.title}>{badge.label}</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, percent)}%`, backgroundColor: BADGE_ACCENTS[badge.index] }]} /></View>
      <Text style={styles.line}>{badge.line}</Text>
    </View>
    <Chevron size={18} color={colors.textMuted} />
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  badge: { width: 56, height: 62, opacity: 0.7 },
  copy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, letterSpacing: 1 },
  title: { color: colors.text, fontSize: 15, fontFamily: font.bold },
  line: { color: colors.textMuted, fontSize: 12, fontFamily: font.medium },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 2 },
  fill: { height: 6, borderRadius: 3 },
});
