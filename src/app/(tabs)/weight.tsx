import { PersonalDetailsModal } from '@/components/personal-details';
import { HistoryPages } from '@/components/history-pages';
import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { WeightChart } from '@/components/weight-chart';
import { MainScreenHeader } from '@/components/main-screen-header';
import { ActivityRoute, NutritionEntry, StepDay, WeightEntry, WeightTdeeProfile } from '@/models/tracker';
import { latestWeightGoal, weightHistoryChronological, weightStats } from '@/lib/weight';
import { shouldOfferWeightSaveAd } from '@/lib/ad-frequency';
import { suggestedMacroUpdate, weightPounds } from '@/lib/macro-targets';
import { goalForDate } from '@/lib/nutrition';
import { readStepHistory } from '@/lib/activity-step-history';
import { estimateDailyTdee, previousDayCalories, previousLocalDate, validTdeeProfile } from '@/lib/weight-tdee';
import { dashboardDate } from '@/lib/dashboard-content';
import { localDateKey } from '@/lib/progress';
import { useTrackers } from '@/state/tracker-context';
import { useAds } from '@/state/ads-context';
import { colors, layout, spacing, font } from '@/theme';
import { DateField } from '@/components/date-field';
import { Chevron } from '@/components/icon';

const numberValue = (value: string) => value.trim() ? Number(value) : null;

