import { Href, Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoodHabitIcon } from './good-habit-icon';
import { checklistOn, goodHabitLogId, habitDate, habitProgress, habitStreak, routeMinutesOn, templateConfig } from '@/lib/good-habit-templates';
import { suggestProduce, ProduceSuggestion } from '@/lib/produce-ai';
import { localDateKey } from '@/lib/progress';
import { validWaterDate } from '@/lib/water-habit';
import { ActivityRoute, GoodHabitLog, NutritionEntry, Tracker } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';
import { readWalkingHistory, readWalkingIntervals } from '@/lib/activity-steps';
import { readActiveRoute } from '@/lib/activity-recording';
import { walkingMinutesHistoryOutsideRoutes, walkingMinutesOutsideRoutes } from '@/lib/walking-minutes';

export function GoodHabitTemplateDetail({ tracker, logs, routes, foods }: { tracker: Tracker; logs: GoodHabitLog[]; routes: ActivityRoute[]; foods: NutritionEntry[] }) {
  const config = templateConfig(tracker.habitTemplate);
  const { saveGoodHabitLog, deleteGoodHabitLog } = useTrackers();
  const [date, setDate] = useState(habitDate(tracker.habitTemplate));
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedFoodIds, setSelectedFoodIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<ProduceSuggestion[]>([]);
  const [pendingSuggestion, setPendingSuggestion] = useState<ProduceSuggestion | null>(null);
  const [replacementByEntry, setReplacementByEntry] = useState<Record<string, string>>({});
  const [phoneMinutes, setPhoneMinutes] = useState<number | null>(null);
  const [phoneMinutesByDate, setPhoneMinutesByDate] = useState<Record<string, number>>({});
  useFocusEffect(useCallback(() => {
    if (tracker.habitTemplate !== 'walk') return;
    let mounted = true;
    void Promise.all([readWalkingIntervals(localDateKey()), readWalkingHistory(), readActiveRoute()]).then(([intervals, history, active]) => {
      if (mounted) {
        setPhoneMinutes(intervals ? walkingMinutesOutsideRoutes(intervals, routes, active) : null);
        setPhoneMinutesByDate(walkingMinutesHistoryOutsideRoutes(history, routes, active));
      }
    }).catch(() => { if (mounted) setPhoneMinutes(null); });
    return () => { mounted = false; };
  }, [tracker.habitTemplate, routes]));
  if (!config || !tracker.habitTemplate) return null;
  const progress = habitProgress(tracker, logs, routes, new Date(), phoneMinutes ?? 0);
  const dayLogs = logs.filter((item) => item.trackerId === tracker.id && item.eventDate === date).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const checklist = config.checklist ? checklistOn(tracker, date) : [];
  const foodChoices = foods.filter((food) => food.eventDate === date && !logs.some((log) => log.trackerId === tracker.id && log.nutritionEntryId === food.id));
  const saveLog = (input: Pick<GoodHabitLog, 'amount' | 'eventDate' | 'note' | 'durationMinutes' | 'checklistItemId' | 'nutritionEntryId' | 'source'>, id?: string) => {
    if (!validWaterDate(input.eventDate) || input.eventDate > localDateKey() || input.eventDate < (tracker.startedAt ? localDateKey(new Date(tracker.startedAt)) : input.eventDate)) { setError('Choose a valid date on or after this habit started.'); return false; }
    if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10000) { setError('Enter an amount greater than zero.'); return false; }
    if (input.durationMinutes !== undefined && (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0 || input.durationMinutes > 1440)) { setError('Enter a duration in minutes, or leave it blank.'); return false; }
    saveGoodHabitLog({ id: id ?? editing ?? goodHabitLogId(), trackerId: tracker.id, eventDate: input.eventDate, amount: input.amount, note: input.note?.trim() || undefined, durationMinutes: input.durationMinutes, checklistItemId: input.checklistItemId, nutritionEntryId: input.nutritionEntryId, source: input.source ?? 'manual', recordedAt: new Date().toISOString() });
    setModal(false); setEditing(null); setAmount(''); setNote(''); setError('');
    return true;
  };
  const toggleStep = (id: string) => {
    const existing = dayLogs.find((log) => log.checklistItemId === id);
    if (existing) deleteGoodHabitLog(existing.id);
    else saveLog({ amount: 1, eventDate: date, checklistItemId: id, source: 'manual' });
  };
  const analyze = async () => {
    const selected = foodChoices.filter((food) => selectedFoodIds.includes(food.id));
    if (!selected.length) { setError('Select one or more Nutrition entries first.'); return; }
    setBusy(true); setError('');
    try { setSuggestions(await suggestProduce(selected)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Suggestions are unavailable. Manual logging still works.'); }
    finally { setBusy(false); }
  };
  const acceptSuggestion = (item: ProduceSuggestion, servings: number) => {
    if (!Number.isFinite(servings) || servings <= 0 || servings > 10000) { setError('Enter a valid serving amount.'); return; }
    const manual = dayLogs.filter((log) => log.source === 'manual');
    const replacementId = replacementByEntry[item.nutritionEntryId];
    if (manual.length && !manual.some((log) => log.id === replacementId)) { setError('Choose the manual log this suggestion replaces, or dismiss it.'); return; }
    if (!validWaterDate(date) || date > localDateKey() || date < (tracker.startedAt ? localDateKey(new Date(tracker.startedAt)) : date)) { setError('Choose a valid date on or after this habit started.'); return; }
    if (!saveLog({ amount: servings, eventDate: date, nutritionEntryId: item.nutritionEntryId, source: 'nutrition' })) return;
    if (replacementId) deleteGoodHabitLog(replacementId);
    setSuggestions((current) => current.filter((candidate) => candidate.nutritionEntryId !== item.nutritionEntryId));
    setPendingSuggestion(null);
  };
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <GoodHabitIcon type={tracker.habitTemplate} size={86} style={styles.icon} /><Text style={styles.title}>{tracker.name}</Text><Text style={styles.help}>{config.period === 'week' ? 'This week' : tracker.habitTemplate === 'sleep' ? 'This sleep night' : 'Today'} · {progress.date}</Text>
    <View style={styles.card}><Text style={styles.label}>CURRENT PROGRESS</Text><Text style={styles.big}>{Number(progress.amount.toFixed(1))}<Text style={styles.target}> / {progress.goal} {config.unit}</Text></Text><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percent }} style={styles.track}><View style={[styles.fill, { width: `${progress.percent}%` }]} /></View><Text style={styles.help}>{progress.percent}% of your {config.period === 'week' ? 'weekly' : 'daily'} goal · {habitStreak(tracker, logs, routes, new Date(), phoneMinutesByDate)} {config.period === 'week' ? 'weeks' : 'days'} consistent</Text>{tracker.habitTemplate === 'walk' && <Text style={styles.help}>{phoneMinutes === null ? 'Phone walking minutes unavailable' : `${Number(phoneMinutes.toFixed(1))} min from phone outside routes`} · {Number(routeMinutesOn(routes, tracker, progress.date).toFixed(1))} min from saved route movement{routes.some((route) => route.movingMs === undefined && ['walk', 'hike', 'run'].includes(route.kind) && localDateKey(new Date(route.startedAt)) === progress.date) ? ' (some estimated)' : ''} · manual logs</Text>}</View>
    <View style={styles.card}><Text style={styles.section}>Log and correct progress</Text><Text style={styles.help}>Date (YYYY-MM-DD)</Text><TextInput accessibilityLabel="Habit log date" value={date} onChangeText={setDate} style={styles.input} placeholderTextColor={colors.textDim} />
      {config.checklist ? checklist.map((item) => { const checked = dayLogs.some((log) => log.checklistItemId === item.id); return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggleStep(item.id)} style={styles.step}><Text style={styles.stepMark}>{checked ? '✓' : '○'}</Text><Text style={styles.stepText}>{item.label}</Text></Pressable>; })
        : <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setPendingSuggestion(null); setAmount(config.id === 'exercise' ? '1' : ''); setDuration(''); setNote(''); setModal(true); }} style={styles.primary}><Text style={styles.primaryText}>+ Log {config.id === 'exercise' ? 'workout' : config.id === 'produce' ? 'servings' : 'minutes'}</Text></Pressable>}
      {tracker.habitTemplate === 'produce' && <>
        <Text style={styles.help}>Optional: select food entries to ask AI for serving suggestions. Their descriptions and quantities are sent only when you tap Find suggestions.</Text>
        {foodChoices.map((food) => <Pressable key={food.id} accessibilityRole="checkbox" accessibilityState={{ checked: selectedFoodIds.includes(food.id) }} onPress={() => setSelectedFoodIds((current) => current.includes(food.id) ? current.filter((id) => id !== food.id) : [...current, food.id])} style={styles.step}><Text style={styles.stepMark}>{selectedFoodIds.includes(food.id) ? '✓' : '○'}</Text><Text style={styles.stepText}>{food.name} · {food.servings} serving(s)</Text></Pressable>)}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void analyze()} style={styles.secondary}><Text style={styles.secondaryText}>{busy ? 'Finding…' : 'Find suggestions'}</Text></Pressable>
        {suggestions.map((item) => {
          const food = foods.find((entry) => entry.id === item.nutritionEntryId);
          const manual = dayLogs.filter((log) => log.source === 'manual');
          return <View key={item.nutritionEntryId} style={styles.suggestion}>
            <Text style={styles.stepText}>{food?.name ?? 'Food'} · about {item.servings} servings</Text><Text style={styles.help}>{item.explanation}</Text>
            {manual.length > 0 && <><Text style={styles.help}>Possible overlap: choose one manual log to replace.</Text>{manual.map((log) => <Pressable key={log.id} accessibilityRole="radio" accessibilityState={{ checked: replacementByEntry[item.nutritionEntryId] === log.id }} onPress={() => setReplacementByEntry((current) => ({ ...current, [item.nutritionEntryId]: log.id }))} style={styles.step}><Text style={styles.stepMark}>{replacementByEntry[item.nutritionEntryId] === log.id ? '◉' : '○'}</Text><Text style={styles.stepText}>{log.amount} servings · {log.note || 'Manual log'}</Text></Pressable>)}</>}
            <View style={styles.row}><Pressable accessibilityRole="button" onPress={() => acceptSuggestion(item, item.servings)} style={styles.small}><Text style={styles.secondaryText}>{manual.length ? 'Replace selected' : 'Accept'}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { setAmount(String(item.servings)); setEditing(null); setPendingSuggestion(item); setModal(true); }} style={styles.small}><Text style={styles.secondaryText}>Edit</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setSuggestions((current) => current.filter((candidate) => candidate !== item))} style={styles.small}><Text style={styles.secondaryText}>Dismiss</Text></Pressable></View>
          </View>;
        })}
      </>}
      {error ? <Text style={styles.error}>{error}</Text> : null}</View>
    <View style={styles.card}><Text style={styles.section}>History for {date}</Text>{dayLogs.length ? dayLogs.map((log) => <View key={log.id} style={styles.history}><View style={{ flex: 1 }}><Text style={styles.stepText}>{log.checklistItemId ? checklist.find((item) => item.id === log.checklistItemId)?.label ?? 'Routine step' : `${log.amount} ${config.unit}`}{log.source === 'nutrition' ? ' · Nutrition' : ''}{log.durationMinutes ? ` · ${log.durationMinutes} min` : ''}</Text>{log.note ? <Text style={styles.help}>{log.note}</Text> : null}</View>{!config.checklist && <Pressable accessibilityRole="button" onPress={() => { setEditing(log.id); setAmount(String(log.amount)); setDuration(log.durationMinutes ? String(log.durationMinutes) : ''); setNote(log.note ?? ''); setModal(true); }} style={styles.small}><Text style={styles.secondaryText}>Edit</Text></Pressable>}<Pressable accessibilityRole="button" onPress={() => Alert.alert('Delete log?', 'This removes this habit log only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteGoodHabitLog(log.id) }])} style={styles.small}><Text style={styles.error}>Delete</Text></Pressable></View>) : <Text style={styles.help}>No entries for this date.</Text>}</View>
    <Link href={`/good-habit-form?type=${config.id}&id=${encodeURIComponent(tracker.id)}` as Href} style={styles.edit}>Edit goal, routine, or reminder</Link><Text style={styles.help}>Personal tracking only. Reclaim does not prescribe wellness targets.</Text>
    <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}><View style={styles.shade}><View style={styles.modalCard}><Text style={styles.section}>{pendingSuggestion ? 'Review suggested servings' : editing ? 'Edit log' : 'Add progress'}</Text><Text style={styles.help}>{config.id === 'exercise' ? 'One workout per log.' : `Amount in ${config.unit}`}</Text><TextInput autoFocus accessibilityLabel={`Amount in ${config.unit}`} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={config.id !== 'exercise'} style={styles.input} />{config.id === 'exercise' && <><Text style={styles.help}>Duration in minutes · optional</Text><TextInput accessibilityLabel="Workout duration in minutes" keyboardType="decimal-pad" value={duration} onChangeText={setDuration} style={styles.input} /></>}<TextInput accessibilityLabel="Optional note" value={note} onChangeText={setNote} placeholder="Note · optional" placeholderTextColor={colors.textDim} style={styles.input} /><Pressable accessibilityRole="button" onPress={() => pendingSuggestion ? acceptSuggestion(pendingSuggestion, Number(amount)) : saveLog({ amount: config.id === 'exercise' ? 1 : Number(amount), eventDate: date, note, durationMinutes: config.id === 'exercise' && duration.trim() ? Number(duration) : undefined, source: 'manual' })} style={styles.primary}><Text style={styles.primaryText}>{pendingSuggestion ? 'Accept edited suggestion' : 'Save log'}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { setModal(false); setPendingSuggestion(null); }} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View></View></Modal>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 55, gap: 14 }, icon: { alignSelf: 'center', marginTop: 10 }, title: { color: colors.text, fontSize: 27, fontWeight: '900', textAlign: 'center' }, help: { color: colors.textMuted, fontSize: 12, lineHeight: 19 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, gap: 12 }, label: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1 }, big: { color: colors.text, fontSize: 36, fontWeight: '900' }, target: { color: colors.textMuted, fontSize: 15 }, track: { height: 15, backgroundColor: colors.border, borderRadius: 8, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.habitsNav }, section: { color: colors.text, fontSize: 18, fontWeight: '900' }, input: { minHeight: 50, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, paddingHorizontal: 13 }, primary: { minHeight: 50, backgroundColor: colors.habitsNav, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: colors.background, fontWeight: '900', fontSize: 15 }, secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: colors.habitsNav, fontWeight: '800', fontSize: 13 }, step: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, backgroundColor: colors.surfaceRaised }, stepMark: { color: colors.habitsNav, fontSize: 22 }, stepText: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }, history: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 }, small: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }, suggestion: { padding: 12, gap: 6, borderColor: colors.habitsNav, borderWidth: 1, borderRadius: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, edit: { color: colors.habitsNav, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 15, borderRadius: 12, textAlign: 'center', overflow: 'hidden', fontWeight: '800' }, error: { color: colors.danger, fontSize: 12 }, shade: { flex: 1, justifyContent: 'center', backgroundColor: '#000000B5', padding: 20 }, modalCard: { padding: 20, backgroundColor: colors.surface, borderRadius: 20, gap: 12 },
});
