import { Href, Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';

export default function GoodHabitTypesScreen() {
  return <SafeAreaView style={styles.safe} edges={['bottom']}><View style={styles.content}>
    <Text style={styles.title}>Choose a good habit</Text>
    <Text style={styles.body}>Each habit type has its own goal and way to log progress. More types can be added in future updates.</Text>
    <Link href={'/water-form' as Href} asChild><Pressable accessibilityRole="button" style={styles.card}>
      <Text style={styles.icon}>💧</Text><View style={styles.copy}><Text style={styles.name}>Drink more water</Text><Text style={styles.body}>Set a daily fluid-ounce goal and log each drink.</Text></View><Text style={styles.chevron}>›</Text>
    </Pressable></Link>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' }, body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, minHeight: 96, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.habitsNav },
  icon: { fontSize: 32 }, copy: { flex: 1, gap: 4 }, name: { color: colors.text, fontSize: 18, fontWeight: '800' }, chevron: { color: colors.habitsNav, fontSize: 30 },
});
