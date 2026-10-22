import { HistoryPages } from '@/components/history-pages';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { WeightChart } from '@/components/weight-chart';
import { MainScreenHeader } from '@/components/main-screen-header';
import { ActivityRoute, NutritionEntry, StepDay, WeightEntry, WeightTdeeProfile } from '@/models/tracker';
import { parseWeightExport, weightHistoryChronological, weightStats } from '@/lib/weight';
import { readStepHistory } from '@/lib/activity-step-history';
import { estimateDailyTdee, feetInchesFromCm, heightCmFromFeetInches, previousDayCalories, previousLocalDate, validTdeeProfile } from '@/lib/weight-tdee';
import { dashboardDate } from '@/lib/dashboard-content';
import { localDateKey } from '@/lib/progress';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

const numberValue = (value: string) => value.trim() ? Number(value) : null;

export default function WeightScreen() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { weightEntries = [], nutritionEntries = [], activityRoutes = [], weightTdeeProfile, importWeightHistory, saveWeightEntry, deleteWeightEntry, saveWeightTdeeProfile } = useTrackers();
  const [editing, setEditing] = useState<WeightEntry | null>(null); const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stepDays, setStepDays] = useState<StepDay[]>([]);
  const [showImport, setShowImport] = useState(false);
  useFocusEffect(useCallback(() => { if (add === '1') { setEditing(null); setFormOpen(true); router.setParams({ add: '' }); } }, [add]));
  const stats = useMemo(() => weightStats(weightEntries), [weightEntries]);
  const ordered = useMemo(() => weightHistoryChronological(weightEntries), [weightEntries]);
  useEffect(() => { if (formOpen) readStepHistory().then(setStepDays).catch(() => setStepDays([])); }, [formOpen]);

  const chooseImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const parsed = parseWeightExport(await new File(result.assets[0].uri).text());
      const existingDates = new Set(weightEntries.map((entry) => entry.date));
      const newCount = parsed.entries.filter((entry) => !existingDates.has(entry.date)).length;
      const duplicateCount = parsed.entries.length - newCount;
      Alert.alert('Import weight history?', `${parsed.entries.length} valid entries found\n${newCount} new · ${duplicateCount} already in Reclaim\n\nYour original Weight Tracker data will not be changed.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', onPress: () => { const summary = importWeightHistory(parsed); Alert.alert('Import complete', `${summary.added} entries added. ${summary.duplicates} duplicates safely skipped.`); } },
      ]);
    } catch (error) { Alert.alert('Could not import', error instanceof Error ? error.message : 'The selected file could not be read.'); }
  };

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <MainScreenHeader eyebrow="WEIGHT OVERVIEW" subtitle="Your weigh-ins, goals, and long-term trends together in Reclaim." accent={colors.weightNav} />
    {stats ? <View style={styles.hero}>
      <Text style={styles.heroLabel}>LATEST RECORDED WEIGHT</Text>
      <Text style={styles.subtitle}>{dashboardDate(stats.latestDate)}</Text>
      <Text style={styles.heroValue}>{format(stats.current)} <Text style={styles.unit}>{ordered.at(-1)?.unit ?? 'lb'}</Text></Text>
      <View style={styles.stats}><Stat label="7-DAY AVG" value={format(stats.sevenDayAverage)} /><Stat label="CHANGE" value={`${stats.change > 0 ? '+' : ''}${format(stats.change)}`} /><Stat label="LOWEST" value={format(stats.lowest)} /></View>
      <Text style={styles.subtitle}>Average: {stats.averageReadings} recorded {stats.averageReadings === 1 ? 'reading' : 'readings'} in the 7 days ending {dashboardDate(stats.latestDate)}. Missing days are excluded.</Text>
    </View> : <View style={styles.hero}><Text style={styles.heroLabel}>WEIGHT HISTORY</Text><Text style={styles.empty}>Import your existing Weight Tracker history to get started.</Text></View>}
    <Pressable style={styles.primary} onPress={() => { setEditing(null); setFormOpen(true); }}><Text style={styles.primaryText}>+ Add Weigh-in</Text></Pressable>
    <Pressable style={styles.importButton} onPress={() => setSettingsOpen(true)}><Text style={styles.importText}>{weightTdeeProfile ? 'Edit TDEE estimate setup' : 'Set up TDEE estimate'}</Text></Pressable>
    {!ordered.length && <Pressable style={styles.importButton} onPress={chooseImport}><Text style={styles.importText}>Import from Weight Tracker</Text></Pressable>}
    <WeightChart entries={weightEntries} />
    <Text style={styles.sectionTitle}>Weight history</Text><View style={styles.list}><HistoryPages key={ordered.length ? 'with-entries' : 'empty'} items={ordered} startAt="last">{(page) => page.map((entry) => <Pressable key={entry.id} onPress={() => { setEditing(entry); setFormOpen(true); }} style={styles.row}><View><Text style={styles.date}>{new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text><Text style={styles.meta}>{entry.caloriesEaten ?? '—'} eaten · {entry.estimatedBurn ?? '—'} burn{entry.source === 'health-connect' ? ` · Health Connect (${entry.sourceApp ?? 'connected app'})` : ''}</Text>{entry.notes ? <Text style={styles.note}>{entry.notes}</Text> : null}</View><Text style={styles.rowWeight}>{format(entry.weight)} {entry.unit}</Text></Pressable>)}</HistoryPages>{!ordered.length && <Text style={styles.empty}>No entries recorded yet.</Text>}</View>
    {ordered.length > 0 && <>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showImport }} onPress={() => setShowImport((value) => !value)} style={styles.importButton}><Text style={styles.importText}>Transfer from old Weight Tracker {showImport ? '−' : '+'}</Text></Pressable>
      {showImport && <Pressable style={styles.importButton} onPress={chooseImport}><Text style={styles.importText}>Choose Weight Tracker export</Text></Pressable>}
    </>}
    <Text style={styles.disclaimer}>Personal tracking only. Reclaim does not provide medical advice.</Text>
  </ScrollView>{formOpen ? <WeightEntryModal entry={editing} nutritionEntries={nutritionEntries} routes={activityRoutes} steps={stepDays} profile={weightTdeeProfile} onClose={() => setFormOpen(false)} onSave={(entry) => { saveWeightEntry(entry); setFormOpen(false); }} onDelete={editing ? () => Alert.alert('Delete weigh-in?', `Remove the entry for ${editing.date}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { deleteWeightEntry(editing.date, true); setFormOpen(false); } }]) : undefined} /> : null}{settingsOpen ? <TdeeSettingsModal profile={weightTdeeProfile} onClose={() => setSettingsOpen(false)} onSave={(profile) => { saveWeightTdeeProfile(profile); setSettingsOpen(false); }} /> : null}</SafeAreaView>;
}

