import { useRef, useState } from 'react';
import { Image, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { HABIT_MILESTONES, HabitMilestone } from '@/lib/habit-milestones';
import { colors, layout, spacing } from '@/theme';

const BADGES = [
  require('../../assets/images/milestone-day.png'),
  require('../../assets/images/milestone-week.png'),
  require('../../assets/images/milestone-month.png'),
  require('../../assets/images/milestone-three-months.png'),
  require('../../assets/images/milestone-six-months.png'),
  require('../../assets/images/milestone-year.png'),
];
const ACCENTS = ['#a9ed70', '#56e8ad', '#f5d565', '#5ccaff', '#ffb849', '#df8aff'];

export function HabitMilestoneShowcase({ awards }: { awards: HabitMilestone[] }) {
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
        <Pressable accessibilityRole="button" accessibilityLabel="Previous achievements" onPress={() => moveCarousel(-1)} style={styles.carouselArrow}><Text style={styles.carouselArrowText}>‹</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="More achievements" onPress={() => moveCarousel(1)} style={styles.carouselArrow}><Text style={styles.carouselArrowText}>›</Text></Pressable>
      </View>
    </View>
    <Text style={styles.explanation}>Achievements stay earned. Tap a badge to see its dates.</Text>
    <ScrollView ref={carousel} horizontal style={styles.carousel} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list} onScroll={rememberOffset} scrollEventThrottle={32}>
      {HABIT_MILESTONES.map((milestone, index) => {
        const count = awards[index]?.dates.length ?? 0;
        return <Pressable key={milestone.days} accessibilityRole="button" accessibilityLabel={`${milestone.label}, earned ${count} times. View dates.`} onPress={() => setSelected(index)} style={[styles.card, count > 0 && { borderColor: ACCENTS[index] }]}>
          <Image source={BADGES[index]} resizeMode="contain" style={[styles.image, !count && styles.locked]} />
          <Text style={[styles.label, count > 0 && { color: ACCENTS[index] }]}>{milestone.label}</Text>
          <Text style={styles.subtitle}>{milestone.subtitle}</Text>
          <Text style={styles.days}>{milestone.days} {milestone.days === 1 ? 'day' : 'days'}</Text>
          <Text style={[styles.count, count > 0 && { color: ACCENTS[index] }]}>{count ? `×${count}` : 'Not yet earned'}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        {selected !== null && <>
          <Image source={BADGES[selected]} resizeMode="contain" style={styles.modalImage} />
          <Text style={styles.modalTitle}>{HABIT_MILESTONES[selected].label} · {active?.dates.length ?? 0}×</Text>
          {active?.dates.length ? <ScrollView style={styles.dates}><Text style={styles.modalCopy}>Earned on</Text>{active.dates.map((date, index) => <Text key={`${date}-${index}`} style={styles.date}>{formatDate(date)}</Text>)}</ScrollView> : <Text style={styles.modalCopy}>Keep going to earn this milestone.</Text>}
        </>}
        <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { color: colors.text, fontSize: 21, fontWeight: '800', flexShrink: 1 },
  explanation: { color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 12 },
  carouselControls: { flexDirection: 'row', gap: 6 },
  carouselArrow: { width: 36, height: 36, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  carouselArrowText: { color: colors.habitsNav, fontSize: 28, lineHeight: 31, fontWeight: '700' },
  carousel: { flexGrow: 0, height: 265 },
  list: { gap: 10, alignItems: 'flex-start', paddingBottom: 3 },
  card: { width: 152, height: 260, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: 9 },
  image: { width: 130, height: 145 },
  locked: { opacity: .28 },
  label: { color: colors.textMuted, fontSize: 16, fontWeight: '900', marginTop: 1 },
  subtitle: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 3 },
  days: { color: colors.textMuted, fontSize: 10, marginTop: 5 },
  count: { color: colors.textMuted, fontSize: 14, fontWeight: '800', marginTop: 8, minHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, alignItems: 'center', padding: 18, maxHeight: '75%' },
  modalImage: { width: 180, height: 190 },
  modalTitle: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 6 },
  modalCopy: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 12 },
  dates: { alignSelf: 'stretch', marginTop: 8 },
  date: { color: colors.text, textAlign: 'center', paddingVertical: 7 },
  close: { backgroundColor: colors.surfaceRaised, borderRadius: 14, alignSelf: 'stretch', padding: 14, marginTop: 18 },
  closeText: { color: colors.text, textAlign: 'center', fontWeight: '800' },
});
