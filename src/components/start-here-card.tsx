import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Href, router } from 'expo-router';

import { AppPreferences, TrackerState } from '@/models/tracker';
import { Chevron } from '@/components/icon';
import { colors, font, radius, type } from '@/theme';

/** First steps for each visible area that has nothing in it yet. Disappears as the user fills things in. */
export function startHereActions(state: TrackerState, sections: AppPreferences['visibleSections']) {
  const active = state.trackers.filter((item) => !item.archived);
  type Action = { id: string; title: string; detail: string; href: string; color: string };
  const actions: (Action | false | undefined)[] = [
    sections.goals && !active.length && { id: 'habit', title: 'Add something to quit or build', detail: 'Start a quit timer or a daily habit.', href: '/habits', color: colors.habitsNav },
    sections.routes && !(state.activityRoutes ?? []).length && { id: 'route', title: 'Record your first walk', detail: 'GPS map, distance and time.', href: '/routes', color: colors.activityNav },
    sections.workouts && !(state.workoutSessions ?? []).length && { id: 'workout', title: 'Log a workout', detail: 'Start a blank page or a plan.', href: '/workouts', color: colors.workoutsNav },
    sections.nutrition && !(state.nutritionEntries ?? []).length && { id: 'food', title: 'Log your first meal', detail: 'Calories, macros and fiber.', href: '/nutrition-log', color: colors.nutritionNav },
    sections.weight && !(state.weightEntries ?? []).length && { id: 'weight', title: 'Add a weigh-in', detail: 'See your trend over time.', href: '/weight', color: colors.weightNav },
  ];
  return actions.filter((item): item is Action => !!item);
}

export function StartHereCard({ actions }: { actions: ReturnType<typeof startHereActions> }) {
  if (!actions.length) return null;
  return <View style={styles.card}>
    <Text style={styles.eyebrow}>START HERE</Text>
    <Text style={styles.title}>A few first steps</Text>
    {actions.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(item.href as Href)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <View style={[styles.dot, { backgroundColor: item.color }]} />
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowDetail}>{item.detail}</Text></View>
      <Chevron color={colors.textMuted} />
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: 20, gap: 4 },
  eyebrow: { ...type.eyebrow, color: colors.accent },
  title: { ...type.title, color: colors.text, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { color: colors.text, fontSize: 15, fontFamily: font.bold },
  rowDetail: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 2 },
});
