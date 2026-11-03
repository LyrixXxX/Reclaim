import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Href, router } from 'expo-router';

import { AppPreferences, TrackerState } from '@/models/tracker';
import { Chevron } from '@/components/icon';
import { colors, font, radius, type } from '@/theme';

export type StartHereStep = { id: string; title: string; detail: string; href: string; color: string; used: boolean };

/**
 * First steps for the sections someone turned on. A step counts as done the first time it is used
 * (one tracker, one route, one finished workout, one meal, one weigh-in) and stays done after that,
 * so it never comes back just because a day passes without it.
 */
export function startHereSteps(state: TrackerState, sections: AppPreferences['visibleSections']): StartHereStep[] {
  const steps: (StartHereStep | false | undefined)[] = [
    sections.goals && { id: 'habit', title: 'Add something to quit or build', detail: 'Start a quit timer or a daily habit.', href: '/habits', color: colors.habitsNav, used: state.trackers.length > 0 },
    sections.routes && { id: 'route', title: 'Record your first walk', detail: 'GPS map, distance and time.', href: '/routes', color: colors.activityNav, used: (state.activityRoutes ?? []).length > 0 },
    sections.workouts && { id: 'workout', title: 'Log your first workout', detail: 'Start a blank page or a plan.', href: '/workouts', color: colors.workoutsNav, used: (state.workoutSessions ?? []).some((session) => session.endedAt) },
    sections.nutrition && { id: 'food', title: 'Log your first meal', detail: 'Calories, macros and fiber.', href: '/nutrition-add', color: colors.nutritionNav, used: (state.nutritionEntries ?? []).length > 0 },
    sections.weight && { id: 'weight', title: 'Add a weigh-in', detail: 'See your trend over time.', href: '/weight', color: colors.weightNav, used: (state.weightEntries ?? []).length > 0 },
  ];
  return steps.filter((step): step is StartHereStep => !!step);
}

type Prefs = NonNullable<AppPreferences['startHere']>;

export function StartHereCard({ steps, prefs, onUpdate }: { steps: StartHereStep[]; prefs: Prefs | undefined; onUpdate: (update: Prefs) => void }) {
  const done = new Set(prefs?.done ?? []);
  const newlyUsed = steps.filter((step) => step.used && !done.has(step.id)).map((step) => step.id);
  // Remember first use, so deleting that record later doesn't bring the step back.
  useEffect(() => { if (newlyUsed.length) onUpdate({ done: newlyUsed }); }, [newlyUsed.join(','), onUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = steps.filter((step) => !step.used && !done.has(step.id));
  if (prefs?.dismissed || !remaining.length) return null;
  const finished = steps.length - remaining.length;
  const collapsed = !!prefs?.collapsed;
  const dismiss = () => Alert.alert('Hide Start here?', 'You can still do these anytime from each tab.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Hide', onPress: () => onUpdate({ dismissed: true }) }]);

  return <View style={styles.card}>
    <View style={styles.head}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: !collapsed }} accessibilityLabel={collapsed ? 'Show first steps' : 'Minimize first steps'} onPress={() => onUpdate({ collapsed: !collapsed })} style={styles.headMain}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>START HERE{finished ? ` · ${finished} OF ${steps.length} DONE` : ''}</Text>
          <Text style={styles.title}>{collapsed ? `${remaining.length} first ${remaining.length === 1 ? 'step' : 'steps'} left` : 'A few first steps'}</Text>
        </View>
        <Chevron direction={collapsed ? 'down' : 'up'} size={18} color={colors.textMuted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Hide Start here" hitSlop={10} onPress={dismiss} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
    </View>
    {!collapsed && remaining.map((step) => <Pressable key={step.id} accessibilityRole="button" onPress={() => router.push(step.href as Href)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <View style={[styles.dot, { backgroundColor: step.color }]} />
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{step.title}</Text><Text style={styles.rowDetail}>{step.detail}</Text></View>
      <Chevron color={colors.textMuted} />
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: 20, paddingVertical: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  eyebrow: { ...type.eyebrow, color: colors.accent },
  title: { ...type.title, color: colors.text, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 24, fontFamily: font.regular, marginTop: -2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { color: colors.text, fontSize: 15, fontFamily: font.bold },
  rowDetail: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 2 },
});
