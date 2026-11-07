import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Href, Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Animated, Linking, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppLockSettings } from '@/components/app-lock-settings';
import { AdsConsent } from 'react-native-google-mobile-ads';
import { MainScreenHeader } from '@/components/main-screen-header';
import { LocalSaveStatus } from '@/components/local-save-status';
import { RemoveAdsButton } from '@/components/remove-ads-button';
import { backupSummary, importFileKind, parseReclaimBackup } from '@/lib/backup';
import { parseWeightExport, weightImportPlan } from '@/lib/weight';
import { readActiveRoute } from '@/lib/activity-recording';
import { createPortableBackup, restorePortableBackup } from '@/lib/backup-files';
import { DEFAULT_PREFERENCES, moveNavigationSection, normalizeNavigationOrder } from '@/lib/preferences';
import { MONETIZATION_ENABLED, PURCHASES_ENABLED, TEST_ADS_ENABLED } from '@/lib/monetization';
import { NavigationSection } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { useMonetization } from '@/state/monetization-context';
import { colors, layout, spacing, font } from '@/theme';
import { PRIVACY_POLICY_URL } from '@/lib/privacy-policy';

const sections: { id: NavigationSection; label: string; description: string }[] = [
  { id: 'goals', label: 'Habits', description: 'Habits you are quitting, reducing, or building.' },
  { id: 'weight', label: 'Weight', description: 'Weight history, trends, and goals.' },
  { id: 'nutrition', label: 'Nutrition', description: 'Daily macros, fiber, saved foods, and nutrition trends.' },
  { id: 'activity', label: 'Steps', description: 'Daily steps, goal, and trends.' },
  { id: 'routes', label: 'Routes', description: 'GPS-recorded walks, hikes, runs, and saved maps.' },
  { id: 'workouts', label: 'Workouts', description: 'Strength sessions, routines, and progress.' },
  { id: 'supplements', label: 'Supplements', description: 'Vitamin and supplement schedules and history.' },
];