export default function WeightScreen() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { weightEntries = [], nutritionEntries = [], nutritionGoals = [], activityRoutes = [], weightTdeeProfile, macroUpdateDismissedWeightLb, saveWeightEntry, deleteWeightEntry, saveWeightTdeeProfile, dismissMacroUpdate } = useTrackers();
  const { showCompletionAd } = useAds();
  const [editing, setEditing] = useState<WeightEntry | null>(null); const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stepDays, setStepDays] = useState<StepDay[]>([]);
  useFocusEffect(useCallback(() => { if (add === '1') { setEditing(null); setFormOpen(true); router.setParams({ add: '' }); } }, [add, setEditing, setFormOpen]));
  const stats = useMemo(() => weightStats(weightEntries), [weightEntries]);
  const ordered = useMemo(() => weightHistoryChronological(weightEntries), [weightEntries]);
  useFocusEffect(useCallback(() => {
    let active = true;
    readStepHistory().then((days) => { if (active) setStepDays(days); }).catch(() => { if (active) setStepDays([]); });
    return () => { active = false; };
  }, []));
  const latestWeight = ordered.at(-1);
  const newestFirst = useMemo(() => weightHistoryChronological(weightEntries).reverse(), [weightEntries]);
  const goalWeight = latestWeightGoal(weightEntries);
  const unitLabel = latestWeight?.unit ?? 'lb';
  const currentMacroGoal = goalForDate(nutritionGoals, localDateKey());
  // The React Compiler memoizes this.
  const tdee = weightTdeeProfile && latestWeight
    ? estimateDailyTdee({ profile: weightTdeeProfile, weighInDate: localDateKey(new Date()), weight: latestWeight.weight, unit: latestWeight.unit, steps: stepDays, routes: activityRoutes })
    : null;

  const saveWeighIn = (entry: Omit<WeightEntry, 'id' | 'recordedAt'>) => {
    const today = localDateKey();
    const offerAd = shouldOfferWeightSaveAd(entry.date, today, !!editing, weightEntries.map((item) => item.date));
    const macroUpdate = suggestedMacroUpdate(currentMacroGoal, entry, today, macroUpdateDismissedWeightLb);
    saveWeightEntry(entry);
    setFormOpen(false);
    setTimeout(() => {
      const promptMacroUpdate = () => {
        if (!macroUpdate) return;
        const pounds = weightPounds(entry.weight, entry.unit);
        Alert.alert('Review updated macro split?', 'Your weight has changed by at least 2% since the last accepted split. Your calorie target will stay the same, and no macros change unless you review and save them.', [
          { text: 'Not now', style: 'cancel', onPress: () => dismissMacroUpdate(pounds) },
          { text: 'Review in Macros', onPress: () => router.push({ pathname: '/nutrition-settings', params: { reviewWeight: String(entry.weight), reviewUnit: entry.unit } }) },
        ]);
      };
      if (offerAd) void showCompletionAd('weight').catch(() => undefined).then(promptMacroUpdate);
      else promptMacroUpdate();
    }, 300);
  };

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <MainScreenHeader title="Weight" subtitle="Your weigh-ins, goals, and long-term trends." accent={colors.weightNav} />
    {stats ? <View style={styles.hero}>
      <Text style={styles.heroLabel}>LATEST RECORDED WEIGHT</Text>
      <Text style={styles.subtitle}>{dashboardDate(stats.latestDate)}</Text>
      <Text style={styles.heroValue}>{format(stats.current)} <Text style={styles.unit}>{ordered.at(-1)?.unit ?? 'lb'}</Text></Text>
      {goalWeight !== undefined && <Text style={styles.goalLine}>{goalText(stats.current, goalWeight, unitLabel)}</Text>}
      <View style={styles.stats}><Stat label="7-DAY AVG" value={`${format(stats.sevenDayAverage)} ${unitLabel}`} /><Stat label={`SINCE ${shortDate(ordered[0].date).toUpperCase()}`} value={`${stats.change > 0 ? '+' : ''}${format(stats.change)} ${unitLabel}`} /><Stat label="LOWEST" value={`${format(stats.lowest)} ${unitLabel}`} /></View>
      <Text style={styles.subtitle}>7-day average from {stats.averageReadings} {stats.averageReadings === 1 ? 'weigh-in' : 'weigh-ins'}.</Text>
    </View> : <View style={styles.hero}><Text style={styles.heroLabel}>WEIGHT HISTORY</Text><Text style={styles.empty}>Add your first weigh-in to get started.</Text></View>}
    <Pressable style={styles.primary} onPress={() => { setEditing(null); setFormOpen(true); }}><Text style={styles.primaryText}>+ Add Weigh-in</Text></Pressable>
    <Pressable style={styles.importButton} onPress={() => setSettingsOpen(true)}><Text style={styles.importText}>{weightTdeeProfile ? 'Edit TDEE estimate setup' : 'Set up TDEE estimate'}</Text></Pressable>
    {tdee ? <View style={tdeeStyles.card}>
      <Text style={styles.heroLabel}>ESTIMATED DAILY ENERGY BURN</Text>
      <Text style={tdeeStyles.total}>{tdee.total.toLocaleString()} <Text style={tdeeStyles.unit}>kcal</Text></Text>
      <Text style={styles.subtitle}>Estimate for {dashboardDate(tdee.activityDate)} using your latest recorded weight. Not a measured burn or a nutrition goal.</Text>
      <TdeeRow label="BMR (resting)" value={tdee.bmr} />
      <TdeeRow label="Ordinary activity" value={tdee.ordinaryActivity} />
      <TdeeRow label="Phone steps outside Routes" value={tdee.stepCalories} />
      <TdeeRow label="Routes" value={tdee.routeCalories} />
      <TdeeRow label="Food digestion estimate" value={tdee.foodDigestion} />
      {tdee.stepStatus !== 'recorded' && <Text style={styles.subtitle}>{tdee.stepStatus === 'missing' ? 'No phone step data for this day; the estimate may be low.' : 'Phone step data for this day is incomplete.'}</Text>}
    </View> : null}
    <WeightChart entries={weightEntries} />
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: historyOpen }} accessibilityLabel={`Weight history, ${ordered.length} ${ordered.length === 1 ? 'weigh-in' : 'weigh-ins'}`} onPress={() => setHistoryOpen(!historyOpen)} style={styles.historyHeader}>
      <View style={{ flex: 1 }}><Text style={styles.historyTitle}>Weight history</Text><Text style={styles.historyMeta}>{ordered.length ? `${ordered.length} ${ordered.length === 1 ? 'weigh-in' : 'weigh-ins'} · latest ${shortDate(ordered.at(-1)!.date)}` : 'No weigh-ins yet'}</Text></View>
      <Chevron direction={historyOpen ? 'up' : 'down'} size={20} color={colors.textMuted} />
    </Pressable>
    {historyOpen && <View style={styles.list}><HistoryPages key={ordered.length ? 'with-entries' : 'empty'} items={newestFirst}>{(page) => page.map((entry) => <Pressable key={entry.id} onPress={() => { setEditing(entry); setFormOpen(true); }} style={styles.row}><View><Text style={styles.date}>{new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>{rowMeta(entry) ? <Text style={styles.meta}>{rowMeta(entry)}</Text> : null}{entry.notes ? <Text style={styles.note}>{entry.notes}</Text> : null}</View><Text style={styles.rowWeight}>{format(entry.weight)} {entry.unit}</Text></Pressable>)}</HistoryPages>{!ordered.length && <Text style={styles.empty}>No entries recorded yet.</Text>}</View>}
    <Text style={styles.disclaimer}>Personal tracking only. Reclaim does not provide medical advice.</Text>
  </ScrollView>{formOpen ? <WeightEntryModal entry={editing} allEntries={weightEntries} nutritionEntries={nutritionEntries} routes={activityRoutes} steps={stepDays} profile={weightTdeeProfile} onClose={() => setFormOpen(false)} onSave={saveWeighIn} onDelete={editing ? () => Alert.alert('Delete weigh-in?', `Remove the entry for ${editing.date}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { deleteWeightEntry(editing.date, true); setFormOpen(false); } }]) : undefined} /> : null}{settingsOpen ? <TdeeSettingsModal profile={weightTdeeProfile} onClose={() => setSettingsOpen(false)} onSave={(profile) => { saveWeightTdeeProfile(profile); setSettingsOpen(false); }} /> : null}</SafeAreaView>;
}

function TdeeRow({ label, value }: { label: string; value: number }) {
  return <View style={tdeeStyles.row}><Text style={tdeeStyles.rowLabel}>{label}</Text><Text style={tdeeStyles.rowValue}>{value.toLocaleString()} kcal</Text></View>;
}

function WeightEntryModal({ entry, allEntries, nutritionEntries, routes, steps, profile, onClose, onSave, onDelete }: {
  entry: WeightEntry | null; allEntries: WeightEntry[]; nutritionEntries: NutritionEntry[]; routes: ActivityRoute[]; steps: StepDay[];
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
  const [moreOpen, setMoreOpen] = useState(Boolean(entry && (entry.caloriesEaten != null || entry.estimatedBurn != null || entry.goal != null || entry.notes)));
  const currentGoal = latestWeightGoal(allEntries);
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
    <Text style={styles.fieldLabel}>Date</Text><DateField value={date} onChangeText={setDate} placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>Weight ({entry?.unit ?? 'lb'})</Text><TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="Weight" placeholderTextColor={colors.textDim} style={styles.input} />
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} onPress={() => setMoreOpen(!moreOpen)} style={styles.moreToggle}><Text style={styles.moreText}>{moreOpen ? 'Hide details' : 'More details'}</Text><Text style={styles.moreHint}>{moreOpen ? '' : 'Calories, estimated burn, goal and notes'}</Text></Pressable>
    {moreOpen && <>
    <Text style={styles.fieldLabel}>Calories eaten on {activityDate ? shortDate(activityDate) : 'previous day'} (optional)</Text><TextInput value={displayedCalories} onChangeText={(value) => { setCaloriesEdited(true); setCalories(value); }} keyboardType="decimal-pad" placeholder={suggestedCalories == null ? 'No food logged' : 'Calories'} placeholderTextColor={colors.textDim} style={styles.input} />
    {!entry && !caloriesEdited && <Text style={estimateStyles.note}>{suggestedCalories == null ? 'No food logged in Nutrition for that day; left blank.' : 'Suggested from Nutrition. You can change or clear this value.'}</Text>}
    <Text style={styles.fieldLabel}>Estimated burn / TDEE for {activityDate ? shortDate(activityDate) : 'previous day'} (optional)</Text><TextInput value={displayedBurn} onChangeText={(value) => { setBurnEdited(true); setBurn(value); }} keyboardType="number-pad" placeholder="Estimated burn" placeholderTextColor={colors.textDim} style={styles.input} />
    {estimate ? <View style={estimateStyles.card}><Text style={estimateStyles.title}>Estimated TDEE · {estimate.total.toLocaleString()} kcal</Text><Text style={estimateStyles.line}>BMR {estimate.bmr} + ordinary activity {estimate.ordinaryActivity}</Text><Text style={estimateStyles.line}>Other steps {estimate.stepCalories} + saved routes {estimate.routeCalories}</Text><Text style={estimateStyles.line}>Food digestion {estimate.foodDigestion} kcal</Text><Text style={estimateStyles.note}>{estimate.stepStatus === 'recorded' ? `${estimate.remainingSteps.toLocaleString()} steps outside saved routes` : estimate.stepStatus === 'partial' ? 'Step tracking was partial; the walking estimate may be low.' : 'No step total for this day; only saved routes contribute movement.'} Ordinary activity is estimated at 10% of BMR, digestion at 10% of TDEE, and route-overlap steps from approximate stride length. These are not measured calories.</Text></View>
      : <Text style={estimateStyles.note}>{profile && validTdeeProfile(profile) ? 'Enter a valid date and weight to see the estimate.' : 'Add your height, birth year and formula choice on the Weight overview to see a TDEE estimate.'}</Text>}
    <Text style={styles.fieldLabel}>Goal weight (optional)</Text><TextInput value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder={currentGoal !== undefined ? `Current goal: ${format(currentGoal)}` : 'Goal'} placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>Notes (optional)</Text><TextInput value={notes} onChangeText={setNotes} multiline placeholder="Notes" placeholderTextColor={colors.textDim} style={[styles.input, styles.notes]} />
    </>}
    <Pressable style={styles.primary} onPress={save}><Text style={styles.primaryText}>Save weigh-in</Text></Pressable><Pressable style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>{onDelete ? <Pressable style={styles.delete} onPress={onDelete}><Text style={styles.deleteText}>Delete this weigh-in</Text></Pressable> : null}
  </ScrollView></SafeAreaView></Modal>;
}

function TdeeSettingsModal({ profile, onClose, onSave }: { profile?: WeightTdeeProfile; onClose: () => void; onSave: (profile: WeightTdeeProfile) => void }) {
  return <PersonalDetailsModal title="TDEE estimate setup" note="Optional and stored on this device. Your height, birth year and formula choice predict resting energy use. Reclaim adds estimated ordinary activity, non-route steps, saved routes and digestion for a daily TDEE estimate. It will not change older weigh-ins or Nutrition targets." profile={profile} onClose={onClose} onSave={(next) => onSave(next)} />;
}

function rowMeta(entry: WeightEntry) {
  return [
    entry.caloriesEaten != null ? `${entry.caloriesEaten.toLocaleString()} eaten` : undefined,
    entry.estimatedBurn != null ? `${entry.estimatedBurn.toLocaleString()} burn` : undefined,
    entry.source === 'health-connect' ? `Health Connect (${entry.sourceApp ?? 'connected app'})` : undefined,
  ].filter(Boolean).join(' · ');
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function goalText(current: number, goal: number, unit: string) {
  const left = Math.abs(current - goal);
  return left < 0.05 ? `At your ${format(goal)} ${unit} goal` : `${format(left)} ${unit} to your ${format(goal)} ${unit} goal`;
}
const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 36 }, eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.7, fontFamily: font.semibold, marginTop: 24 }, title: { color: colors.text, fontSize: 38, fontFamily: font.bold, marginTop: 8 }, subtitle: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 20, marginTop: 8 }, hero: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 24 }, heroLabel: { color: colors.textDim, fontSize: 11, letterSpacing: 1.2, fontFamily: font.semibold }, heroValue: { color: colors.text, fontSize: 44, fontFamily: font.bold, marginTop: 8 }, unit: { color: colors.textMuted, fontSize: 18 , fontFamily: font.regular}, stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16, paddingTop: 14 }, stat: { flex: 1, alignItems: 'center' }, statValue: { color: colors.text, fontSize: 16, fontFamily: font.semibold }, statLabel: { color: colors.textDim, fontSize: 11, fontFamily: font.semibold, marginTop: 4 }, primary: { backgroundColor: colors.accent, borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 14 }, primaryText: { color: colors.background, fontFamily: font.bold, fontSize: 13 }, importButton: { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 10 }, importText: { color: colors.text, fontFamily: font.semibold, fontSize: 12 }, goalLine: { color: colors.weightNav, fontSize: 14, fontFamily: font.semibold, marginTop: 2 }, moreToggle: { marginTop: 16, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }, moreText: { color: colors.weightNav, fontSize: 14, fontFamily: font.bold }, moreHint: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 2 }, historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, marginBottom: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, paddingHorizontal: spacing.lg, paddingVertical: 14 }, historyTitle: { color: colors.text, fontSize: 17, fontFamily: font.semibold }, historyMeta: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 3 }, sectionTitle: { color: colors.text, fontSize: 19, fontFamily: font.semibold, marginTop: 26, marginBottom: 10 }, list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, paddingHorizontal: spacing.md }, row: { minHeight: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, date: { color: colors.text, fontSize: 13, fontFamily: font.semibold }, meta: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 4 }, note: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 4 }, rowWeight: { color: colors.text, fontSize: 15, fontFamily: font.bold }, empty: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 19, paddingVertical: 18 }, disclaimer: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, lineHeight: 16, textAlign: 'center', marginTop: 24 }, modal: { flex: 1, backgroundColor: colors.background }, modalContent: { flexGrow: 1, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: 24 }, modalTitle: { color: colors.text, fontSize: 28, fontFamily: font.bold, marginBottom: 10 }, fieldLabel: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, marginTop: 12, marginBottom: 5 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 , fontFamily: font.regular}, notes: { minHeight: 88, textAlignVertical: 'top' }, cancel: { borderColor: colors.border, borderWidth: 1, borderRadius: 15, paddingVertical: 14, alignItems: 'center', marginTop: 10 }, cancelText: { color: colors.text, fontFamily: font.semibold }, delete: { alignItems: 'center', paddingVertical: 14, marginTop: 18 }, deleteText: { color: colors.danger, fontSize: 12, fontFamily: font.bold } });
const tdeeStyles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 14 },
  total: { color: colors.text, fontSize: 32, fontFamily: font.bold, marginTop: 8 },
  unit: { color: colors.textMuted, fontSize: 16 , fontFamily: font.regular},
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 },
  rowLabel: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, flex: 1 },
  rowValue: { color: colors.text, fontSize: 12, fontFamily: font.semibold },
});

const estimateStyles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginTop: 12 },
  title: { color: colors.weightNav, fontSize: 15, fontFamily: font.semibold, marginBottom: 8 },
  line: { color: colors.text, fontSize: 12, fontFamily: font.regular, lineHeight: 20 },
  note: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 17, marginTop: 10 },
  formulaRow: { flexDirection: 'row', gap: 10 },
  heightField: { flex: 1 },
  formulaChoice: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  formulaSelected: { borderColor: colors.weightNav },
});
