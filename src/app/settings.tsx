import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Href, Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppLockSettings } from '@/components/app-lock-settings';
import { AdsConsent } from 'react-native-google-mobile-ads';
import { MainScreenHeader } from '@/components/main-screen-header';
import { LocalSaveStatus } from '@/components/local-save-status';
import { backupSummary, parseReclaimBackup } from '@/lib/backup';
import { readTodaySteps, stopStepTracking, StepResult } from '@/lib/activity-steps';
import { createPortableBackup, restorePortableBackup } from '@/lib/backup-files';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { MONETIZATION_ENABLED, TEST_ADS_ENABLED } from '@/lib/monetization';
import { AppSection } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { useMonetization } from '@/state/monetization-context';
import { colors, layout, spacing } from '@/theme';

const sections: { id: AppSection; label: string; description: string }[] = [
  { id: 'goals', label: 'Habits', description: 'Habits you are quitting, reducing, or building.' },
  { id: 'weight', label: 'Weight', description: 'Weight history, trends, and goals.' },
  { id: 'nutrition', label: 'Nutrition', description: 'Daily macros, fiber, saved foods, and nutrition trends.' },
  { id: 'activity', label: 'Activity + Map', description: 'Daily steps and GPS-recorded walks, hikes, or runs.' },
];

