import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HABIT_MILESTONES, HabitMilestone } from '@/lib/habit-milestones';
import type { Tracker } from '@/models/tracker';
import { colors, font, layout } from '@/theme';

/** Quit trackers, custom habits, and exercise habits saved before it left the add list. */
const GROWTH_BADGES = [
  require('../../assets/images/milestone-day.png'),
  require('../../assets/images/milestone-week.png'),
  require('../../assets/images/milestone-month.png'),
  require('../../assets/images/milestone-three-months.png'),
  require('../../assets/images/milestone-six-months.png'),
  require('../../assets/images/milestone-year.png'),
];
// Each built-in good habit has its own set, in milestone order.
const THEMED_BADGES: Partial<Record<NonNullable<Tracker['habitTemplate']>, readonly number[]>> = {
  water: [
    require('../../assets/images/badge-water-1.png'),
    require('../../assets/images/badge-water-2.png'),
    require('../../assets/images/badge-water-3.png'),
    require('../../assets/images/badge-water-4.png'),
    require('../../assets/images/badge-water-5.png'),
    require('../../assets/images/badge-water-6.png'),
  ],
  walk: [
    require('../../assets/images/badge-walk-1.png'),
    require('../../assets/images/badge-walk-2.png'),
    require('../../assets/images/badge-walk-3.png'),
    require('../../assets/images/badge-walk-4.png'),
    require('../../assets/images/badge-walk-5.png'),
    require('../../assets/images/badge-walk-6.png'),
  ],
  reading: [
    require('../../assets/images/badge-reading-1.png'),
    require('../../assets/images/badge-reading-2.png'),
    require('../../assets/images/badge-reading-3.png'),
    require('../../assets/images/badge-reading-4.png'),
    require('../../assets/images/badge-reading-5.png'),
    require('../../assets/images/badge-reading-6.png'),
  ],
  sleep: [
    require('../../assets/images/badge-sleep-1.png'),
    require('../../assets/images/badge-sleep-2.png'),
    require('../../assets/images/badge-sleep-3.png'),
    require('../../assets/images/badge-sleep-4.png'),
    require('../../assets/images/badge-sleep-5.png'),
    require('../../assets/images/badge-sleep-6.png'),
  ],
  mindfulness: [
    require('../../assets/images/badge-mindfulness-1.png'),
    require('../../assets/images/badge-mindfulness-2.png'),
    require('../../assets/images/badge-mindfulness-3.png'),
    require('../../assets/images/badge-mindfulness-4.png'),
    require('../../assets/images/badge-mindfulness-5.png'),
    require('../../assets/images/badge-mindfulness-6.png'),
  ],
  dental: [
    require('../../assets/images/badge-dental-1.png'),
    require('../../assets/images/badge-dental-2.png'),
    require('../../assets/images/badge-dental-3.png'),
    require('../../assets/images/badge-dental-4.png'),
    require('../../assets/images/badge-dental-5.png'),
    require('../../assets/images/badge-dental-6.png'),
  ],
};

/** The six badge images for a tracker, in milestone order. */
export function badgeImages(tracker?: Pick<Tracker, 'habitTemplate'>): readonly number[] {
  return (tracker?.habitTemplate && THEMED_BADGES[tracker.habitTemplate]) || GROWTH_BADGES;
}

export const BADGE_ACCENTS = ['#a9ed70', '#56e8ad', '#f5d565', '#5ccaff', '#ffb849', '#df8aff'];

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** A badge up close: when it was earned, or what it takes. */
export function BadgeDatesModal({ index, award, images, onClose }: { index: number | null; award?: HabitMilestone; images: readonly number[]; onClose: () => void }) {
  return <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      {index !== null && <>
        <Image source={images[index]} resizeMode="contain" style={styles.image} />
        <Text style={styles.title}>{HABIT_MILESTONES[index].label} · {award?.dates.length ?? 0}×</Text>
        {award?.dates.length ? <ScrollView style={styles.dates}><Text style={styles.copy}>Earned on</Text>{award.dates.map((date, position) => <Text key={`${date}-${position}`} style={styles.date}>{formatDate(date)}</Text>)}</ScrollView> : <Text style={styles.copy}>Reach {HABIT_MILESTONES[index].days} {HABIT_MILESTONES[index].days === 1 ? 'day' : 'days'} in a row to earn this.</Text>}
      </>}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, alignItems: 'center', padding: 18, maxHeight: '75%' },
  image: { width: 180, height: 190 },
  title: { color: colors.text, fontSize: 22, fontFamily: font.bold, marginTop: 6 },
  copy: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, textAlign: 'center', marginTop: 12 },
  dates: { alignSelf: 'stretch', marginTop: 8 },
  date: { color: colors.text, textAlign: 'center', paddingVertical: 7 },
  close: { backgroundColor: colors.surfaceRaised, borderRadius: 14, alignSelf: 'stretch', padding: 14, marginTop: 18 },
  closeText: { color: colors.text, textAlign: 'center', fontFamily: font.semibold },
});