function WeightEntryModal({ entry, nutritionEntries, routes, steps, profile, onClose, onSave, onDelete }: {
  entry: WeightEntry | null; nutritionEntries: NutritionEntry[]; routes: ActivityRoute[]; steps: StepDay[];
  profile?: WeightTdeeProfile; onClose: () => void;
  onSave: (entry: Omit<WeightEntry, 'id' | 'recordedAt'>) => void; onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(entry?.date ?? localDateKey());
  const [weight, setWeight] = useState(entry ? String(entry.weight) : '');
  const [calories, setCalories] = useState(entry?.caloriesEaten == null ? '' : String(entry.caloriesEaten));
  const [burn, setBurn] = useState(entry?.estimatedBurn == null ? '' : String(entry.estimatedBurn));
  const [caloriesEdited, setCaloriesEdited] = useState(Boolean(entry));
  const [burnEdited, setBurnEdited] = useState(Boolean(entry));
  const [goal, setGoal] = useState(entry?.goal == null ? '' : String(entry.goal));
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const activityDate = previousLocalDate(date);
  const suggestedCalories = previousDayCalories(nutritionEntries, date);
  const estimate = profile ? estimateDailyTdee({ profile, weighInDate: date, weight: Number(weight), unit: entry?.unit ?? 'lb', steps, routes }) : null;
  const displayedCalories = caloriesEdited ? calories : suggestedCalories == null ? '' : String(suggestedCalories);
  const displayedBurn = burnEdited ? burn : estimate ? String(estimate.total) : '';
  const save = () => {
    const amount = Number(weight);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00`)) || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Check the entry', 'Enter a valid date and weight.'); return;
    }
    const eaten = numberValue(displayedCalories); const expenditure = numberValue(displayedBurn);
    if ((eaten !== null && (!Number.isFinite(eaten) || eaten < 0)) || (expenditure !== null && (!Number.isFinite(expenditure) || expenditure < 0))) {
      Alert.alert('Check calories', 'Enter valid non-negative calorie values, or leave the fields blank.'); return;
    }
    onSave({ date, weight: amount, unit: entry?.unit ?? 'lb', caloriesEaten: eaten, estimatedBurn: expenditure, goal: numberValue(goal), notes: notes.trim() });
  };
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.modal}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 240 }]}>
    <Text style={styles.modalTitle}>{entry ? 'Edit weigh-in' : 'Add weigh-in'}</Text>
    <Text style={styles.fieldLabel}>Date</Text><TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>Weight ({entry?.unit ?? 'lb'})</Text><TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="Weight" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>Calories eaten on {activityDate || 'previous day'} (optional)</Text><TextInput value={displayedCalories} onChangeText={(value) => { setCaloriesEdited(true); setCalories(value); }} keyboardType="decimal-pad" placeholder={suggestedCalories == null ? 'No food logged' : 'Calories'} placeholderTextColor={colors.textDim} style={styles.input} />
    {!entry && !caloriesEdited && <Text style={estimateStyles.note}>{suggestedCalories == null ? 'No food logged in Nutrition for that day; left blank.' : 'Suggested from Nutrition. You can change or clear this value.'}</Text>}
    <Text style={styles.fieldLabel}>Estimated burn / TDEE for {activityDate || 'previous day'} (optional)</Text><TextInput value={displayedBurn} onChangeText={(value) => { setBurnEdited(true); setBurn(value); }} keyboardType="number-pad" placeholder="Estimated burn" placeholderTextColor={colors.textDim} style={styles.input} />
    {estimate ? <View style={estimateStyles.card}><Text style={estimateStyles.title}>Estimated TDEE · {estimate.total.toLocaleString()} kcal</Text><Text style={estimateStyles.line}>BMR {estimate.bmr} + ordinary activity {estimate.ordinaryActivity}</Text><Text style={estimateStyles.line}>Other steps {estimate.stepCalories} + saved routes {estimate.routeCalories}</Text><Text style={estimateStyles.line}>Food digestion {estimate.foodDigestion} kcal</Text><Text style={estimateStyles.note}>{estimate.stepStatus === 'recorded' ? `${estimate.remainingSteps.toLocaleString()} steps outside saved routes` : estimate.stepStatus === 'partial' ? 'Step tracking was partial; the walking estimate may be low.' : 'No step total for this day; only saved routes contribute movement.'} Ordinary activity is estimated at 10% of BMR, digestion at 10% of TDEE, and route-overlap steps from approximate stride length. These are not measured calories.</Text></View>
      : <Text style={estimateStyles.note}>{profile ? 'Enter a valid date and weight to see the estimate.' : 'Optional TDEE setup is available on the Weight overview.'}</Text>}
    <Text style={styles.fieldLabel}>Goal weight (optional)</Text><TextInput value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="Goal" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>Notes (optional)</Text><TextInput value={notes} onChangeText={setNotes} multiline placeholder="Notes" placeholderTextColor={colors.textDim} style={[styles.input, styles.notes]} />
    <Pressable style={styles.primary} onPress={save}><Text style={styles.primaryText}>Save weigh-in</Text></Pressable><Pressable style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>{onDelete ? <Pressable style={styles.delete} onPress={onDelete}><Text style={styles.deleteText}>Delete this weigh-in</Text></Pressable> : null}
  </ScrollView></SafeAreaView></Modal>;
}

function TdeeSettingsModal({ profile, onClose, onSave }: { profile?: WeightTdeeProfile; onClose: () => void; onSave: (profile: WeightTdeeProfile) => void }) {
  const insets = useSafeAreaInsets();
  const savedHeight = profile ? feetInchesFromCm(profile.heightCm) : null;
  const [feet, setFeet] = useState(savedHeight ? String(savedHeight.feet) : '');
  const [inches, setInches] = useState(savedHeight ? String(savedHeight.inches) : '');
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [formulaSex, setFormulaSex] = useState<WeightTdeeProfile['formulaSex']>(profile?.formulaSex ?? 'male');
  const save = () => {
    const heightCm = feet.trim() && inches.trim() ? heightCmFromFeetInches(Number(feet), Number(inches)) : null;
    const next = { heightCm: heightCm ?? 0, birthDate, formulaSex };
    if (!validTdeeProfile(next)) { Alert.alert('Check TDEE setup', 'Enter a valid height in feet and inches (0–11.9 inches), birth date, and formula choice.'); return; }
    onSave(next);
  };
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.modal}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 60 }]}>
    <Text style={styles.modalTitle}>TDEE estimate setup</Text><Text style={styles.subtitle}>Optional and stored on this device. The formula choice is used only for the BMR calculation.</Text>
    <Text style={styles.fieldLabel}>Height</Text><View style={estimateStyles.formulaRow}><View style={estimateStyles.heightField}><TextInput value={feet} onChangeText={setFeet} keyboardType="number-pad" placeholder="Feet" placeholderTextColor={colors.textDim} style={styles.input} /></View><View style={estimateStyles.heightField}><TextInput value={inches} onChangeText={setInches} keyboardType="decimal-pad" placeholder="Inches" placeholderTextColor={colors.textDim} style={styles.input} /></View></View>
    <Text style={styles.fieldLabel}>Birth date</Text><TextInput value={birthDate} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>Mifflin–St Jeor formula</Text><View style={estimateStyles.formulaRow}>{(['male', 'female'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: formulaSex === choice }} onPress={() => setFormulaSex(choice)} style={[estimateStyles.formulaChoice, formulaSex === choice && estimateStyles.formulaSelected]}><Text style={styles.importText}>{choice === 'male' ? 'Male formula' : 'Female formula'}</Text></Pressable>)}</View>
    <Text style={estimateStyles.note}>This predicts resting energy expenditure. Reclaim adds estimated ordinary activity, non-route steps, saved routes and digestion for a daily TDEE estimate. It will not change older weigh-ins or Nutrition targets.</Text>
    <Pressable style={styles.primary} onPress={save}><Text style={styles.primaryText}>Save estimate setup</Text></Pressable><Pressable style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>
  </ScrollView></SafeAreaView></Modal>;
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 36 }, eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.7, fontWeight: '800', marginTop: 24 }, title: { color: colors.text, fontSize: 38, fontWeight: '900', marginTop: 8 }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 }, hero: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 24 }, heroLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1.2, fontWeight: '800' }, heroValue: { color: colors.text, fontSize: 44, fontWeight: '900', marginTop: 8 }, unit: { color: colors.textMuted, fontSize: 18 }, stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16, paddingTop: 14 }, stat: { flex: 1, alignItems: 'center' }, statValue: { color: colors.text, fontSize: 16, fontWeight: '800' }, statLabel: { color: colors.textDim, fontSize: 8, fontWeight: '800', marginTop: 4 }, primary: { backgroundColor: colors.accent, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 14 }, primaryText: { color: colors.background, fontWeight: '900', fontSize: 13 }, importButton: { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 10 }, importText: { color: colors.text, fontWeight: '800', fontSize: 12 }, sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 26, marginBottom: 10 }, list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, paddingHorizontal: spacing.md }, row: { minHeight: 64, flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, date: { color: colors.text, fontSize: 13, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 10, marginTop: 4 }, note: { color: colors.textMuted, fontSize: 10, marginTop: 4 }, rowWeight: { color: colors.text, fontSize: 15, fontWeight: '900' }, empty: { color: colors.textMuted, fontSize: 12, lineHeight: 19, paddingVertical: 18 }, disclaimer: { color: colors.textDim, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 24 }, modal: { flex: 1, backgroundColor: colors.background }, modalContent: { flexGrow: 1, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: 24 }, modalTitle: { color: colors.text, fontSize: 28, fontWeight: '900', marginBottom: 10 }, fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 5 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 }, notes: { minHeight: 88, textAlignVertical: 'top' }, cancel: { borderColor: colors.border, borderWidth: 1, borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 10 }, cancelText: { color: colors.text, fontWeight: '800' }, delete: { alignItems: 'center', paddingVertical: 14, marginTop: 18 }, deleteText: { color: colors.danger, fontSize: 12, fontWeight: '700' } });
const estimateStyles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginTop: 12 },
  title: { color: colors.weightNav, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  line: { color: colors.text, fontSize: 12, lineHeight: 20 },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 10 },
  formulaRow: { flexDirection: 'row', gap: 10 },
  heightField: { flex: 1 },
  formulaChoice: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  formulaSelected: { borderColor: colors.weightNav },
});
