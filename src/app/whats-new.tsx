import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { installedVersion, ReleaseNotesList } from '@/components/whats-new';
import { releaseNotesUpTo } from '@/lib/whats-new';
import { colors, font, layout, spacing } from '@/theme';

/** Every release's notes, newest first, opened from Settings. */
export default function WhatsNewScreen() {
  const version = installedVersion();
  const releases = releaseNotesUpTo(version);
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>What’s new</Text>
    <Text style={styles.muted}>You have Reclaim {version}.</Text>
    {releases.length ? <ReleaseNotesList releases={releases} /> : <Text style={styles.muted}>Notes for future updates will show up here.</Text>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60, gap: spacing.lg },
  title: { color: colors.text, fontSize: 27, fontFamily: font.bold },
  muted: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, marginTop: -8 },
});
