import { HistoryPages } from '@/components/history-pages';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HealthReadingModal } from '@/components/health-reading-modal';
import { localDateTimeParts } from '@/lib/health';
import { HealthReading } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function HealthHistoryScreen() {
  const { healthReadings = [], saveHealthReading, deleteHealthReading } = useTrackers();
  const [editing, setEditing] = useState<HealthReading | null>(null);
  const groups = useMemo(() => {
    const result = new Map<string, HealthReading[]>();
    [...healthReadings].sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt)).forEach((reading) => {
      const key = localDateTimeParts(reading.measuredAt).date;
      result.set(key, [...(result.get(key) ?? []), reading]);
    });
    return [...result.entries()];
  }, [healthReadings]);
  const confirmDelete = (reading: HealthReading) => Alert.alert('Delete reading?', 'This removes only this saved reading. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteHealthReading(reading.id, true) }]);
  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.intro}>All blood pressure and pulse readings, grouped by the day measured.</Text>
    <HistoryPages items={groups.flatMap(([, readings]) => readings)}>{(page) => groupReadings(page).map(([date, readings]) => <View key={date}><Text style={styles.date}>{formatDay(date)}</Text><View style={styles.card}>{readings.map((reading, index) => <View key={reading.id} style={[styles.row, index > 0 && styles.border]}>
      <View style={styles.details}><Text style={styles.time}>{new Date(reading.measuredAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}</Text><Text style={styles.value}>Blood Pressure {reading.systolic}/{reading.diastolic}</Text><Text style={styles.pulse}>Pulse {reading.pulse}</Text>{reading.note && <Text style={styles.note}>{reading.note}</Text>}</View>
      <View style={styles.actions}><Pressable onPress={() => setEditing(reading)}><Text style={styles.edit}>Edit</Text></Pressable><Pressable onPress={() => confirmDelete(reading)}><Text style={styles.delete}>Delete</Text></Pressable></View>
    </View>)}</View></View>)}</HistoryPages>
    {!groups.length && <Text style={styles.empty}>No readings recorded yet.</Text>}
  </ScrollView><HealthReadingModal key={editing?.id ?? 'none'} visible={Boolean(editing)} reading={editing} onClose={() => setEditing(null)} onSave={saveHealthReading} /></View>;
}
function groupReadings(readings: HealthReading[]) {
  const groups = new Map<string, HealthReading[]>();
  for (const reading of readings) {
    const date = localDateTimeParts(reading.measuredAt).date;
    groups.set(date, [...(groups.get(date) ?? []), reading]);
  }
  return [...groups.entries()];
}
function formatDay(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60 }, intro: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 12 }, date: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 18, marginBottom: 8 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, overflow: 'hidden' }, row: { flexDirection: 'row', padding: spacing.md }, border: { borderTopWidth: 1, borderTopColor: colors.border }, details: { flex: 1 }, time: { color: colors.textMuted, fontSize: 11 }, value: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 }, pulse: { color: colors.textMuted, fontSize: 11, marginTop: 3 }, note: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 7 }, actions: { alignItems: 'flex-end', justifyContent: 'space-around', paddingLeft: 12 }, edit: { color: colors.accent, fontSize: 11, fontWeight: '800', padding: 6 }, delete: { color: colors.danger, fontSize: 10, fontWeight: '700', padding: 6 }, empty: { color: colors.textMuted, textAlign: 'center', marginTop: 50 } });
