import { isRetiredHabit } from '@/lib/good-habit-templates';
import { StyleSheet, Text, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trackerDisplayName } from '@/lib/tracker-management';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';

export default function ArchivedTrackersScreen() {
  const { trackers, setArchived } = useTrackers();
  const archived = trackers.filter((tracker) => tracker.archived);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PRESERVED, NOT DELETED</Text>
        <Text style={styles.title}>Archived trackers</Text>
        <Text style={styles.subtitle}>All history, charts, notes, and settings remain on this device.</Text>
        {archived.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing archived</Text>
            <Text style={styles.emptyBody}>Trackers you archive will be available here.</Text>
          </View>
        ) : archived.map((tracker) => (
          <View key={tracker.id} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}>
              <Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.name}>{trackerDisplayName(tracker)}</Text>
              <Text style={styles.meta}>History preserved</Text>
            </View>
            {!isRetiredHabit(tracker.habitTemplate) && <Pressable accessibilityRole="button" onPress={() => setArchived(tracker.id, false)} style={styles.restore}>
              <Text style={styles.restoreText}>Restore</Text>
            </Pressable>}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.4, fontFamily: font.semibold, marginTop: 14 },
  title: { color: colors.text, fontSize: 30, fontFamily: font.bold, marginTop: 8 },
  subtitle: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 20, marginTop: 8, marginBottom: 22 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: 30 },
  emptyTitle: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  emptyBody: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 7 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.md, marginBottom: 10 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconText: { fontSize: 20, fontFamily: font.semibold },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 14, fontFamily: font.semibold },
  meta: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, marginTop: 4 },
  restore: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9 },
  restoreText: { color: colors.accent, fontSize: 11, fontFamily: font.semibold },
});
