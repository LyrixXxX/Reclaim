import { Href, Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrackerBadgeShowcase } from '@/components/habit-milestone-showcase';
import { GoodHabitIcon } from './good-habit-icon';
import { exerciseModeOn, exerciseRegimenOn, goodHabitLogId, habitProgress, habitStreak, periodStart } from '@/lib/good-habit-templates';
import { localDateKey } from '@/lib/progress';
import { validWaterDate } from '@/lib/water-habit';
import { GoodHabitLog, Tracker } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';
import { DateField } from '@/components/date-field';
import { isoToUs } from '@/lib/us-date';

export function ExerciseHabitDetail({ tracker, logs }: { tracker: Tracker; logs: GoodHabitLog[] }) {
  const { saveGoodHabitLog, deleteGoodHabitLog } = useTrackers();
  const [date, setDate] = useState(localDateKey());
  const [rowId, setRowId] = useState('other');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const mode = exerciseModeOn(tracker, localDateKey());
  const regimen = exerciseRegimenOn(tracker, date);
  const progress = habitProgress(tracker, logs, []);
  const weekStart = periodStart(date, 'week');
  const weekLogs = logs.filter((log) => log.trackerId === tracker.id && log.eventDate >= weekStart && log.eventDate <= date).sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.recordedAt.localeCompare(a.recordedAt));
  const save = () => {
    if (!validWaterDate(date) || date > localDateKey() || date < (tracker.startedAt ? localDateKey(new Date(tracker.startedAt)) : date)) { setError('Choose a valid workout date on or after this habit began.'); return; }
    const minutes = duration.trim() ? Number(duration) : undefined;
    if (minutes !== undefined && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)) { setError('Enter a valid duration in minutes.'); return; }
    if (mode === 'minutes' && minutes === undefined) { setError('Enter workout minutes for a Minutes goal.'); return; }
    const row = regimen.find((item) => item.id === rowId);
    const previous = logs.find((log) => log.id === editing);
    saveGoodHabitLog({ id: editing ?? goodHabitLogId(), trackerId: tracker.id, eventDate: date, amount: 1, durationMinutes: minutes, workoutRowId: row?.id, workoutLabel: rowId === 'other' ? 'Other' : row?.label ?? previous?.workoutLabel ?? 'Other', note: note.trim() || undefined, source: 'manual', recordedAt: previous?.recordedAt ?? new Date().toISOString() });
    setEditing(null); setDuration(''); setNote(''); setRowId('other'); setError('');
  };
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.hero}><GoodHabitIcon type="exercise" size={72} /><View style={{ flex: 1 }}><Text style={styles.title}>{tracker.name}</Text><Text style={styles.muted}>Weekly workout goal · {mode === 'times' ? 'Times' : 'Minutes'}</Text></View></View>
    <View style={styles.card}><Text style={styles.heading}>This week</Text><Text style={styles.value}>{progress.amount} / {progress.goal} {mode === 'times' ? 'workouts' : 'minutes'}</Text><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percent }} style={styles.track}><View style={[styles.fill, { width: `${progress.percent}%` }]} /></View><Text style={styles.muted}>{progress.percent}% · {habitStreak(tracker, logs, [])} consistent weeks</Text></View>
    <View style={styles.card}><Text style={styles.heading}>Your weekly regimen</Text>{regimen.length ? regimen.map((row) => <View key={row.id} style={styles.regimen}><Text style={styles.strong}>{row.label}</Text><Text style={styles.muted}>{row.days.length ? row.days.map((day) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day]).join(' · ') : 'No planned days'}</Text></View>) : <Text style={styles.muted}>No planned workouts yet. You can still log any session.</Text>}<Text style={styles.muted}>Planned days are flexible; workouts on other days still count.</Text></View>
    <View style={styles.card}><Text style={styles.heading}>{editing ? 'Correct workout' : 'Log a workout'}</Text><Text style={styles.muted}>Workout date · MM/DD/YYYY</Text><DateField accessibilityLabel="Workout date" value={date} onChangeText={setDate} style={styles.input} /><Text style={styles.muted}>Workout</Text><View style={styles.wrap}>{[...regimen, { id: 'other', label: 'Other', days: [] }].map((row) => <Pressable key={row.id} accessibilityRole="radio" accessibilityState={{ checked: rowId === row.id }} onPress={() => setRowId(row.id)} style={[styles.chip, rowId === row.id && styles.selected]}><Text style={styles.chipText}>{row.label}</Text></Pressable>)}</View><Text style={styles.muted}>Duration in minutes {mode === 'times' ? '· optional' : '· required'}</Text><TextInput accessibilityLabel="Workout duration in minutes" keyboardType="decimal-pad" value={duration} onChangeText={setDuration} style={styles.input} /><TextInput accessibilityLabel="Workout note" value={note} onChangeText={setNote} placeholder="Notes · optional" placeholderTextColor={colors.textDim} style={styles.input} />{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={save} style={styles.primary}><Text style={styles.primaryText}>{editing ? 'Save correction' : 'Log workout'}</Text></Pressable>{editing && <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setDuration(''); setNote(''); setRowId('other'); }} style={styles.chip}><Text style={styles.chipText}>Cancel edit</Text></Pressable>}</View>
    <TrackerBadgeShowcase trackerId={tracker.id} />
    <View style={styles.card}><Text style={styles.heading}>Workout history</Text><Text style={styles.muted}>Showing the selected week from {weekStart} through {isoToUs(date)}.</Text>{weekLogs.length ? weekLogs.map((log) => <View key={log.id} style={styles.history}><View style={{ flex: 1 }}><Text style={styles.strong}>{log.workoutLabel || 'Workout'} · {isoToUs(log.eventDate)}</Text><Text style={styles.muted}>{log.durationMinutes ? `${log.durationMinutes} min` : 'Duration not recorded'}{log.note ? ` · ${log.note}` : ''}</Text></View><Pressable accessibilityRole="button" onPress={() => { setEditing(log.id); setDate(log.eventDate); setRowId(log.workoutRowId ?? 'other'); setDuration(log.durationMinutes ? String(log.durationMinutes) : ''); setNote(log.note ?? ''); }} style={styles.action}><Text style={styles.actionText}>Edit</Text></Pressable><Pressable accessibilityRole="button" onPress={() => Alert.alert('Delete workout?', 'This removes this habit log only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteGoodHabitLog(log.id) }])} style={styles.action}><Text style={styles.error}>Delete</Text></Pressable></View>) : <Text style={styles.muted}>No workouts in this selected week.</Text>}</View>
    <Link href={`/good-habit-form?type=exercise&id=${encodeURIComponent(tracker.id)}` as Href} style={styles.edit}>Edit goal, regimen, or reminder</Link>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60, gap: 14 }, hero: { flexDirection: 'row', alignItems: 'center', gap: 15 }, title: { color: colors.text, fontSize: 24, fontFamily: font.bold }, muted: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 19 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, gap: 12 }, heading: { color: colors.text, fontSize: 18, fontFamily: font.bold }, value: { color: colors.text, fontSize: 31, fontFamily: font.bold }, strong: { color: colors.text, fontSize: 14, fontFamily: font.semibold }, track: { height: 14, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.habitsNav }, regimen: { padding: 12, backgroundColor: colors.surfaceRaised, borderRadius: 12, gap: 3 }, input: { minHeight: 50, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, fontSize: 16, fontFamily: font.regular, paddingHorizontal: 13 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' }, selected: { borderColor: colors.habitsNav, backgroundColor: colors.accentSoft }, chipText: { color: colors.text, fontFamily: font.bold }, primary: { minHeight: 50, backgroundColor: colors.habitsNav, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: colors.background, fontFamily: font.bold }, history: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 }, action: { minHeight: 44, justifyContent: 'center' }, actionText: { color: colors.habitsNav, fontFamily: font.semibold }, error: { color: colors.danger, fontSize: 12 , fontFamily: font.regular}, edit: { textAlign: 'center', color: colors.habitsNav, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', fontFamily: font.semibold } });
