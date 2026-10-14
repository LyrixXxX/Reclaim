import { Href, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
import { GoodHabitIcon } from '@/components/good-habit-icon';
import { GOOD_HABIT_TEMPLATES } from '@/lib/good-habit-templates';
import { useTrackers } from '@/state/tracker-context';

export default function GoodHabitTypesScreen() {
  const { trackers } = useTrackers();
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Choose a good habit</Text>
    <Text style={styles.body}>Each habit type has its own goal and way to log progress. More types can be added in future updates.</Text>
    <Pressable accessibilityRole="button" disabled={trackers.some((item) => item.habitTemplate === 'water' && !item.archived)} onPress={() => router.push('/water-form' as Href)} style={styles.card}>
      <GoodHabitIcon type="water" size={64} /><View style={styles.copy}><Text style={styles.name}>Drink more water</Text><Text style={styles.body}>{trackers.some((item) => item.habitTemplate === 'water' && !item.archived) ? 'Already active · edit it from Good Habits' : 'Set a daily fluid goal and log each drink.'}</Text></View><Text style={styles.chevron}>›</Text>
    </Pressable>
    {GOOD_HABIT_TEMPLATES.filter((item) => item.id !== 'exercise').map((item) => { const active = trackers.some((tracker) => tracker.habitTemplate === item.id && !tracker.archived); return <Pressable key={item.id} accessibilityRole="button" disabled={active} onPress={() => router.push(`/good-habit-form?type=${item.id}` as Href)} style={[styles.card, active && styles.disabled]}><GoodHabitIcon type={item.id} size={64} /><View style={styles.copy}><Text style={styles.name}>{item.title}</Text><Text style={styles.body}>{active ? 'Already active · edit it from Good Habits' : `${item.period === 'week' ? 'Weekly' : 'Daily'} ${item.checklist ? 'checklist' : item.unit} goal`}</Text></View><Text style={styles.chevron}>›</Text></Pressable>; })}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 12, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' }, body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, minHeight: 96, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.habitsNav },
  disabled: { opacity: 0.55 }, copy: { flex: 1, gap: 4 }, name: { color: colors.text, fontSize: 18, fontWeight: '800' }, chevron: { color: colors.habitsNav, fontSize: 30 },
});
