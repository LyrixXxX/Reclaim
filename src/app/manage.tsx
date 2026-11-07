import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trackerDisplayName } from '@/lib/tracker-management';
import { taperQuitPhase } from '@/lib/taper-quit';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';
import { Chevron } from '@/components/icon';

export default function ManageTrackersScreen() {
  const { trackers, taperSteps = [] } = useTrackers();
  const active = trackers.filter((tracker) => !tracker.archived);
  const archivedCount = trackers.length - active.length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR TRACKERS</Text>
        <Text style={styles.title}>Shape Reclaim around your habits.</Text>
        <Text style={styles.subtitle}>Edit, archive, restore, or add trackers without losing history.</Text>

        <Link href="/tracker-form" asChild>
          <Pressable accessibilityRole="button" style={styles.addButton}>
            <Text style={styles.addIcon}>+</Text>
            <Text style={styles.addText}>Add tracker</Text>
          </Pressable>
        </Link>

        <View style={styles.list}>
          {active.map((tracker) => (
            <Link key={tracker.id} href={{ pathname: '/tracker-form', params: { id: tracker.id } }} asChild>
              <Pressable accessibilityRole="button" style={styles.row}>
                <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}>
                  <Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text>
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name}>{trackerDisplayName(tracker)}</Text>
                  {tracker.displayName && <Text style={styles.actualName}>{tracker.name}</Text>}
                  <Text style={styles.mode}>{taperQuitPhase(tracker, taperSteps) ? 'QUIT AFTER TAPER' : modeLabel(tracker.mode)}</Text>
                </View>
                <View style={styles.editRow}><Text style={styles.edit}>Edit</Text><Chevron size={16} /></View>
              </Pressable>
            </Link>
          ))}
        </View>

        <Link href="/archived" asChild>
          <Pressable accessibilityRole="button" style={styles.archiveLink}>
            <Text style={styles.archiveText}>Archived trackers</Text>
            <View style={styles.editRow}><Text style={styles.archiveCount}>{archivedCount}</Text><Chevron size={16} /></View>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

function modeLabel(mode: string) {
  if (mode === 'abstinence') return 'QUIT / ABSTINENCE';
  if (mode === 'reduction') return 'REDUCE / TAPER';
  return 'BUILD A HABIT';
}

const styles = StyleSheet.create({
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, paddingBottom: 40 },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: font.semibold, marginTop: 14 },
  title: { color: colors.text, fontSize: 30, lineHeight: 36, fontFamily: font.bold, marginTop: 8 },
  subtitle: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 20, marginTop: 9 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 15, marginTop: 24 },
  addIcon: { color: colors.background, fontSize: 20, fontFamily: font.bold },
  addText: { color: colors.background, fontSize: 14, fontFamily: font.semibold },
  list: { gap: 10, marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconText: { fontSize: 21, fontFamily: font.semibold },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 14, fontFamily: font.semibold },
  actualName: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 3 },
  mode: { color: colors.textDim, fontSize: 11, letterSpacing: 1.1, fontFamily: font.semibold, marginTop: 5 },
  edit: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold },
  archiveLink: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 18, marginTop: 26 },
  archiveText: { color: colors.textMuted, fontSize: 13, fontFamily: font.bold },
  archiveCount: { color: colors.textDim, fontSize: 12 , fontFamily: font.regular},
});
