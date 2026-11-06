import { Href, Link } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { BADGE_ACCENTS as ACCENTS, badgeImages, BadgeDatesModal } from '@/components/badge-art';
import { useTrophyCase } from '@/hooks/use-trophy-case';
import { HABIT_MILESTONES, HabitMilestone } from '@/lib/habit-milestones';
import { nextBadge, trophyCaseHref } from '@/lib/trophy-case';
import { colors, layout, spacing, font } from '@/theme';
import { Chevron } from '@/components/icon';

/** One habit's badges, with how far away the next one is. */
export function TrackerBadgeShowcase({ trackerId }: { trackerId: string }) {
  const { list } = useTrophyCase();
  const badges = list.find((item) => item.tracker.id === trackerId);
  return badges ? <HabitMilestoneShowcase awards={badges.awards} nextLine={nextBadge(badges)?.line} images={badgeImages(badges.tracker)} trophyHref={trophyCaseHref(badges.tracker)} /> : null;
}

function HabitMilestoneShowcase({ awards, nextLine, images, trophyHref }: { awards: HabitMilestone[]; nextLine?: string; images: readonly number[]; trophyHref: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const carousel = useRef<ScrollViewInstance>(null);
  const scrollOffset = useRef(0);
  const moveCarousel = (direction: -1 | 1) => carousel.current?.scrollTo({ x: Math.max(0, scrollOffset.current + direction * 162), animated: true });
  const rememberOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => { scrollOffset.current = Math.max(0, event.nativeEvent.contentOffset.x); };
  const active = selected === null ? undefined : awards[selected];
  return <View style={styles.section}>
    <View style={styles.headingRow}>
      <Text style={styles.heading}>Milestone showcase</Text>
      <View style={styles.carouselControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous achievements" onPress={() => moveCarousel(-1)} style={styles.carouselArrow}><Chevron direction="left" color={colors.textMuted} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="More achievements" onPress={() => moveCarousel(1)} style={styles.carouselArrow}><Chevron color={colors.textMuted} /></Pressable>
      </View>
    </View>
    <Text style={styles.explanation}>Achievements stay earned. Tap a badge to see its dates.</Text>
    <View style={styles.nextRow}>
      {nextLine ? <Text style={styles.nextLine}>{nextLine}</Text> : <View style={{ flex: 1 }} />}
      <Link href={trophyHref as Href} style={styles.trophyLink}>Trophy case</Link>
    </View>
    <ScrollView ref={carousel} horizontal style={styles.carousel} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list} onScroll={rememberOffset} scrollEventThrottle={32}>
      {HABIT_MILESTONES.map((milestone, index) => {
        const count = awards[index]?.dates.length ?? 0;
        return <Pressable key={milestone.days} accessibilityRole="button" accessibilityLabel={`${milestone.label}, earned ${count} ${count === 1 ? 'time' : 'times'}. View dates.`} onPress={() => setSelected(index)} style={[styles.card, count > 0 && { borderColor: ACCENTS[index] }]}>
          <Image source={images[index]} resizeMode="contain" style={[styles.image, !count && styles.locked]} />
          <Text style={[styles.label, count > 0 && { color: ACCENTS[index] }]}>{milestone.label}</Text>
          <Text style={styles.subtitle}>{milestone.subtitle}</Text>
          <Text style={styles.days}>{milestone.days} {milestone.days === 1 ? 'day' : 'days'}</Text>
          <Text style={[styles.count, count > 0 && { color: ACCENTS[index] }]}>{count ? `×${count}` : 'Not yet earned'}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <BadgeDatesModal index={selected} award={active} images={images} onClose={() => setSelected(null)} />
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { color: colors.text, fontSize: 21, fontFamily: font.semibold, flexShrink: 1 },
  explanation: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 4, marginBottom: 8 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  nextLine: { flex: 1, color: colors.text, fontSize: 14, fontFamily: font.semibold },
  trophyLink: { color: colors.habitsNav, fontSize: 14, fontFamily: font.bold },
  carouselControls: { flexDirection: 'row', gap: 6 },
  carouselArrow: { width: 36, height: 36, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  carouselArrowText: { color: colors.habitsNav, fontSize: 28, lineHeight: 31, fontFamily: font.bold },
  carousel: { flexGrow: 0, height: 265 },
  list: { gap: 10, alignItems: 'flex-start', paddingBottom: 3 },
  card: { width: 152, height: 260, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: 9 },
  image: { width: 130, height: 145 },
  locked: { opacity: .28 },
  label: { color: colors.textMuted, fontSize: 16, fontFamily: font.bold, marginTop: 1 },
  subtitle: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, textAlign: 'center', marginTop: 3 },
  days: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 5 },
  count: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold, marginTop: 8, minHeight: 18 },
});
