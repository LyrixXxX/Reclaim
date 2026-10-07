import * as Location from 'expo-location';
import { OfflineManager } from '@maplibre/maplibre-react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { downloadedAreas, downloadArea, getMapKey } from '@/lib/activity-maps';
import { colors, spacing } from '@/theme';

type Areas = Awaited<ReturnType<typeof downloadedAreas>>;

export default function ActivityMapSettings() {
  const [areas, setAreas] = useState<Areas>([]);
  const [key, setKey] = useState('');
  const [radius, setRadius] = useState<3 | 6>(3);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { setAreas(await downloadedAreas()); }, []);
  useFocusEffect(useCallback(() => { void getMapKey().then(setKey); void refresh().catch(() => undefined); const timer = setInterval(() => { void refresh().catch(() => undefined); }, 3000); return () => clearInterval(timer); }, [refresh]));
  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!key) throw new Error('The Stadia Maps key is not configured in this build.');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Allow location to choose an area around your current position.');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setProgress(0);
      await downloadArea(key, location.coords.latitude, location.coords.longitude, radius, setProgress);
      await refresh();
    } catch (error) { Alert.alert('Map download', error instanceof Error ? error.message : 'The download could not start.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Offline map areas</Text>
    <Text style={styles.body}>The Activity map normally loads new areas as you move when mobile data is available. GPS route recording does not require map imagery.</Text>
    <Text style={styles.body}>Download an area before a trip if you need map imagery without service. Only a completed download is marked Ready. Maps are an orientation aid, not guaranteed emergency navigation.</Text>
    {!key && <Text style={styles.warning}>This build has no Stadia Maps key. Set EXPO_PUBLIC_STADIA_MAPS_KEY before building to enable maps.</Text>}
    <View style={styles.card}><Text style={styles.heading}>Download around current location</Text><View style={styles.row}>{([3, 6] as const).map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => setRadius(value)} style={[styles.choice, radius === value && styles.chosen]}><Text style={styles.label}>{value} mi radius</Text></Pressable>)}</View><Pressable accessibilityRole="button" disabled={busy || !key || !!areas.length} onPress={() => void download()} style={[styles.button, (busy || !key || !!areas.length) && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Starting download…' : 'Download area'}</Text></Pressable>{progress !== null && <Text style={styles.body}>Download progress: {Math.round(progress)}%</Text>}</View>
    {areas.map(({ pack, status }) => <View key={pack.id} style={styles.card}><Text style={styles.heading}>{String(pack.metadata.label ?? 'Saved area')}</Text><Text style={styles.body}>{status.state === 'complete' ? 'Ready for offline use' : `Incomplete · ${Math.round(status.percentage)}%`}</Text><Pressable accessibilityRole="button" onPress={() => Alert.alert('Remove downloaded area?', 'You can download it again later.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { void OfflineManager.deletePack(pack.id).then(refresh).catch((error: unknown) => Alert.alert('Could not remove area', String(error))); } }])}><Text style={styles.remove}>Remove area</Text></Pressable></View>)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 16 }, title: { color: colors.text, fontSize: 28, fontWeight: '800' }, body: { color: colors.textMuted, lineHeight: 21 }, warning: { color: colors.danger }, card: { padding: 18, gap: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, row: { flexDirection: 'row', gap: 10 }, choice: { flex: 1, padding: 12, borderWidth: 1, borderRadius: 12, borderColor: colors.border }, chosen: { borderColor: colors.activityNav }, label: { color: colors.text, textAlign: 'center' }, button: { backgroundColor: colors.activityNav, padding: 14, borderRadius: 12 }, buttonText: { color: colors.background, fontWeight: '800', textAlign: 'center' }, disabled: { opacity: 0.5 }, remove: { color: colors.danger, fontWeight: '700' } });
