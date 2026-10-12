import { Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoodHabitIcon } from '@/components/good-habit-icon';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { formatClockTime } from '@/lib/clock-time';
import { checklistOn, goalOn, GOOD_HABIT_TEMPLATES, NewHabitTemplate } from '@/lib/good-habit-templates';
import { localDateKey } from '@/lib/progress';
import { generateTrackerId, TrackerDraft, validateTrackerDraft } from '@/lib/tracker-management';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function GoodHabitForm() {
  const { type, id } = useLocalSearchParams<{ type?: string; id?: string }>();
  const config = GOOD_HABIT_TEMPLATES.find((item) => item.id === type);
  const { trackers, createCustomTracker, editExistingTracker, setArchived, deleteTracker } = useTrackers();
  const existing = trackers.find((item) => item.id === id && item.habitTemplate === type);
  const today = localDateKey();
  const [name, setName] = useState(existing?.name ?? config?.title ?? '');
  const [goal, setGoal] = useState(existing && !config?.checklist ? String(goalOn(existing, today) ?? '') : '');
  const [items, setItems] = useState<{ id: string; label: string }[]>(existing ? checklistOn(existing, today) : (config?.suggestions ?? []).map((label, index) => ({ id: `step-${index}`, label })));
  const [reminder, setReminder] = useState(existing?.habitReminderTime ? formatClockTime(existing.habitReminderTime).replace(/\s*[AP]M$/, '') : '');
  const [period, setPeriod] = useState<'AM' | 'PM'>(existing?.habitReminderTime && Number(existing.habitReminderTime.slice(0, 2)) >= 12 ? 'PM' : 'AM');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  if (!config) return <SafeAreaView style={styles.safe}><Text style={styles.error}>Habit type unavailable.</Text></SafeAreaView>;
  const save = async () => {
    if (saving) return;
    if (!existing && trackers.some((item) => item.habitTemplate === config.id && !item.archived)) { setError('An active habit of this type already exists. Open it from Good Habits.'); return; }
    const draft: TrackerDraft = { name, mode: 'habit', habitTemplate: config.id as NewHabitTemplate, startDate: existing?.startedAt?.slice(0, 10) ?? today, icon: config.icon, color: colors.habitsNav,
      habitGoalValue: goal, habitChecklistItems: items, habitReminderTime: reminder.trim() ? `${reminder.trim()} ${period}` : '' };
    const validation = validateTrackerDraft(draft);
    if (Object.keys(validation).length) { setError(Object.values(validation)[0] ?? 'Check this habit.'); return; }
    setSaving(true);
    const trackerId = existing?.id ?? generateTrackerId();
    try {
      if (existing) await editExistingTracker(trackerId, draft); else await createCustomTracker(draft, trackerId);
      router.replace({ pathname: '/tracker/[id]', params: { id: trackerId } });
    } catch (cause) {
      Alert.alert('Habit saved', cause instanceof Error ? cause.message : 'The reminder could not be enabled.');
      router.replace({ pathname: '/tracker/[id]', params: { id: trackerId } });
    } finally { setSaving(false); }
  };
  return <SafeAreaView style={styles.safe} edges={['bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <View style={styles.hero}><GoodHabitIcon type={config.id} size={76} /><View style={styles.heroText}><Text style={styles.title}>{config.title}</Text><Text style={styles.help}>{config.checklist ? 'Make this routine your own.' : `Choose a ${config.period === 'week' ? 'weekly' : 'daily'} ${config.unit} goal that works for you.`}</Text></View></View>
    <Text style={styles.label}>Habit name</Text><TextInput accessibilityLabel="Habit name" maxLength={50} value={name} onChangeText={setName} style={styles.input} />
    {config.checklist ? <><Text style={styles.label}>Routine steps</Text><Text style={styles.help}>Edit or remove the suggestions. All saved steps complete the routine.</Text>{items.map((item, index) => <View key={item.id} style={styles.step}><TextInput accessibilityLabel={`Routine step ${index + 1}`} value={item.label} onChangeText={(label) => setItems((current) => current.map((step) => step.id === item.id ? { ...step, label } : step))} style={[styles.input, styles.stepInput]} /><Pressable accessibilityRole="button" accessibilityLabel={`Remove step ${index + 1}`} onPress={() => setItems((current) => current.filter((step) => step.id !== item.id))} style={styles.remove}><Text style={styles.removeText}>×</Text></Pressable></View>)}<Pressable accessibilityRole="button" onPress={() => setItems((current) => [...current, { id: `step-${Date.now()}-${Math.random().toString(36).slice(2)}`, label: '' }])} style={styles.secondary}><Text style={styles.secondaryText}>+ Add step</Text></Pressable></>
      : <><Text style={styles.label}>{config.period === 'week' ? 'Weekly' : 'Daily'} goal · {config.unit}</Text><TextInput accessibilityLabel={`Goal in ${config.unit}`} keyboardType="decimal-pad" value={goal} onChangeText={setGoal} placeholder={`Choose ${config.unit}`} placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.help}>No target is prescribed. You can change yours later without rewriting past days.</Text></>}
    <Text style={styles.label}>Daily reminder · optional</Text><View style={styles.reminder}><TextInput accessibilityLabel="Reminder time" keyboardType="numbers-and-punctuation" value={reminder} onChangeText={setReminder} placeholder="9:00" placeholderTextColor={colors.textDim} style={[styles.input, styles.reminderInput]} />{(['AM', 'PM'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: period === choice }} onPress={() => setPeriod(choice)} style={[styles.period, period === choice && styles.selected]}><Text style={styles.secondaryText}>{choice}</Text></Pressable>)}</View><Text style={styles.help}>Leave the time blank to keep reminders off.</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}<Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.primary}><Text style={styles.primaryText}>{saving ? 'Saving…' : existing ? 'Save habit' : 'Create habit'}</Text></Pressable>
    {existing && <View style={styles.management}><Text style={styles.label}>Manage this habit</Text><Pressable accessibilityRole="button" onPress={() => { if (existing.archived && trackers.some((item) => item.id !== existing.id && item.habitTemplate === existing.habitTemplate && !item.archived)) { Alert.alert('Already active', 'Archive the other habit of this type before restoring this one.'); return; } setArchived(existing.id, !existing.archived); router.replace('/habits' as Href); }} style={styles.secondary}><Text style={styles.secondaryText}>{existing.archived ? 'Restore habit' : 'Archive habit'}</Text></Pressable><Text style={styles.help}>To delete this habit and its logs, type DELETE below.</Text><TextInput accessibilityLabel="Type DELETE to permanently remove habit" value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" style={styles.input} /><Pressable accessibilityRole="button" disabled={deleteText !== 'DELETE'} onPress={() => Alert.alert('Permanently delete habit?', 'This removes its history and cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void deleteTracker(existing.id, true, 'DELETE').then((deleted) => { if (deleted) router.replace('/habits' as Href); }).catch((cause) => Alert.alert('Could not delete habit', cause instanceof Error ? cause.message : 'Try again.')); } }])} style={styles.secondary}><Text style={styles.error}>Delete habit permanently</Text></Pressable></View>}
  </KeyboardSafeScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 50, gap: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 15, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, heroText: { flex: 1 }, title: { color: colors.text, fontSize: 22, fontWeight: '900' }, help: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 10 }, input: { minHeight: 54, color: colors.text, fontSize: 18, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14 },
  step: { flexDirection: 'row', gap: 8, alignItems: 'center' }, stepInput: { flex: 1 }, remove: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, removeText: { color: colors.danger, fontSize: 27 },
  reminder: { flexDirection: 'row', gap: 8 }, reminderInput: { flex: 1 }, period: { minWidth: 52, minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, selected: { borderColor: colors.habitsNav, backgroundColor: colors.accentSoft },
  secondary: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: colors.habitsNav, fontWeight: '800' }, primary: { minHeight: 54, backgroundColor: colors.habitsNav, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, primaryText: { color: colors.background, fontWeight: '900', fontSize: 16 }, error: { color: colors.danger, fontSize: 13 },
  management: { marginTop: 20, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 15, gap: 12 },
});