export default function SettingsScreen() {
  const {
    preferences = DEFAULT_PREFERENCES,
    setSectionVisibility,
    setRouteCaloriesInNutrition,
    getBackupState,
    restoreBackupState,
  } = useTrackers();
  const [backupBusy, setBackupBusy] = useState(false);
  const [stepStatus, setStepStatus] = useState<StepResult>({ status: 'permission-needed' });
  const monetization = useMonetization();
  useEffect(() => { void readTodaySteps().then(setStepStatus); }, []);

  const exportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const backup = await createPortableBackup(getBackupState());
      const date = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `Reclaim-backup-${date}.json`);
      file.write(JSON.stringify(backup));
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Save Reclaim backup',
        mimeType: 'application/json',
        UTI: 'public.json',
      });
    } catch (error) {
      Alert.alert('Could not create backup', messageFrom(error));
    } finally {
      setBackupBusy(false);
    }
  };

  const chooseBackup = async () => {
    if (backupBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const backup = parseReclaimBackup(await new File(result.assets[0].uri).text());
      const summary = backupSummary(backup.state);
      const exported = new Date(backup.exportedAt).toLocaleString(undefined, { hour12: true });
      Alert.alert(
        'Restore this Reclaim backup?',
        `Created ${exported}\n\n${summary.trackers} trackers · ${summary.cpapReadings} CPAP nights · ${summary.weightEntries} weigh-ins · ${summary.healthRecords} health records · ${summary.nutritionEntries} food entries\n\nThis replaces the data in this copy of Reclaim. It does not change or delete data in the app that created the backup.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore backup', onPress: () => { void finishRestore(backup); } },
        ],
      );
    } catch (error) {
      Alert.alert('Could not read backup', messageFrom(error));
    }
  };

  const finishRestore = async (backup: ReturnType<typeof parseReclaimBackup>) => {
    setBackupBusy(true);
    try {
      const restoredState = await restorePortableBackup(backup);
      await restoreBackupState(restoredState);
      Alert.alert('Backup restored', 'This copy of Reclaim now contains the imported trackers and history.');
    } catch (error) {
      Alert.alert('Could not restore backup', messageFrom(error));
    } finally {
      setBackupBusy(false);
    }
  };

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <MainScreenHeader eyebrow="SETTINGS & PREFERENCES" subtitle="Choose what appears in Reclaim and keep a portable copy of your local data." accent={colors.settingsNav} />
    <LocalSaveStatus />
    <Text style={styles.section}>Home dashboard</Text>
    <View style={styles.backupCard}><Text style={styles.backupTitle}>Home Weight card</Text><Text style={styles.backupText}>Goals already link to their sections. Choose whether the extra Weight card appears below them and how much detail it shows.</Text><Link href={'/dashboard-edit' as Href} asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Customize Weight card</Text></Pressable></Link></View>
    <Text style={styles.section}>Privacy & app lock</Text>
    <View style={styles.backupCard}><Text style={styles.backupTitle}>Privacy & data</Text><Text style={styles.backupText}>See what Reclaim stores on this device and when information leaves it.</Text><Link href={'/privacy' as Href} asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Read privacy information</Text></Pressable></Link></View>
    <Pressable onPress={() => { void Linking.openURL(process.env.EXPO_PUBLIC_RECLAIM_PRIVACY_URL || 'https://reclaim-privacy-policy.pages.dev/'); }} style={styles.secondary}><Text style={styles.secondaryText}>Open public privacy policy</Text></Pressable>
    <AppLockSettings />
    <Text style={styles.section}>Ads & support</Text>
    <View style={styles.backupCard}>
      <Text style={styles.backupTitle}>{monetization.adFree ? 'Ads removed' : 'Keep Reclaim free'}</Text>
      <Text style={styles.backupText}>{TEST_ADS_ENABLED ? 'Google test banners appear on Home, Activity, and Nutrition. A test ad may also appear after saving a current meal. They earn no revenue; purchases are off in this build.' : monetization.adFree ? 'Your permanent Remove Ads purchase is active on this Play account.' : 'Banners and occasional post-save ads can help support Reclaim. Your personal records are never used to target them.'}</Text>
      {!!monetization.error && <Text accessibilityRole="alert" style={styles.privacy}>{monetization.error}</Text>}
      {MONETIZATION_ENABLED && !monetization.adFree && <Pressable disabled={!monetization.connected || !monetization.price || monetization.busy} onPress={() => { void monetization.buy().catch(() => Alert.alert('Purchase unavailable', 'Please try again through Google Play.')); }} style={[styles.primary, (!monetization.connected || !monetization.price || monetization.busy) && styles.disabled]}><Text style={styles.primaryText}>Remove ads permanently{monetization.price ? ` · ${monetization.price}` : ''}</Text></Pressable>}
      {MONETIZATION_ENABLED && <Pressable disabled={monetization.busy} onPress={() => { void monetization.restore().then((result) => Alert.alert(result === 'restored' ? 'Ads removed' : result === 'none' ? 'No purchase found' : 'Could not check purchases', result === 'restored' ? 'Your Remove Ads purchase is active on this Play account.' : result === 'none' ? 'No completed Remove Ads purchase was found on this Play account.' : 'Connect to Google Play and try again.')); }} style={styles.secondary}><Text style={styles.secondaryText}>Restore purchase</Text></Pressable>}
      {MONETIZATION_ENABLED && <Pressable onPress={() => { void AdsConsent.showPrivacyOptionsForm().catch(() => Alert.alert('Privacy options unavailable', 'Try again when connected.')); }} style={styles.secondary}><Text style={styles.secondaryText}>Ad privacy choices</Text></Pressable>}
      {!MONETIZATION_ENABLED && !TEST_ADS_ENABLED && <Text style={styles.backupText}>Ads and purchases are not active in this build.</Text>}
    </View>
    <Text style={styles.section}>Activity</Text>
    <View style={styles.card}><SettingRow label="Add Activity Calorie Estimates to Nutrition Budget" description="Include saved route estimates in your daily calorie budget." value={preferences.includeRouteCaloriesInNutrition ?? false} onChange={setRouteCaloriesInNutrition} /></View>
    {stepStatus.status === 'available' && <View style={styles.backupCard}><Text style={styles.backupTitle}>Step tracking</Text><Text style={styles.backupText}>Your phone is counting steps in the background.</Text><Pressable accessibilityRole="button" onPress={() => Alert.alert('Turn off step tracking?', 'Your daily steps will stop updating until you enable tracking again in Activity.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Turn off', style: 'destructive', onPress: () => { void stopStepTracking().then(() => readTodaySteps().then(setStepStatus)).catch(() => Alert.alert('Could not stop tracking', 'Please try again.')); } }])} style={styles.secondary}><Text style={styles.secondaryText}>Turn off step tracking</Text></Pressable></View>}
    <View style={styles.backupCard}><Text style={styles.backupTitle}>Offline map areas</Text><Text style={styles.backupText}>Optional downloads for trips without mobile data. Previously viewed areas are not guaranteed to work offline.</Text><Link href={'/activity-map-settings' as Href} asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Manage offline maps</Text></Pressable></Link></View>
    <Text style={styles.section}>Private AI</Text>
    <View style={styles.backupCard}><Text style={styles.backupTitle}>Food assistance</Text><Text style={styles.backupText}>No connection setup is needed. Only the food content you choose to analyze is sent through the Lyrix Studios relay to OpenAI. Your saved records remain on this device. Private AI requires a Google Play-installed copy of Reclaim; manual tracking always works.</Text></View>
    <Text style={styles.section}>Backup & transfer</Text>
    <View style={styles.backupCard}>
      <Text style={styles.backupTitle}>Your Reclaim data</Text>
      <Text style={styles.backupText}>Export your local records and settings, including data retained from older Reclaim versions. The backup stays local until you choose where to save it. Downloaded map tiles are not included.</Text>
      <Pressable disabled={backupBusy} style={[styles.primary, backupBusy && styles.disabled]} onPress={() => { void exportBackup(); }}><Text style={styles.primaryText}>{backupBusy ? 'Working…' : 'Export Reclaim backup'}</Text></Pressable>
      <Pressable disabled={backupBusy} style={[styles.secondary, backupBusy && styles.disabled]} onPress={() => { void chooseBackup(); }}><Text style={styles.secondaryText}>Restore from backup</Text></Pressable>
      <Text style={styles.privacy}>Backup files can contain private health information. Store them somewhere you trust.</Text>
    </View>
    <Text style={styles.section}>Bottom navigation</Text><View style={styles.card}>{sections.map((item) => <SettingRow key={item.id} label={item.label} description={item.description} value={preferences.visibleSections[item.id]} onChange={(value) => setSectionVisibility(item.id, value)} />)}</View>
    <View style={styles.notice}><Text style={styles.noticeTitle}>Older records stay intact</Text><Text style={styles.noticeText}>If you updated from a full-featured version, its records remain in local storage and backups. This wellness edition does not display or update them.</Text></View>
  </ScrollView></SafeAreaView>;
}

function SettingRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{label}</Text><Text style={styles.rowText}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.accentSoft }} thumbColor={value ? colors.accent : colors.textDim} /></View>;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. No data was changed.';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 50 },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 26, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, overflow: 'hidden' },
  backupCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg },
  backupTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  backupText: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  primary: { backgroundColor: colors.settingsNav, borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 16 },
  primaryText: { color: colors.background, fontSize: 12, fontWeight: '900' },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 10 },
  secondaryText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  privacy: { color: colors.textDim, fontSize: 9, lineHeight: 14, marginTop: 12 },
  row: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomColor: colors.border, borderBottomWidth: 1 },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  rowText: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  notice: { backgroundColor: colors.accentSoft, borderRadius: 14, padding: 14, marginTop: 20 },
  noticeTitle: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  noticeText: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginTop: 4 },
});
