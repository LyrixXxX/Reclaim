import { HistoryPages } from '@/components/history-pages';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CpapReadingModal } from '@/components/cpap-reading-modal';
import { CpapReading } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function CpapHistoryScreen() {
  const { cpapReadings = [], saveCpapReading, deleteCpapReading } = useTrackers();
  const [editing, setEditing] = useState<CpapReading | null>(null);
  const readings = useMemo(() => [...cpapReadings].sort((a, b) => b.sleepDate.localeCompare(a.sleepDate)), [cpapReadings]);
  const remove = (item: CpapReading) => Alert.alert(
    'Delete CPAP night?',
    'This removes the saved values and photo reference for this night only.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCpapReading(item.id, true) },
    ],
  );

  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.intro}>Seven saved nights per page, newest first. Tap Edit to correct a reading without creating a duplicate.</Text>
    <Text style={styles.count}>{readings.length} NIGHT{readings.length === 1 ? '' : 'S'} SAVED</Text>
    <HistoryPages items={readings}>{(page) => page.map((item) => <View key={item.id} style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.rowDate}>{formatDate(item.sleepDate)}</Text>
        <Text style={styles.rowValue}>{formatMinutes(item.usedMinutes)} · AHI {item.ahi}</Text>
        <Text style={styles.rowMeta}>Pressure {item.averagePressure} avg / {item.p95Pressure} P95 cmH₂O</Text>
        <Text style={styles.rowMeta}>Leak {item.averageLeak} avg / {item.p95Leak} P95 L/min · CAI {item.cai}</Text>
        {item.note ? <Text style={styles.rowNote}>{item.note}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => setEditing(item)}><Text style={styles.edit}>Edit</Text></Pressable>
        <Pressable onPress={() => remove(item)}><Text style={styles.delete}>Delete</Text></Pressable>
      </View>
    </View>)}</HistoryPages>
    {!readings.length ? <Text style={styles.empty}>No CPAP nights have been saved yet.</Text> : null}
  </ScrollView><CpapReadingModal key={editing?.id ?? 'closed'} visible={Boolean(editing)} reading={editing} readings={cpapReadings} onClose={() => setEditing(null)} onSave={saveCpapReading} /></View>;
}

function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
function formatMinutes(value: number) { const rounded = Math.round(value); return `${Math.floor(rounded / 60)}h ${rounded % 60}m`; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60 },
  intro: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  count: { color: colors.textDim, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginTop: 18, marginBottom: 9 },
  row: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 13, marginBottom: 8 },
  rowBody: { flex: 1 },
  rowDate: { color: colors.textMuted, fontSize: 10 },
  rowValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  rowMeta: { color: colors.textMuted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  rowNote: { color: colors.textDim, fontSize: 9, lineHeight: 14, marginTop: 7 },
  actions: { alignItems: 'flex-end', paddingLeft: 10 },
  edit: { color: colors.accent, fontSize: 10, fontWeight: '800', padding: 6 },
  delete: { color: colors.danger, fontSize: 9, fontWeight: '700', padding: 6, marginTop: 6 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 50 },
});
