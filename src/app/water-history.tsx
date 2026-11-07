import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HistoryPages } from '@/components/history-pages';
import { localDateKey } from '@/lib/progress';
import { WaterUnit, validWaterDate, waterDisplayAmount, waterGoalOn, waterToOunces, waterTotalOn } from '@/lib/water-habit';
import { WaterLog } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';
import { DateField } from '@/components/date-field';
import { isoToUs } from '@/lib/us-date';

export default function WaterHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trackers, waterLogs = [], saveWaterDrink, deleteWaterDrink } = useTrackers();
  const tracker = trackers.find((item) => item.id === id && item.habitTemplate === 'water');
  const unit = tracker?.waterDisplayUnit ?? 'fl oz';
  const logs = waterLogs.filter((log) => log.trackerId === id).sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.recordedAt.localeCompare(a.recordedAt));
  const [editing, setEditing] = useState<WaterLog | null>(null);
  const [date, setDate] = useState(localDateKey());
  const [ounces, setOunces] = useState('');
  const [entryUnit, setEntryUnit] = useState<WaterUnit>(unit);
  const [error, setError] = useState('');
  if (!tracker) return <SafeAreaView style={styles.safe}><Text style={styles.body}>Water habit not found.</Text></SafeAreaView>;
  const reset = () => { setEditing(null); setDate(localDateKey()); setOunces(''); setEntryUnit(unit); setError(''); };
  const save = () => {
    if (!validWaterDate(date) || date > localDateKey()) { setError('Enter a valid date through today as MM/DD/YYYY.'); return; }
    const amount = editing && ounces === waterDisplayAmount(editing.ounces, entryUnit)
      ? editing.ounces : waterToOunces(Number(ounces), entryUnit);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) { setError('Enter a valid amount greater than zero.'); return; }
    saveWaterDrink({ id: editing?.id ?? `water-${Date.now()}-${Math.random().toString(36).slice(2)}`, trackerId: tracker.id, eventDate: date, ounces: amount, recordedAt: editing?.recordedAt ?? new Date().toISOString() });
    reset();
  };
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Water history</Text><Text style={styles.body}>Add or correct individual drinks. Past daily totals use the goal saved for that date.</Text>
    <View style={styles.card}><Text style={styles.sectionTitle}>{editing ? 'Edit drink' : 'Add a past drink'}</Text>
      <Text style={styles.label}>DATE · MM/DD/YYYY</Text><DateField accessibilityLabel="Drink date" value={date} onChangeText={setDate} placeholderTextColor={colors.textDim} style={styles.input} />
      <Text style={styles.label}>AMOUNT · {entryUnit}</Text><View style={styles.row}>{(['fl oz', 'mL'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: entryUnit === choice }} onPress={() => { const value = Number(ounces); setOunces(ounces.trim() && Number.isFinite(value) ? waterDisplayAmount(waterToOunces(value, entryUnit), choice) : ''); setEntryUnit(choice); }} style={[styles.action, entryUnit === choice && styles.selected]}><Text style={styles.secondaryText}>{choice}</Text></Pressable>)}</View><TextInput accessibilityLabel={`Drink amount in ${entryUnit}`} keyboardType="decimal-pad" value={ounces} onChangeText={setOunces} placeholder={entryUnit === 'mL' ? 'e.g. 250' : 'e.g. 8'} placeholderTextColor={colors.textDim} style={styles.input} />
      {error ? <Text style={styles.error}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={save} style={styles.button}><Text style={styles.buttonText}>{editing ? 'Save correction' : 'Add drink'}</Text></Pressable>
      {editing && <Pressable accessibilityRole="button" onPress={reset} style={styles.secondary}><Text style={styles.secondaryText}>Cancel edit</Text></Pressable>}
    </View>
    {!logs.length && <Text style={styles.body}>No drinks logged yet.</Text>}
    <HistoryPages items={logs} pageSize={10}>{(page) => page.map((log) => <View key={log.id} style={styles.card}>
      <Text style={styles.sectionTitle}>{waterDisplayAmount(log.ounces, unit)} {unit} · {isoToUs(log.eventDate)}</Text>
      <Text style={styles.body}>Day total: {waterDisplayAmount(waterTotalOn(waterLogs, tracker.id, log.eventDate), unit)} {unit} · Goal: {waterGoalOn(tracker, log.eventDate) === null ? 'Not set' : `${waterDisplayAmount(waterGoalOn(tracker, log.eventDate)!, unit)} ${unit}`}</Text>
      <View style={styles.row}><Pressable accessibilityRole="button" onPress={() => { setEditing(log); setDate(log.eventDate); setEntryUnit(unit); setOunces(waterDisplayAmount(log.ounces, unit)); setError(''); }} style={styles.action}><Text style={styles.secondaryText}>Edit</Text></Pressable><Pressable accessibilityRole="button" onPress={() => Alert.alert('Delete this drink?', 'This will update that day’s total and progress.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { deleteWaterDrink(log.id); if (editing?.id === log.id) reset(); } }])} style={styles.action}><Text style={styles.error}>Delete</Text></Pressable></View>
    </View>)}</HistoryPages>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 50, gap: 14 },
  title: { color: colors.text, fontSize: 26, fontFamily: font.bold }, body: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 20 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 17, gap: 10 }, sectionTitle: { color: colors.text, fontSize: 17, fontFamily: font.semibold }, label: { color: colors.textDim, fontSize: 11, fontFamily: font.semibold },
  input: { color: colors.text, minHeight: 50, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, fontSize: 16 , fontFamily: font.regular}, error: { color: colors.danger, fontSize: 13 , fontFamily: font.regular}, button: { minHeight: 48, backgroundColor: colors.habitsNav, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: colors.background, fontFamily: font.bold, fontSize: 15 }, secondary: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: colors.text, fontFamily: font.semibold }, row: { flexDirection: 'row', gap: 10 }, action: { flex: 1, minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, selected: { borderColor: colors.habitsNav, backgroundColor: colors.accentSoft },
});
