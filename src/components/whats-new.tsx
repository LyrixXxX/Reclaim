import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getVersion } from 'react-native-device-info';

import { ReleaseNotes, unseenReleaseNotes, WHATS_NEW_KEY } from '@/lib/whats-new';
import { useTrackers } from '@/state/tracker-context';
import { colors, font } from '@/theme';

/** The installed version without any build suffix, such as "1.0.65" from "1.0.65-dev". */
export function installedVersion() {
  return getVersion().split('-')[0];
}

/**
 * After an update, shows what changed once. A fresh install only records the version, so new users
 * aren't told about "new" things; people updating from before this note existed see the current notes.
 */
export function WhatsNewPrompt({ active }: { active: boolean }) {
  const { hydrated, onboardingStatus } = useTrackers();
  const [releases, setReleases] = useState<ReleaseNotes[]>([]);

  useEffect(() => {
    if (!active || !hydrated || onboardingStatus === 'pending') return;
    let alive = true;
    void (async () => {
      try {
        const installed = installedVersion();
        const stored = await AsyncStorage.getItem(WHATS_NEW_KEY);
        // No record yet: an existing user updating to the first version with this note, since setup is done.
        const lastSeen = stored ?? (onboardingStatus === 'complete' ? '1.0.64' : null);
        const unseen = unseenReleaseNotes(installed, lastSeen);
        await AsyncStorage.setItem(WHATS_NEW_KEY, installed);
        if (alive && unseen.length) setReleases(unseen);
      } catch { /* A missed note is harmless. */ }
    })();
    return () => { alive = false; };
  }, [active, hydrated, onboardingStatus]);

  return <Modal visible={releases.length > 0} transparent animationType="fade" onRequestClose={() => setReleases([])}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>WHAT’S NEW</Text>
        <Text style={styles.title}>{releases.length > 1 ? 'Recent updates' : `Reclaim ${releases[0]?.version ?? ''}`}</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={{ gap: 14 }}><ReleaseNotesList releases={releases} showVersions={releases.length > 1} /></ScrollView>
        <Pressable accessibilityRole="button" onPress={() => setReleases([])} style={styles.button}><Text style={styles.buttonText}>Got it</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

/** Bulleted notes, grouped by version. Shared by the popup and Settings. */
export function ReleaseNotesList({ releases, showVersions = true }: { releases: readonly ReleaseNotes[]; showVersions?: boolean }) {
  return <>{releases.map((release) => <View key={release.version} style={{ gap: 6 }}>
    {showVersions && <Text style={styles.version}>Reclaim {release.version}{release.date ? ` · ${release.date}` : ''}</Text>}
    {release.notes.map((note) => <View key={note} style={styles.noteRow}><Text style={styles.bullet}>•</Text><Text style={styles.note}>{note}</Text></View>)}
  </View>)}</>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 22 },
  card: { maxHeight: '80%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 20, gap: 12 },
  eyebrow: { color: colors.accent, fontSize: 11, fontFamily: font.bold, letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 22, fontFamily: font.bold, marginTop: -4 },
  scroll: { flexGrow: 0 },
  version: { color: colors.textMuted, fontSize: 13, fontFamily: font.bold },
  noteRow: { flexDirection: 'row', gap: 8 },
  bullet: { color: colors.accent, fontSize: 15, fontFamily: font.bold, lineHeight: 21 },
  note: { flex: 1, color: colors.text, fontSize: 15, fontFamily: font.regular, lineHeight: 21 },
  button: { minHeight: 50, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { color: colors.background, fontSize: 16, fontFamily: font.bold },
});
