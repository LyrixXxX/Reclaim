import { Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { localDateKey } from '@/lib/progress';
import { formatClockTime } from '@/lib/clock-time';
import { expenseDraft } from '@/lib/habit-savings';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import {
  generateTrackerId,
  trackerHasHistory,
  TrackerDraft,
  TrackerValidation,
  validateTrackerDraft,
} from '@/lib/tracker-management';
import { FrequencyPeriod, Tracker, TrackerMode } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

const ICONS = ['◇', '○', '↗', '★', '✓', '⌁', '△', '□'];
const ACCENTS = [colors.marijuana, colors.porn, colors.nicotine, colors.caffeine, colors.accent, colors.success];

export default function TrackerFormScreen() {
  const { id, delete: deleteRequested, mode } = useLocalSearchParams<{ id?: string; delete?: string; mode?: string }>();
  const {
    trackers,
    historicalEntries = [],
    lapseEvents = [],
    taperSteps = [],
    createCustomTracker,
    editExistingTracker,
    setArchived,
    deleteTracker,
  } = useTrackers();
  const existing = trackers.find((tracker) => tracker.id === id);
  useEffect(() => {
    if (existing?.habitTemplate === 'water') router.replace(`/water-form?id=${encodeURIComponent(existing.id)}` as Href);
    else if (!existing && mode === 'habit') router.replace('/good-habit-types' as Href);
  }, [existing, mode]);
  const editing = Boolean(existing);
  const [draft, setDraft] = useState<TrackerDraft>(() => ({ ...draftFor(existing), ...(!existing && mode === 'habit' ? { mode: 'habit' as const } : {}) }));
  const [reminderPeriod, setReminderPeriod] = useState<'AM' | 'PM'>(() => existing?.habitReminderTime && Number(existing.habitReminderTime.slice(0, 2)) >= 12 ? 'PM' : 'AM');
  const [errors, setErrors] = useState<TrackerValidation>({});
  const [deleteOpen, setDeleteOpen] = useState(deleteRequested === '1');
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const stateSnapshot = useMemo(() => ({ trackers, historicalEntries, lapseEvents, taperSteps, checkIns: [] }), [historicalEntries, lapseEvents, taperSteps, trackers]);
  const hasHistory = existing ? trackerHasHistory(stateSnapshot, existing.id) : false;
  const recalculates = existing ? calculationsWillChange(existing, draft) : false;
  const set = <K extends keyof TrackerDraft>(key: K, value: TrackerDraft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };
  const reminderClock = (draft.habitReminderTime ?? '').replace(/\s*[AP]M$/i, '');
  const updateReminderClock = (clock: string) => set('habitReminderTime', clock.trim() ? `${clock.trim()} ${reminderPeriod}` : '');
  const updateReminderPeriod = (period: 'AM' | 'PM') => {
    setReminderPeriod(period);
    if (reminderClock.trim()) set('habitReminderTime', `${reminderClock.trim()} ${period}`);
  };

  const save = async () => {
    const nextErrors = validateTrackerDraft(draft);
    if (existing && draft.savingsExpenses?.some((expense) => {
      const original = existing.savingsExpenses?.find((item) => item.id === expense.id)?.rates.at(-1);
      return original && expense.effectiveDate < original.effectiveDate;
    })) nextErrors.savingsExpenses = 'A changed price cannot start before its previous rate.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    let reminderWarning: string | undefined;
    if (existing) {
      try { await editExistingTracker(existing.id, draft); }
      catch (error) { reminderWarning = error instanceof Error ? error.message : 'Could not schedule the reminder.'; }
      router.back();
    } else {
      const newId = generateTrackerId();
      try { await createCustomTracker(draft, newId); }
      catch (error) { reminderWarning = error instanceof Error ? error.message : 'Could not schedule the reminder.'; }
      router.replace({ pathname: '/tracker/[id]', params: { id: newId } });
    }
    if (reminderWarning) Alert.alert('Habit saved', reminderWarning);
  };

  const deleteAllowed = !hasHistory || deleteText === 'DELETE' || deleteText === existing?.name;
  const confirmDelete = async () => {
    if (!existing || deleting) return;
    setDeleting(true);
    try {
      const deleted = await deleteTracker(existing.id, true, deleteText);
      if (!deleted) throw new Error('The tracker was not deleted. Please check the confirmation and try again.');
      router.replace(`/habits?deleted=${encodeURIComponent(existing.name)}` as Href);
    } catch (error) {
      Alert.alert('Could not delete tracker', error instanceof Error ? error.message : 'The tracker could not be saved as deleted. Try again.');
    } finally { setDeleting(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardSafeScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{editing ? 'EDIT TRACKER' : 'NEW TRACKER'}</Text>
        <Text style={styles.title}>{editing ? 'Adjust your tracker.' : 'What do you want to reclaim?'}</Text>
        <Text style={styles.subtitle}>Settings and history stay private on this device.</Text>

        {!editing && (
          <Field label="TRACKER TYPE" error={errors.mode}>
            <View style={styles.typeStack}>
              {([
                ['abstinence', 'Quit / Abstinence', 'Time since stopping, recovery, and lapses'],
                ['reduction', 'Reduce / Taper', 'Baseline, current amount, and reduction history'],
              ] as [TrackerMode, string, string][]).map(([mode, label, hint]) => (
                <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: draft.mode === mode }} onPress={() => set('mode', mode)} style={[styles.typeButton, draft.mode === mode && styles.selected]}>
                  <View style={[styles.radio, draft.mode === mode && { borderColor: draft.color }]}>
                    {draft.mode === mode && <View style={[styles.radioFill, { backgroundColor: draft.color }]} />}
                  </View>
                  <View style={styles.typeCopy}>
                    <Text style={styles.typeTitle}>{label}</Text>
                    <Text style={styles.typeHint}>{hint}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Field>
        )}

        <Field label="TRACKER NAME" error={errors.name}>
          <TextInput accessibilityLabel="Tracker name" value={draft.name} onChangeText={(value) => set('name', value)} placeholder="e.g. Evening walk" placeholderTextColor={colors.textDim} style={styles.input} />
        </Field>
        <Field label="DISCREET DISPLAY NAME · OPTIONAL">
          <TextInput accessibilityLabel="Discreet display name" value={draft.displayName} onChangeText={(value) => set('displayName', value)} placeholder="Shown instead of the tracker name" placeholderTextColor={colors.textDim} style={styles.input} />
        </Field>

        <Field label="START DATE" error={errors.startDate}>
          <TextInput accessibilityLabel="Start date" value={draft.startDate} onChangeText={(value) => set('startDate', value)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} />
        </Field>
        <Field label="START TIME · OPTIONAL" error={errors.startTime}>
          <Text style={timeStyles.help}>Use the local time you actually started. Leave blank to use 12:00 AM.</Text>
          <View style={timeStyles.row}>
            <TextInput accessibilityLabel="Start time" value={draft.startTime} onChangeText={(value) => set('startTime', value)} keyboardType="numbers-and-punctuation" placeholder="8:30" placeholderTextColor={colors.textDim} style={[styles.input, timeStyles.input]} />
            {(['AM', 'PM'] as const).map((period) => <Pressable key={period} accessibilityRole="radio" accessibilityState={{ checked: draft.startPeriod === period }} onPress={() => set('startPeriod', period)} style={[timeStyles.choice, draft.startPeriod === period && timeStyles.choiceActive]}><Text style={[timeStyles.choiceText, draft.startPeriod === period && timeStyles.choiceTextActive]}>{period}</Text></Pressable>)}
          </View>
        </Field>

        {draft.mode === 'reduction' && (
          <>
            <Field label="MEASUREMENT UNIT" error={errors.unit}>
              <TextInput accessibilityLabel="Measurement unit" value={draft.unit} onChangeText={(value) => set('unit', value)} placeholder="mg/day, drinks, minutes…" placeholderTextColor={colors.textDim} style={styles.input} />
            </Field>
            <View style={styles.twoColumn}>
              <View style={styles.flexField}><Field label="BASELINE" error={errors.baseline}><TextInput accessibilityLabel="Baseline amount" keyboardType="decimal-pad" value={draft.baseline} onChangeText={(value) => set('baseline', value)} placeholder="0" placeholderTextColor={colors.textDim} style={styles.input} /></Field></View>
              <View style={styles.flexField}><Field label="CURRENT AMOUNT" error={errors.current}><TextInput accessibilityLabel="Current amount" keyboardType="decimal-pad" value={draft.current} onChangeText={(value) => set('current', value)} placeholder="0" placeholderTextColor={colors.textDim} style={styles.input} /></Field></View>
            </View>
            <Field label="TARGET AMOUNT · OPTIONAL" error={errors.target}>
              <TextInput accessibilityLabel="Target amount" keyboardType="decimal-pad" value={draft.target} onChangeText={(value) => set('target', value)} placeholder="Optional" placeholderTextColor={colors.textDim} style={styles.input} />
            </Field>
          </>
        )}

        {draft.mode === 'habit' && (<>
          <Field label="GOAL FREQUENCY" error={errors.frequencyCount || errors.frequencyPeriod}>
            <Text style={timeStyles.help}>Enter how many times you want to complete this habit, then choose per day, week, or month. Each logged completion fills part of your goal bar; you can keep logging after reaching the goal.</Text>
            <View style={styles.frequencyRow}>
              <TextInput accessibilityLabel="Number of times for goal" keyboardType="number-pad" value={draft.frequencyCount} onChangeText={(value) => set('frequencyCount', value)} placeholder="3" placeholderTextColor={colors.textDim} style={[styles.input, styles.countInput]} />
              {(['day', 'week', 'month'] as FrequencyPeriod[]).map((period) => (
                <Pressable key={period} accessibilityRole="radio" accessibilityState={{ checked: draft.frequencyPeriod === period }} onPress={() => set('frequencyPeriod', period)} style={[styles.periodButton, draft.frequencyPeriod === period && styles.selected]}>
                  <Text style={[styles.periodText, draft.frequencyPeriod === period && styles.periodTextActive]}>/ {period}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="DAILY NUDGE · OPTIONAL" error={errors.habitReminderTime}>
            <Text style={timeStyles.help}>A daily reminder at your chosen time, even after you reach your goal. Leave the time blank to turn it off.</Text>
            <View style={timeStyles.row}>
              <TextInput accessibilityLabel="Good habit reminder time" keyboardType="numbers-and-punctuation" value={reminderClock} onChangeText={updateReminderClock} placeholder="9:00" placeholderTextColor={colors.textDim} style={[styles.input, timeStyles.input]} />
              {(['AM', 'PM'] as const).map((period) => <Pressable key={period} accessibilityRole="radio" accessibilityLabel={`Reminder ${period}`} accessibilityState={{ checked: reminderPeriod === period }} onPress={() => updateReminderPeriod(period)} style={[timeStyles.choice, reminderPeriod === period && timeStyles.choiceActive]}><Text style={[timeStyles.choiceText, reminderPeriod === period && timeStyles.choiceTextActive]}>{period}</Text></Pressable>)}
            </View>
          </Field>
        </>)}

        {draft.mode !== 'habit' && <View style={styles.savingsSection}>
          <Text style={styles.savingsTitle}>ESTIMATED MONEY SAVED · OPTIONAL</Text>
          <Text style={styles.savingsHelp}>Add regular spending you stopped. You can list several costs, such as juice and coils. Estimates start at your quit date; lapses do not erase earlier savings.</Text>
          {(draft.savingsExpenses ?? []).map((expense, index) => <View key={expense.id} style={styles.savingsItem}>
            <TextInput accessibilityLabel={`Expense ${index + 1} name`} value={expense.label} onChangeText={(value) => set('savingsExpenses', (draft.savingsExpenses ?? []).map((item) => item.id === expense.id ? { ...item, label: value } : item))} placeholder="Expense name, e.g. Juice" placeholderTextColor={colors.textDim} style={styles.input} />
            <View style={styles.savingsRow}>
              <TextInput accessibilityLabel={`${expense.label || 'Expense'} amount in dollars`} value={expense.amount} onChangeText={(value) => set('savingsExpenses', (draft.savingsExpenses ?? []).map((item) => item.id === expense.id ? { ...item, amount: value } : item))} keyboardType="decimal-pad" placeholder="$ amount" placeholderTextColor={colors.textDim} style={[styles.input, styles.savingsAmount]} />
              <Text style={styles.savingsEvery}>every</Text>
              <TextInput accessibilityLabel={`${expense.label || 'Expense'} recurrence count`} value={expense.everyCount} onChangeText={(value) => set('savingsExpenses', (draft.savingsExpenses ?? []).map((item) => item.id === expense.id ? { ...item, everyCount: value } : item))} keyboardType="number-pad" placeholder="1" placeholderTextColor={colors.textDim} style={[styles.input, styles.savingsCount]} />
            </View>
            <View style={styles.frequencyRow}>{(['day', 'week', 'month'] as FrequencyPeriod[]).map((unit) => <Pressable key={unit} accessibilityRole="radio" accessibilityState={{ checked: expense.everyUnit === unit }} onPress={() => set('savingsExpenses', (draft.savingsExpenses ?? []).map((item) => item.id === expense.id ? { ...item, everyUnit: unit } : item))} style={[styles.periodButton, expense.everyUnit === unit && styles.selected]}><Text style={[styles.periodText, expense.everyUnit === unit && styles.periodTextActive]}>{unit}{Number(expense.everyCount) === 1 ? '' : 's'}</Text></Pressable>)}</View>
            <Text style={styles.savingsHelp}>{existing?.savingsExpenses?.some((item) => item.id === expense.id) ? 'Changed price starts on' : 'Expense applies starting'}</Text>
            <TextInput accessibilityLabel={`${expense.label || 'Expense'} effective date`} value={expense.effectiveDate} onChangeText={(value) => set('savingsExpenses', (draft.savingsExpenses ?? []).map((item) => item.id === expense.id ? { ...item, effectiveDate: value } : item))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} />
            <Pressable accessibilityRole="button" onPress={() => set('savingsExpenses', (draft.savingsExpenses ?? []).filter((item) => item.id !== expense.id))} style={styles.savingsRemove}><Text style={styles.savingsRemoveText}>{existing?.savingsExpenses?.some((item) => item.id === expense.id) ? 'Stop this expense' : 'Remove expense'}</Text></Pressable>
          </View>)}
          {errors.savingsExpenses && <Text style={styles.error}>{errors.savingsExpenses}</Text>}
          <Pressable accessibilityRole="button" onPress={() => set('savingsExpenses', [...(draft.savingsExpenses ?? []), { id: generateTrackerId(), label: '', amount: '', everyCount: '1', everyUnit: 'week', effectiveDate: draft.startDate }])} style={styles.savingsAdd}><Text style={styles.savingsAddText}>+ Add recurring expense</Text></Pressable>
        </View>}

        <Field label="ICON" error={errors.icon}>
          <View style={styles.optionRow}>{ICONS.map((icon) => <Pressable key={icon} accessibilityRole="radio" accessibilityState={{ checked: draft.icon === icon }} onPress={() => set('icon', icon)} style={[styles.iconButton, draft.icon === icon && styles.selected]}><Text style={[styles.iconText, { color: draft.icon === icon ? draft.color : colors.textMuted }]}>{icon}</Text></Pressable>)}</View>
        </Field>
        <Field label="ACCENT COLOR" error={errors.color}>
          <View style={styles.optionRow}>{ACCENTS.map((color) => <Pressable key={color} accessibilityRole="radio" accessibilityLabel={`Accent ${color}`} accessibilityState={{ checked: draft.color === color }} onPress={() => set('color', color)} style={[styles.colorButton, draft.color === color && styles.colorSelected]}><View style={[styles.colorSwatch, { backgroundColor: color }]} /></Pressable>)}</View>
        </Field>
        <Field label="NOTES · OPTIONAL">
          <TextInput accessibilityLabel="Tracker notes" value={draft.notes} onChangeText={(value) => set('notes', value)} placeholder="Private context, motivation, or plan" placeholderTextColor={colors.textDim} multiline style={[styles.input, styles.notes]} />
        </Field>

        {recalculates && (
          <View style={styles.recalculationNote}>
            <Text style={styles.recalculationTitle}>History will be recalculated</Text>
            <Text style={styles.recalculationBody}>Changing the start date, baseline, or frequency updates totals and charts. Existing entries stay intact.</Text>
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={save} style={styles.saveButton}>
          <Text style={styles.saveText}>{editing ? 'Save changes' : 'Create tracker'}</Text>
        </Pressable>

        {existing && (
          <>
            <View style={styles.archiveArea}>
              <Text style={styles.areaLabel}>TRACKER STATUS</Text>
              <Text style={styles.areaTitle}>{existing.archived ? 'Restore tracker' : 'Archive tracker'}</Text>
              <Text style={styles.areaBody}>{existing.archived ? 'Return this tracker to the active dashboard.' : 'Remove it from the dashboard while preserving all history and settings.'}</Text>
              <Pressable accessibilityRole="button" onPress={() => { setArchived(existing.id, !existing.archived); router.replace('/habits' as Href); }} style={styles.archiveButton}>
                <Text style={styles.archiveButtonText}>{existing.archived ? 'Restore tracker' : 'Archive tracker'}</Text>
              </Pressable>
            </View>
            <View style={styles.dangerArea}>
              <Text style={styles.dangerLabel}>DANGER AREA</Text>
              <Text style={styles.areaTitle}>Delete tracker permanently</Text>
              <Text style={styles.areaBody}>This removes the tracker and all records associated with its stable ID.</Text>
              <Pressable accessibilityRole="button" onPress={() => setDeleteOpen(true)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>Delete tracker</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardSafeScrollView>

      {existing && (
        <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
          <KeyboardSafeScrollView contentContainerStyle={styles.backdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.dangerLabel}>PERMANENT DELETION</Text>
              <Text style={styles.modalTitle}>Delete {existing.name}?</Text>
              <Text style={styles.modalBody}>This permanently deletes the tracker, start date, historical entries, lapse records, charts, notes, and all associated history. This cannot be undone.</Text>
              {hasHistory && (
                <>
                  <Text style={styles.confirmLabel}>TYPE DELETE OR {existing.name.toUpperCase()}</Text>
                  <TextInput accessibilityLabel="Deletion confirmation" value={deleteText} onChangeText={setDeleteText} placeholder="Confirmation" placeholderTextColor={colors.textDim} style={styles.input} />
                </>
              )}
              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" onPress={() => { setDeleteOpen(false); setDeleteText(''); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={!deleteAllowed || deleting} onPress={() => { void confirmDelete(); }} style={[styles.permanentButton, (!deleteAllowed || deleting) && styles.disabled]}><Text style={styles.permanentText}>{deleting ? 'Deleting…' : 'Delete permanently'}</Text></Pressable>
              </View>
            </View>
          </KeyboardSafeScrollView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}{error && <Text style={styles.error}>{error}</Text>}</View>;
}

function draftFor(tracker?: Tracker): TrackerDraft {
  if (!tracker) return { name: '', displayName: '', mode: 'abstinence', startDate: localDateKey(), startTime: '', startPeriod: 'AM', icon: '◇', color: colors.marijuana, unit: '', baseline: '', current: '', target: '', frequencyCount: '1', frequencyPeriod: 'day', habitLogStyle: 'count', habitReminderTime: '', notes: '', savingsExpenses: [] };
  const started = tracker.startedAt ? new Date(tracker.startedAt) : new Date();
  const hour = started.getHours();
  const time = tracker.startedAt ? `${hour % 12 || 12}:${String(started.getMinutes()).padStart(2, '0')}` : '';
  return { name: tracker.name, displayName: tracker.displayName ?? '', mode: tracker.mode, startDate: localDateKey(started), startTime: time, startPeriod: hour >= 12 ? 'PM' : 'AM', icon: tracker.icon, color: tracker.color, unit: tracker.unit ?? '', baseline: tracker.baseline?.toString() ?? '', current: tracker.current?.toString() ?? '', target: tracker.target?.toString() ?? '', frequencyCount: tracker.frequencyCount?.toString() ?? '1', frequencyPeriod: tracker.frequencyPeriod ?? 'day', habitLogStyle: tracker.habitLogStyle ?? 'count', habitReminderTime: tracker.habitReminderTime ? formatClockTime(tracker.habitReminderTime) : '', notes: tracker.notes ?? '', savingsExpenses: (tracker.savingsExpenses ?? []).filter((expense) => !expense.endedOn).map(expenseDraft) };
}

function calculationsWillChange(tracker: Tracker, draft: TrackerDraft) {
  const original = draftFor(tracker);
  return original.startDate !== draft.startDate || original.startTime !== draft.startTime || original.startPeriod !== draft.startPeriod || original.baseline !== draft.baseline || original.frequencyCount !== draft.frequencyCount || original.frequencyPeriod !== draft.frequencyPeriod;
}

const timeStyles = StyleSheet.create({
  help: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1 },
  choice: { width: 58, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  choiceActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  choiceText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  choiceTextActive: { color: colors.accent },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, paddingBottom: 50 },
  eyebrow: { color: colors.accent, fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginTop: 12 }, title: { color: colors.text, fontSize: 29, lineHeight: 35, fontWeight: '900', marginTop: 8 }, subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  field: { marginTop: 22 }, label: { color: colors.textDim, fontSize: 9, letterSpacing: 1.2, fontWeight: '800', marginBottom: 8 }, error: { color: colors.danger, fontSize: 10, marginTop: 6 },
  input: { minHeight: 48, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 13, fontSize: 13 }, notes: { minHeight: 88, paddingTop: 13, textAlignVertical: 'top' },
  typeStack: { gap: 8 }, typeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 }, selected: { backgroundColor: colors.surfaceRaised, borderColor: '#45503D' }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.textDim, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, radioFill: { width: 8, height: 8, borderRadius: 4 }, typeCopy: { flex: 1 }, typeTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, typeHint: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  twoColumn: { flexDirection: 'row', gap: 10 }, flexField: { flex: 1 }, frequencyRow: { flexDirection: 'row', gap: 7 }, countInput: { width: 62, textAlign: 'center' }, periodButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.surface }, periodText: { color: colors.textDim, fontSize: 10, fontWeight: '700' }, periodTextActive: { color: colors.text },
  savingsSection: { marginTop: 26, gap: 10 }, savingsTitle: { color: colors.accent, fontSize: 11, letterSpacing: 1.2, fontWeight: '900' }, savingsHelp: { color: colors.textMuted, fontSize: 11, lineHeight: 17 }, savingsItem: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, gap: 9, backgroundColor: colors.surface }, savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, savingsAmount: { flex: 1 }, savingsCount: { width: 64, textAlign: 'center' }, savingsEvery: { color: colors.textMuted, fontSize: 12 }, savingsAdd: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, padding: 14, alignItems: 'center', borderRadius: 12 }, savingsAddText: { color: colors.accent, fontWeight: '800' }, savingsRemove: { alignSelf: 'flex-start', paddingVertical: 8 }, savingsRemoveText: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, iconButton: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 20, fontWeight: '800' }, colorButton: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, colorSelected: { borderColor: colors.textMuted }, colorSwatch: { width: 28, height: 28, borderRadius: 9 },
  recalculationNote: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#3D5228', borderRadius: 14, padding: 13, marginTop: 22 }, recalculationTitle: { color: colors.text, fontSize: 12, fontWeight: '800' }, recalculationBody: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  saveButton: { backgroundColor: colors.accent, borderRadius: 15, alignItems: 'center', paddingVertical: 15, marginTop: 26 }, saveText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  archiveArea: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 34, paddingTop: 24 }, areaLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1.2, fontWeight: '800' }, areaTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 6 }, areaBody: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 6 }, archiveButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11, marginTop: 13 }, archiveButtonText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  dangerArea: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 28, paddingTop: 24 }, dangerLabel: { color: colors.danger, fontSize: 9, letterSpacing: 1.2, fontWeight: '800' }, deleteButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#5C302E', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11, marginTop: 13 }, deleteButtonText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  backdrop: { flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: spacing.lg }, modalCard: { width: '100%', maxWidth: 500, alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg }, modalTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 8 }, modalBody: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 8 }, confirmLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1, fontWeight: '800', marginTop: 18, marginBottom: 8 }, modalActions: { flexDirection: 'row', gap: 9, marginTop: 21 }, cancelButton: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 13, alignItems: 'center', paddingVertical: 13 }, cancelText: { color: colors.text, fontSize: 12, fontWeight: '700' }, permanentButton: { flex: 1, backgroundColor: '#5C302E', borderRadius: 13, alignItems: 'center', paddingVertical: 13 }, permanentText: { color: colors.text, fontSize: 11, fontWeight: '800' }, disabled: { opacity: 0.35 },
});
