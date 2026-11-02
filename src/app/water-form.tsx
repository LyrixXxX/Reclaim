import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { formatClockTime } from '@/lib/clock-time';
import { localDateKey } from '@/lib/progress';
import { generateTrackerId, TrackerDraft, validateTrackerDraft } from '@/lib/tracker-management';
import { WaterUnit, waterDisplayAmount, waterToOunces, waterTotalOn } from '@/lib/water-habit';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';
import { GoodHabitIcon } from '@/components/good-habit-icon';

function enteredOunces(text: string, unit: WaterUnit): number | null {
  const value = Number(text);
  return text.trim() && Number.isFinite(value) ? waterToOunces(value, unit) : null;
}

function UnitChoice({ unit, onChange }: { unit: WaterUnit; onChange: (unit: WaterUnit) => void }) {
  return <View style={styles.units}>{(['fl oz', 'mL'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: unit === choice }} onPress={() => onChange(choice)} style={[styles.unit, unit === choice && styles.unitActive]}><Text style={[styles.unitText, unit === choice && styles.unitTextActive]}>{choice}</Text></Pressable>)}</View>;
}

export default function WaterFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trackers, waterLogs = [], createCustomTracker, editExistingTracker } = useTrackers();
  const existing = trackers.find((tracker) => tracker.id === id && tracker.habitTemplate === 'water');
  const today = localDateKey();
  const currentGoal = existing?.waterGoals?.filter((goal) => goal.effectiveDate <= today).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  const [name, setName] = useState(existing?.name ?? 'Drink more water');
  const [unit, setUnit] = useState<WaterUnit>(existing?.waterDisplayUnit ?? 'fl oz');
  const [goalOz, setGoalOz] = useState<number | null>(currentGoal?.ounces ?? null);
  const [goalText, setGoalText] = useState(currentGoal ? waterDisplayAmount(currentGoal.ounces, existing?.waterDisplayUnit ?? 'fl oz') : '');
  const [quickOz, setQuickOz] = useState<number | null>(existing?.waterQuickAddOz ?? 8);
  const [quickText, setQuickText] = useState(waterDisplayAmount(existing?.waterQuickAddOz ?? 8, existing?.waterDisplayUnit ?? 'fl oz'));
  const [presets, setPresets] = useState<number[]>(existing?.waterPresetOz ?? [8, 12, 16, 24]);
  const [presetIndex, setPresetIndex] = useState<number | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetText, setPresetText] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(Boolean(existing?.habitReminderTime));
  const [reminder, setReminder] = useState(existing?.habitReminderTime ? formatClockTime(existing.habitReminderTime).replace(/\s*[AP]M$/, '') : '9:00');
  const [period, setPeriod] = useState<'AM' | 'PM'>(existing?.habitReminderTime && Number(existing.habitReminderTime.slice(0, 2)) >= 12 ? 'PM' : 'AM');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const changeUnit = (next: WaterUnit) => {
    setUnit(next);
    setGoalText(goalOz === null ? '' : waterDisplayAmount(goalOz, next));
    setQuickText(quickOz === null ? '' : waterDisplayAmount(quickOz, next));
    if (presetOpen) { const value = enteredOunces(presetText, unit); setPresetText(value === null ? '' : waterDisplayAmount(value, next)); }
  };
  const openPreset = (index: number | null) => { setPresetIndex(index); setPresetText(index === null ? '' : waterDisplayAmount(presets[index], unit)); setPresetOpen(true); setError(''); };
  const savePreset = () => {
    const unchanged = presetIndex !== null && presetText === waterDisplayAmount(presets[presetIndex], unit);
    const ounces = unchanged ? presets[presetIndex] : enteredOunces(presetText, unit);
    if (ounces === null || ounces <= 0 || ounces > 1000) { setError('Enter a shortcut greater than zero, up to 1,000 fl oz.'); return; }
    setPresets((current) => presetIndex === null ? [...current, ounces] : current.map((item, index) => index === presetIndex ? ounces : item));
    setPresetOpen(false); setError('');
  };
  const save = async () => {
    if (saving) return;
    if (!existing && trackers.some((tracker) => tracker.habitTemplate === 'water' && !tracker.archived)) { setError('An active water habit already exists. Open it from Good Habits.'); return; }
    const draft: TrackerDraft = {
      name, displayName: existing?.displayName, mode: 'habit', habitTemplate: 'water',
      startDate: existing?.startedAt ? localDateKey(new Date(existing.startedAt)) : today,
      icon: '💧', color: colors.habitsNav,
      waterGoalOz: goalOz?.toString() ?? '', waterQuickAddOz: quickOz?.toString() ?? '',
      waterDisplayUnit: unit, waterPresetOz: presets,
      habitReminderTime: reminderEnabled ? `${reminder.trim()} ${period}` : '', notes: existing?.notes,
    };
    const validation = validateTrackerDraft(draft);
    if (Object.keys(validation).length) { setError(Object.values(validation)[0] ?? 'Check your entries.'); return; }
    setSaving(true);
    const trackerId = existing?.id ?? generateTrackerId();
    try {
      if (existing) await editExistingTracker(trackerId, draft);
      else await createCustomTracker(draft, trackerId);
      router.replace({ pathname: '/tracker/[id]', params: { id: trackerId } });
    } catch (cause) {
      Alert.alert('Water habit saved', cause instanceof Error ? cause.message : 'The reminder could not be enabled.');
      router.replace({ pathname: '/tracker/[id]', params: { id: trackerId } });
    } finally { setSaving(false); }
  };
  const todayAmount = existing ? waterTotalOn(waterLogs, existing.id, today) : 0;
  const previewPercent = goalOz && goalOz > 0 ? Math.min(100, Math.round(todayAmount / goalOz * 100)) : 0;
  return <SafeAreaView style={styles.safe} edges={['bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <View style={styles.hero}><GoodHabitIcon type="water" size={76} /><View style={styles.heroCopy}><Text style={styles.heroTitle}>Drink more water</Text><Text style={styles.help}>Track drinks with a daily goal that works for you.</Text></View></View>
    <View style={styles.tags}><Text style={styles.tag}>▥  Daily goal</Text><Text style={styles.tag}>ϟ  Quick add</Text><Text style={styles.tag}>◷  Reminders</Text></View>
    <Text style={styles.label}>Habit name</Text><View style={styles.nameRow}><TextInput accessibilityLabel="Water habit name" maxLength={50} value={name} onChangeText={setName} style={styles.nameInput} placeholderTextColor={colors.textDim} /><Pressable accessibilityRole="button" accessibilityLabel="Clear habit name" onPress={() => setName('')} style={styles.clear}><Text style={styles.clearText}>×</Text></Pressable></View><Text style={styles.counter}>{name.length}/50</Text>
    <Text style={styles.label}>Daily goal</Text><View style={styles.amountRow}><Text style={styles.fieldIcon}>◎</Text><TextInput accessibilityLabel={`Daily water goal in ${unit}`} keyboardType="decimal-pad" value={goalText} onChangeText={(value) => { setGoalText(value); setGoalOz(enteredOunces(value, unit)); }} placeholder="Your goal" placeholderTextColor={colors.textDim} style={styles.amountInput} /><UnitChoice unit={unit} onChange={changeUnit} /></View><Text style={styles.help}>Set a daily water goal that works for you. Reclaim does not prescribe an amount.</Text>
    <Text style={styles.label}>Quick-add drink size</Text><View style={styles.amountRow}><Text style={styles.fieldIcon}>▱</Text><TextInput accessibilityLabel={`Quick-add drink size in ${unit}`} keyboardType="decimal-pad" value={quickText} onChangeText={(value) => { setQuickText(value); setQuickOz(enteredOunces(value, unit)); }} placeholder="8" placeholderTextColor={colors.textDim} style={styles.amountInput} /><UnitChoice unit={unit} onChange={changeUnit} /></View><Text style={styles.help}>Tap once to log this amount. You can enter a different amount whenever you need to.</Text>
    <Text style={styles.label}>Quick-add shortcuts · optional</Text><View style={styles.shortcuts}>{presets.map((amount, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Edit ${waterDisplayAmount(amount, unit)} ${unit} shortcut`} onPress={() => openPreset(index)} style={styles.shortcut}><Text style={styles.shortcutText}>{waterDisplayAmount(amount, unit)} {unit}</Text></Pressable>)}{presets.length < 8 && <Pressable accessibilityRole="button" accessibilityLabel="Add water shortcut" onPress={() => openPreset(null)} style={styles.shortcut}><Text style={styles.shortcutText}>＋</Text></Pressable>}</View>
    <Text style={styles.label}>Daily reminder · optional</Text><View style={styles.reminderCard}><Pressable accessibilityRole="switch" accessibilityState={{ checked: reminderEnabled }} onPress={() => setReminderEnabled((current) => !current)} style={styles.reminderHeader}><Text style={styles.fieldIcon}>♧</Text><Text style={styles.reminderText}>Enable daily reminder</Text><View style={[styles.switchTrack, reminderEnabled && styles.switchOn]}><View style={[styles.switchThumb, reminderEnabled && styles.switchThumbOn]} /></View></Pressable>{reminderEnabled && <View style={styles.reminderTime}><Text style={styles.reminderText}>Reminder time</Text><TextInput accessibilityLabel="Water reminder time" keyboardType="numbers-and-punctuation" value={reminder} onChangeText={setReminder} placeholder="9:00" placeholderTextColor={colors.textDim} style={styles.timeInput} />{(['AM', 'PM'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: period === choice }} onPress={() => setPeriod(choice)} style={[styles.period, period === choice && styles.periodActive]}><Text style={styles.periodText}>{choice}</Text></Pressable>)}</View>}</View>
    <Text style={styles.label}>Preview</Text><View style={styles.preview}><View style={styles.previewTop}><GoodHabitIcon type="water" size={48} /><View><Text style={styles.help}>Your daily goal</Text><Text style={styles.previewAmount}>{goalOz && goalOz > 0 ? `${waterDisplayAmount(goalOz, unit)} ${unit}` : 'Set a goal'}</Text></View></View><View style={styles.previewProgress}><View style={[styles.previewFill, { width: `${previewPercent}%` }]} /></View><Text style={styles.help}>{previewPercent}% · {existing ? 'Your current progress with this goal' : 'Start logging drinks to see your progress here.'}</Text></View>
    {error && !presetOpen ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.saveButton}><Text style={styles.saveText}>{saving ? 'Saving…' : existing ? 'Save water habit' : 'Create water habit'}</Text></Pressable>
    <Modal visible={presetOpen} transparent animationType="fade" onRequestClose={() => setPresetOpen(false)}><View style={styles.shade}><View style={styles.modal}><Text style={styles.heroTitle}>{presetIndex === null ? 'Add shortcut' : 'Edit shortcut'}</Text><Text style={styles.help}>Amount in {unit}</Text><TextInput autoFocus accessibilityLabel={`Shortcut amount in ${unit}`} keyboardType="decimal-pad" value={presetText} onChangeText={setPresetText} placeholder="Amount" placeholderTextColor={colors.textDim} style={styles.modalInput} />{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={savePreset} style={styles.saveButton}><Text style={styles.saveText}>Save shortcut</Text></Pressable>{presetIndex !== null && <Pressable accessibilityRole="button" onPress={() => { setPresets((current) => current.filter((_, index) => index !== presetIndex)); setPresetOpen(false); setError(''); }} style={styles.modalAction}><Text style={styles.error}>Remove shortcut</Text></Pressable>}<Pressable accessibilityRole="button" onPress={() => { setPresetOpen(false); setError(''); }} style={styles.modalAction}><Text style={styles.reminderText}>Cancel</Text></Pressable></View></View></Modal>
  </KeyboardSafeScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60, gap: 10 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 15 }, iconFrame: { width: 76, height: 76, borderRadius: 19, backgroundColor: '#062431', borderWidth: 1, borderColor: '#18CFE7', alignItems: 'center', justifyContent: 'center' }, icon: { fontSize: 34}, heroCopy: { flex: 1 }, heroTitle: { color: colors.text, fontSize: 22, fontFamily: font.bold }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: -3 }, tag: { color: colors.habitsNav, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, fontSize: 11, fontFamily: font.bold },
  label: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold, marginTop: 12 }, help: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 19 }, nameRow: { flexDirection: 'row', alignItems: 'center', minHeight: 54, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 }, nameInput: { flex: 1, color: colors.text, fontSize: 17, fontFamily: font.regular, paddingHorizontal: 15, minHeight: 52 }, clear: { width: 44, minHeight: 50, alignItems: 'center', justifyContent: 'center' }, clearText: { color: colors.textMuted, fontSize: 25 , fontFamily: font.regular}, counter: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, textAlign: 'right', marginTop: -8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, paddingHorizontal: 10 }, fieldIcon: { color: '#25D9E4', fontSize: 27, fontFamily: font.regular, width: 38, textAlign: 'center' }, amountInput: { flex: 1, minWidth: 50, color: colors.text, fontSize: 23, fontFamily: font.semibold, paddingVertical: 8 }, units: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 11, overflow: 'hidden' }, unit: { minWidth: 50, minHeight: 42, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' }, unitActive: { borderWidth: 1, borderColor: '#20CED5', backgroundColor: '#073839', borderRadius: 10 }, unitText: { color: colors.textMuted, fontSize: 12, fontFamily: font.bold }, unitTextActive: { color: '#51EBE7' },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, shortcut: { minHeight: 46, paddingHorizontal: 12, borderColor: colors.border, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, shortcutText: { color: colors.text, fontSize: 13, fontFamily: font.bold },
  reminderCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, gap: 10 }, reminderHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }, reminderText: { flex: 1, color: colors.text, fontSize: 14, fontFamily: font.bold }, switchTrack: { width: 54, height: 30, borderRadius: 15, padding: 3, backgroundColor: colors.border }, switchOn: { backgroundColor: '#20CED5' }, switchThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.textMuted }, switchThumbOn: { alignSelf: 'flex-end', backgroundColor: colors.text }, reminderTime: { flexDirection: 'row', alignItems: 'center', gap: 6 }, timeInput: { color: colors.text, backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingHorizontal: 9, minWidth: 58, minHeight: 46, textAlign: 'center', fontSize: 16 , fontFamily: font.regular}, period: { minWidth: 42, minHeight: 46, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, periodActive: { borderWidth: 1, borderColor: '#20CED5', backgroundColor: '#073839' }, periodText: { color: colors.text, fontFamily: font.semibold },
  preview: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15, gap: 10 }, previewTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, previewAmount: { color: colors.text, fontSize: 25, fontFamily: font.bold }, previewProgress: { height: 14, backgroundColor: colors.border, borderRadius: 9, overflow: 'hidden' }, previewFill: { height: '100%', borderRadius: 9, backgroundColor: '#20CED5' },
  error: { color: colors.danger, fontSize: 13 , fontFamily: font.regular}, saveButton: { minHeight: 54, marginTop: 14, backgroundColor: '#24DFE1', borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, saveText: { color: colors.background, fontFamily: font.bold, fontSize: 16 }, shade: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 22 }, modal: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 18, gap: 10 }, modalInput: { minHeight: 50, color: colors.text, fontSize: 18, fontFamily: font.regular, backgroundColor: colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 15 }, modalAction: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
});
