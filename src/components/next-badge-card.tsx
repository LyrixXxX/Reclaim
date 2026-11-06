import { Href, router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { BADGE_ACCENTS, badgeImages } from '@/components/badge-art';
import { Chevron } from '@/components/icon';
import { EarnedBadge, NextBadge, trophyCaseHref } from '@/lib/trophy-case';
import { colors, font, layout } from '@/theme';

/** The badge you're closest to, with your latest ones. Opens the trophy case. */
export function NextBadgeCard({ next, earned = [], showLatest = false }: { next: NextBadge | null; earned?: readonly EarnedBadge[]; showLatest?: boolean }) {
  const latest = showLatest ? earned.slice(0, 3) : [];
  const tracker = next?.tracker ?? earned[0]?.tracker;
  const href = tracker ? trophyCaseHref(tracker) : '/trophy-case';
  const percent = next ? Math.round(next.progress * 100) : 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={next ? `Next badge: ${next.label}, ${next.name}. ${next.line}. Open trophy case` : 'Open trophy case'} onPress={() => router.push(href as Href)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
    {next ? <View style={styles.next}>
      <Image source={badgeImages(next.tracker)[next.index]} resizeMode="contain" style={styles.badge} accessible={false} />
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>NEXT BADGE</Text>
        <Text style={styles.title} numberOfLines={1}>{next.label} · {next.name}</Text>
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(percent, 2)}%`, backgroundColor: BADGE_ACCENTS[next.index] }]} /></View>
        <Text style={styles.line}>{next.line}</Text>
      </View>
      {!showLatest && <Chevron color={colors.textMuted} />}
    </View> : !showLatest && <Text style={styles.title}>Trophy case</Text>}
    {showLatest && <View style={[styles.footer, next && styles.footerRule]}>
      {latest.map((badge) => <Image key={`${badge.tracker.id}-${badge.days}`} source={badgeImages(badge.tracker)[badge.index]} resizeMode="contain" style={styles.thumb} accessible={false} />)}
      <Text style={styles.link}>Trophy case{earned.length ? ` · ${earned.length} earned` : ''}</Text>
      <Chevron color={colors.textMuted} />
    </View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: 14, gap: 10 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 60, height: 66, opacity: 0.55 },
  copy: { flex: 1, gap: 4 },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, letterSpacing: 1 },
  title: { color: colors.text, fontSize: 16, fontFamily: font.bold },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden', marginTop: 2 },
  fill: { height: 6, borderRadius: 3 },
  line: { color: colors.textMuted, fontSize: 13, fontFamily: font.medium },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerRule: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  thumb: { width: 30, height: 33 },
  link: { flex: 1, color: colors.text, fontSize: 14, fontFamily: font.semibold, marginLeft: 2 },
});
