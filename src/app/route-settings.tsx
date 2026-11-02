import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { readRouteAutoPauseEnabled, setRouteAutoPauseEnabled } from '@/lib/route-auto-pause';
import { notifyRouteMile, readRouteMileAlertsEnabled, setRouteMileAlertsEnabled } from '@/lib/route-mile-alerts';
import { colors, layout, spacing, font } from '@/theme';

export default function RouteSettingsScreen() {
  const [mileAlerts, setMileAlerts] = useState(false);
  const [autoPause, setAutoPause] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void Promise.all([readRouteMileAlertsEnabled(), readRouteAutoPauseEnabled()])
      .then(([alerts, pause]) => { if (active) { setMileAlerts(alerts); setAutoPause(pause); } })
      .catch(() => { if (active) Alert.alert('Route settings', 'Could not load your route preferences. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  const change = async (setting: 'alerts' | 'pause', enabled: boolean) => {
    if (busy || loading) return;
    setBusy(true);
    try {
      if (setting === 'alerts') {
        await setRouteMileAlertsEnabled(enabled);
        setMileAlerts(enabled);
      } else {
        await setRouteAutoPauseEnabled(enabled);
        setAutoPause(enabled);
      }
    } catch (error) {
      Alert.alert('Setting not changed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Route settings</Text>
    <Text style={styles.intro}>Choose how Reclaim handles your recorded walks, hikes, and runs.</Text>
    <View style={styles.card}>
      <View style={styles.row}><View style={styles.copy}><Text style={styles.settingTitle}>Mile alerts</Text><Text style={styles.description}>Vibrate and show a notification at each completed mile. No voice or sound.</Text></View><Switch accessibilityLabel="Mile alerts" accessibilityRole="switch" value={mileAlerts} disabled={loading || busy} onValueChange={(value) => void change('alerts', value)} trackColor={{ false: colors.border, true: colors.activityNav }} thumbColor={colors.text} /></View>
      {mileAlerts && <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => { void notifyRouteMile(1, 'settings-test', true).then(() => Alert.alert('Test sent', 'Check your notification shade and vibration. Android sound, vibration, and Do Not Disturb settings still apply.')).catch((error) => Alert.alert('Mile alert unavailable', error instanceof Error ? error.message : 'Check Android notification settings.')); }} style={styles.testButton}><Text style={styles.testButtonText}>Send test mile alert</Text></Pressable>}
      <View style={styles.divider} />
      <View style={styles.row}><View style={styles.copy}><Text style={styles.settingTitle}>Auto Pause</Text><Text style={styles.description}>Pause route distance during a confirmed stop, then resume when movement is detected. GPS stays active; a manual pause never auto-resumes.</Text></View><Switch accessibilityLabel="Auto Pause" accessibilityRole="switch" value={autoPause} disabled={loading || busy} onValueChange={(value) => void change('pause', value)} trackColor={{ false: colors.border, true: colors.activityNav }} thumbColor={colors.text} /></View>
    </View>
    <Text style={styles.note}>Changes apply when you start your next route. A route already recording keeps the options it started with.</Text>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60, gap: spacing.md },
  title: { color: colors.text, fontSize: 27, fontFamily: font.bold },
  intro: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, lineHeight: 21 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, gap: 5 },
  settingTitle: { color: colors.text, fontSize: 17, fontFamily: font.semibold },
  description: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.border },
  note: { color: colors.textDim, fontSize: 12, fontFamily: font.regular, lineHeight: 18 },
  testButton: { alignSelf: 'flex-start', borderColor: colors.activityNav, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  testButtonText: { color: colors.text, fontSize: 12, fontFamily: font.semibold },
});