export default function SettingsScreen() {
  const {
    preferences = DEFAULT_PREFERENCES,
    setSectionVisibility,
    setNavigationOrder,
    setRouteCaloriesInNutrition,
    getBackupState,
    restoreBackupState,
    weightEntries = [],
    importWeightHistory,
  } = useTrackers();
  const [backupBusy, setBackupBusy] = useState(false);
  const [draggingNavigation, setDraggingNavigation] = useState(false);
  const monetization = useMonetization();
  const navigationOrder = normalizeNavigationOrder(preferences.navigationOrder);

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

  const askToRestore = (raw: string) => {
    const backup = parseReclaimBackup(raw);
    const summary = backupSummary(backup.state);
    const exported = new Date(backup.exportedAt).toLocaleString(undefined, { hour12: true });
    Alert.alert(
      'Restore this Reclaim backup?',
      `Created ${exported}\n\n${summary.trackers} trackers · ${summary.weightEntries} weigh-ins · ${summary.nutritionEntries} food entries\n\nThis replaces all the data in this copy of Reclaim. It does not change or delete data in the app that created the backup.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore backup', onPress: () => { void finishRestore(backup); } },
      ],
    );
  };

  const askToAddWeights = (raw: string) => {
    const file = parseWeightExport(raw);
    const plan = weightImportPlan(weightEntries, file);
    if (!plan.added) { Alert.alert('Nothing to add', 'Every date in this file already has a weigh-in, so nothing changed.'); return; }
    const shortDate = (date?: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    Alert.alert(
      `Add ${plan.added} ${plan.added === 1 ? 'weigh-in' : 'weigh-ins'}?`,
      `From ${shortDate(plan.firstDate)} to ${shortDate(plan.lastDate)}.${plan.duplicates ? ` ${plan.duplicates} ${plan.duplicates === 1 ? 'date already has a weigh-in and will be' : 'dates already have a weigh-in and will be'} skipped.` : ''}\n\nYour existing weigh-ins won’t change. There’s no one-tap undo, so consider exporting a backup first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add weigh-ins', onPress: () => {
          const done = importWeightHistory(file);
          Alert.alert('Weight history added', `Added ${done.added} ${done.added === 1 ? 'weigh-in' : 'weigh-ins'}.${done.duplicates ? ` Skipped ${done.duplicates} ${done.duplicates === 1 ? 'date' : 'dates'} that already had one.` : ''}`);
        } },
      ],
    );
  };

  const chooseImport = async () => {
    if (backupBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const raw = await new File(result.assets[0].uri).text();
      const kind = importFileKind(raw);
      if (kind === 'backup') askToRestore(raw);
      else if (kind === 'weight') askToAddWeights(raw);
      else Alert.alert('Not a Reclaim file', 'Choose a backup or weight history file exported from Reclaim. Nothing was changed.');
    } catch (error) {
      Alert.alert('Could not read this file', messageFrom(error));
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

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} scrollEnabled={!draggingNavigation}>
    <MainScreenHeader title="Settings" subtitle="Choose what appears in Reclaim and keep a portable copy of your local data." accent={colors.settingsNav} />
    <LocalSaveStatus />
    <View style={[styles.backupCard, styles.whatsNewCard]}><Text style={styles.backupTitle}>What’s new</Text><Text style={styles.backupText}>See what changed in each update.</Text><Link href={'/whats-new' as Href} asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Read release notes</Text></Pressable></Link></View>
    <Text style={styles.section}>Privacy & app lock</Text>
    <View style={styles.backupCard}><Text style={styles.backupTitle}>Privacy & data</Text><Text style={styles.backupText}>See what Reclaim stores on this device and when information leaves it.</Text><Link href={'/privacy' as Href} asChild><Pressable style={styles.secondary}><Text style={styles.secondaryText}>Read privacy information</Text></Pressable></Link></View>
    <Pressable onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }} style={[styles.secondary, styles.privacyPolicyLink]}><Text style={styles.secondaryText}>Open public privacy policy</Text></Pressable>
    <AppLockSettings />
    <Text style={styles.section}>Ads & support</Text>
    <View style={styles.backupCard}>
      <Text style={styles.backupTitle}>{monetization.adFree ? 'Ads removed' : 'Keep Reclaim free'}</Text>
      <Text style={styles.backupText}>{monetization.adFree ? 'Your permanent Remove Ads purchase is active on this Play account.' : TEST_ADS_ENABLED ? `This build uses Google test ads, which earn no revenue.${PURCHASES_ENABLED ? ' Remove Ads can be tested through Google Play.' : ' Purchases are off in this build.'}` : 'Banners and post-save ads can help support Reclaim. Your personal records are never used to target them.'}</Text>
      {!!monetization.error && <Text accessibilityRole="alert" style={styles.privacy}>{monetization.error}</Text>}
      <RemoveAdsButton />
      {PURCHASES_ENABLED && <Pressable disabled={monetization.busy} onPress={() => { void monetization.restore().then((result) => {
        const messages = {
          verified: ['Ads removed', 'Your Remove Ads purchase was verified and is active.'],
          'not-returned': ['Purchase not returned', 'Google Play did not return Remove Ads to Reclaim. If Play says you own it, check that this is the purchasing Play account and try again shortly.'],
          pending: ['Purchase pending', 'Google Play returned Remove Ads, but the purchase has not completed yet.'],
          'missing-token': ['Purchase needs another check', 'Google Play returned Remove Ads without a verification token. Reconnect to Play and try again.'],
          rejected: ['Purchase not verified', 'Google Play returned Remove Ads, but the verification service did not confirm it. Please try again later.'],
          'play-unavailable': ['Play purchase check unavailable', 'Reclaim could not query Google Play purchases. Check your Play connection and try again.'],
          'verification-unavailable': ['Verification unavailable', 'Google Play returned a purchase, but Reclaim could not reach the verification service. Please try again later.'],
        } as const;
        const [title, message] = messages[result];
        Alert.alert(title, message);
      }); }} style={styles.secondary}><Text style={styles.secondaryText}>Restore purchase</Text></Pressable>}
      {MONETIZATION_ENABLED && <Pressable onPress={() => { void AdsConsent.showPrivacyOptionsForm().catch(() => Alert.alert('Privacy options unavailable', 'Try again when connected.')); }} style={styles.secondary}><Text style={styles.secondaryText}>Ad privacy choices</Text></Pressable>}
      {!MONETIZATION_ENABLED && !TEST_ADS_ENABLED && <Text style={styles.backupText}>Ads and purchases are not active in this build.</Text>}
    </View>
    <Text style={styles.section}>Route calorie estimates</Text>
    <View style={styles.card}><SettingRow label="Add route calories to Nutrition budget" description="Include saved route estimates in your daily calorie budget." value={preferences.includeRouteCaloriesInNutrition ?? false} onChange={setRouteCaloriesInNutrition} /></View>
    <Text style={styles.section}>AI</Text>
    <View style={styles.backupCard}><Text style={styles.backupTitle}>Food and workout assistance</Text><Text style={styles.backupText}>When you scan a label, describe a meal, or generate a training week, only what you submit is sent through the Lyrix Studios relay to OpenAI. Training plans use your chosen schedule and built-in exercise names, never your workout history or weights. Your saved records stay on this device.</Text></View>
    <Text style={styles.section}>Backup & transfer</Text>
    <View style={styles.backupCard}>
      <Text style={styles.backupTitle}>Your Reclaim data</Text>
      <Text style={styles.backupText}>Export your local records and settings. The backup stays local until you choose where to save it.</Text>
      <Pressable disabled={backupBusy} style={[styles.primary, backupBusy && styles.disabled]} onPress={() => { void exportBackup(); }}><Text style={styles.primaryText}>{backupBusy ? 'Working…' : 'Export Reclaim backup'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={backupBusy} style={[styles.secondary, backupBusy && styles.disabled]} onPress={() => { void chooseImport(); }}><Text style={styles.secondaryText}>Import</Text></Pressable>
      <Text style={styles.privacy}>Import works with any Reclaim file and tells you what it will do first. A full backup replaces everything here. A weight history file only adds dates you don’t have yet.</Text>
      <Text style={styles.privacy}>Backup files can contain private health information. Store them somewhere you trust. Route photos and walking-time history stay on this phone and aren’t included.</Text>
    </View>
    <Text style={styles.section}>Bottom navigation</Text><Text style={styles.navHint}>Drag the handles to set the order. The first three sit in the bottom bar next to Home; the rest are under More.</Text><View style={styles.card}>{navigationOrder.map((id, index) => { const item = sections.find((section) => section.id === id)!; return <NavigationSettingRow key={item.id} pinned={navigationOrder.filter((sectionId) => preferences.visibleSections[sectionId]).slice(0, 3).includes(item.id)} index={index} count={navigationOrder.length} label={item.label} description={item.description} value={preferences.visibleSections[item.id] ?? false} onDragStart={() => setDraggingNavigation(true)} onDragEnd={(offset) => { setDraggingNavigation(false); const target = Math.max(0, Math.min(navigationOrder.length - 1, index + Math.round(offset / 78))); setNavigationOrder(moveNavigationSection(navigationOrder, index, target)); }} onChange={(value) => {
      if (item.id !== 'routes' || value) { setSectionVisibility(item.id, value); return; }
      void readActiveRoute().then((route) => {
        if (route) Alert.alert('Finish your route first', 'Routes stays visible while a recording or unsaved route is in progress. Return to Routes to finish it.');
        else setSectionVisibility('routes', false);
      }).catch(() => Alert.alert('Could not check your route', 'Try again before hiding Routes.'));
    }} />; })}</View>
  </ScrollView></SafeAreaView>;
}

function SettingRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{label}</Text><Text style={styles.rowText}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.accentSoft }} thumbColor={value ? colors.accent : colors.textDim} /></View>;
}

function NavigationSettingRow({ pinned, index, count, label, description, value, onChange, onDragStart, onDragEnd }: { pinned: boolean; index: number; count: number; label: string; description: string; value: boolean; onChange: (value: boolean) => void; onDragStart: () => void; onDragEnd: (offset: number) => void }) {
  const [displacement] = useState(() => new Animated.Value(0));
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: onDragStart,
    onPanResponderMove: (_, gesture) => displacement.setValue(gesture.dy),
    onPanResponderRelease: (_, gesture) => { displacement.setValue(0); onDragEnd(gesture.dy); },
    onPanResponderTerminate: () => { displacement.setValue(0); onDragEnd(0); },
  }), [displacement, onDragStart, onDragEnd]);
  return <View style={styles.row}>
    <Animated.View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`Reorder ${label}, position ${index + 1} of ${count}`} accessibilityHint="Drag to reorder, or use accessibility actions" accessibilityActions={[{ name: 'increment', label: 'Move right' }, { name: 'decrement', label: 'Move left' }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'increment' && index < count - 1) onDragEnd(78); if (event.nativeEvent.actionName === 'decrement' && index > 0) onDragEnd(-78); }} style={[styles.dragHandle, { transform: [{ translateY: displacement }] }]}><Text style={styles.dragText}>☰</Text></Animated.View>
    <View style={styles.rowBody}><View style={styles.pinRow}><Text style={styles.rowTitle}>{label}</Text>{pinned && <Text style={styles.pinTag}>In bar</Text>}</View><Text style={styles.rowText}>{description}</Text></View>
    <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.accentSoft }} thumbColor={value ? colors.accent : colors.textDim} />
  </View>;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. No data was changed.';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 50 },
  section: { color: colors.text, fontSize: 18, fontFamily: font.semibold, marginTop: 26, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, overflow: 'hidden' },
  whatsNewCard: { marginTop: 14 },
  backupCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg },
  backupTitle: { color: colors.text, fontSize: 16, fontFamily: font.bold },
  backupText: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 17, marginTop: 6 },
  primary: { backgroundColor: colors.settingsNav, borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 16 },
  primaryText: { color: colors.background, fontSize: 12, fontFamily: font.bold },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 14, marginTop: 10 },
  privacyPolicyLink: { marginBottom: spacing.md },
  secondaryText: { color: colors.text, fontSize: 12, fontFamily: font.semibold },
  disabled: { opacity: 0.55 },
  privacy: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, lineHeight: 14, marginTop: 12 },
  row: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomColor: colors.border, borderBottomWidth: 1 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, pinTag: { color: colors.accent, fontSize: 11, fontFamily: font.bold, borderRadius: 999, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
  navHint: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 17, marginBottom: 10 },
  dragHandle: { alignItems: 'center', justifyContent: 'center', width: 40, height: 48, borderRadius: 10, backgroundColor: colors.surfaceRaised, zIndex: 1 },
  dragText: { color: colors.textMuted, fontSize: 18, fontFamily: font.semibold },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 13, fontFamily: font.semibold },
  rowText: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 15, marginTop: 3 },
});
