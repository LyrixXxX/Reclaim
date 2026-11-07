import { Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { WorkoutButton, WorkoutCard, WorkoutInput, WorkoutPage, WorkoutText } from '@/components/workout-ui';
import { BodyPartTag, EntryLine, NotepadPill, notepadStyles, PageHeader, PlannedLine, RestLine, SET_KIND_LABELS, SetLine } from '@/components/workout-notepad';
import { cancelWorkoutRest, scheduleWorkoutRest } from '@/lib/workout-notifications';
import { confirmationHaptic } from '@/lib/haptics';
import { DEFAULT_WORKOUT_SETTINGS, estimateWorkoutCalories, fromKg, manualWorkoutCalories, newId, remainingWorkoutRestMs, toKg, workoutElapsedMs, workoutSets } from '@/lib/workouts';
import { clearSetDraft, displayWeight, emptySetDraft, hasUnloggedSetInput, notepadSetLabel, parseSetDraft, recordCompletedSet, updateSetDraft } from '@/lib/workout-entry';
import { latestRouteWeightKg } from '@/lib/activity';
import { StrengthSet, WorkoutExercise, WorkoutSession, WorkoutSetDraft } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const SET_KINDS: StrengthSet['kind'][] = ['working', 'warmup', 'drop', 'failure'];

/** Placeholders and the word between the two fields, per measurement type. */
function entryFields(entry: WorkoutExercise, unit: 'lb' | 'kg') {
  switch (entry.measurementType) {
    case 'timed_hold': return { weight: `+ ${unit}`, amount: 'sec', joiner: 'hold' };
    case 'distance_carry': return { weight: unit, amount: 'm', joiner: 'carry' };
    case 'assisted_reps': return { weight: `assist ${unit}`, amount: 'reps', joiner: '×' };
    case 'bodyweight_reps': return { weight: `+ ${unit}`, amount: 'reps', joiner: '×' };
    default: return { weight: entry.equipment === 'bodyweight' ? `+ ${unit}` : unit, amount: 'reps', joiner: '×' };
  }
}

function draftFromSet(set: StrengthSet, unit: 'lb' | 'kg'): WorkoutSetDraft {
  const load = set.assistanceKg ?? set.weightKg;
  return { weight: load === undefined ? '' : displayWeight(load, unit), reps: String(set.holdSeconds ?? set.distanceMeters ?? set.reps), notes: '', kind: set.kind, unit };
}

export default function WorkoutSessionScreen() {
  const { activeWorkout, workoutSessions = [], workoutSettings, weightEntries = [], updateActiveWorkout, completeWorkout, discardWorkout } = useTrackers();
  const settings = { ...DEFAULT_WORKOUT_SETTINGS, ...workoutSettings };
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ exerciseId: string; setId: string; draft: WorkoutSetDraft } | null>(null);
  const [menuOpen, setMenuOpen] = useState<Record<string, boolean>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [setNotesOpen, setSetNotesOpen] = useState<Record<string, boolean>>({});
  const [calorieMode, setCalorieMode] = useState<'none' | 'light' | 'moderate' | 'vigorous' | 'manual'>('none');
  const [bodyWeight, setBodyWeight] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualType, setManualType] = useState<'active' | 'gross'>('active');
  const alertedRest = useRef<string | null>(null);
  const pendingSets = useRef(new Set<string>());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const deadline = activeWorkout?.restEndsAt;
    if (deadline && Date.parse(deadline) <= now && alertedRest.current !== deadline) {
      alertedRest.current = deadline;
      if (settings.haptics) confirmationHaptic();
    }
  }, [activeWorkout?.restEndsAt, now, settings.haptics]);
  if (!activeWorkout) return <WorkoutPage><WorkoutText>No workout page is open.</WorkoutText><WorkoutButton label="Back to Workouts" onPress={() => router.replace('/workouts' as Href)} /></WorkoutPage>;
  const session = activeWorkout;
  const unit = settings.weightUnit;
  const change = (update: (old: WorkoutSession) => WorkoutSession) => updateActiveWorkout(update);
  const storedWeight = latestRouteWeightKg(weightEntries, session.startedAt.slice(0, 10));
  const rest = remainingWorkoutRestMs(session, now);
  const resting = rest > 0 || session.restPausedMs !== undefined;
  const activeId = session.currentExerciseId ?? session.exercises[0]?.id;
  // The rest line sits under whichever exercise was logged most recently.
  const restExerciseId = session.exercises.reduce<{ id?: string; at: string }>((latest, entry) => {
    const at = entry.sets.reduce((max, set) => set.completedAt > max ? set.completedAt : max, '');
    return at > latest.at ? { id: entry.id, at } : latest;
  }, { at: '' }).id ?? activeId;
  const selectDraft = (entry: WorkoutExercise) => editing?.exerciseId === entry.id ? editing.draft : session.setDrafts?.[entry.id] ?? emptySetDraft(unit);
  const patchDraft = (entry: WorkoutExercise, patch: Partial<WorkoutSetDraft>) => {
    if (editing?.exerciseId === entry.id) setEditing((old) => old ? { ...old, draft: { ...old.draft, ...patch } } : old);
    else change((old) => updateSetDraft(old, entry.id, { ...patch, autoSuggested: false }, unit));
  };
  const suggest = (entry: WorkoutExercise, weightKg?: number, reps?: number) => patchDraft(entry, { weight: weightKg === undefined ? '' : displayWeight(weightKg, unit), reps: reps === undefined ? '' : String(reps), unit });
  const togglePause = () => session.pausedAt
    ? change((old) => ({ ...old, pausedMs: old.pausedMs + (Date.now() - Date.parse(old.pausedAt!)), pausedAt: undefined }))
    : change((old) => ({ ...old, pausedAt: new Date().toISOString(), setStartedAt: undefined, setExerciseId: undefined }));
  const stopRest = () => { void cancelWorkoutRest(session.restNotificationId); change((old) => ({ ...old, restStartedAt: undefined, restEndsAt: undefined, restPausedMs: undefined, restNotificationId: undefined })); };
  const toggleRestPause = () => {
    if (session.restPausedMs !== undefined) {
      const remaining = session.restPausedMs;
      change((old) => ({ ...old, restEndsAt: new Date(Date.now() + remaining).toISOString(), restPausedMs: undefined }));
      if (settings.restNotifications) void scheduleWorkoutRest(Math.ceil(remaining / 1000)).then((id) => change((old) => ({ ...old, restNotificationId: id }))).catch(() => {});
    } else {
      void cancelWorkoutRest(session.restNotificationId);
      change((old) => ({ ...old, restPausedMs: rest, restEndsAt: undefined, restNotificationId: undefined }));
    }
  };
  const extendRest = (seconds: number) => {
    void cancelWorkoutRest(session.restNotificationId);
    const remaining = session.restPausedMs ?? rest;
    const next = remaining + seconds * 1000;
    change((old) => ({ ...old, restEndsAt: old.restPausedMs !== undefined ? undefined : new Date(Date.now() + next).toISOString(), restPausedMs: old.restPausedMs !== undefined ? next : undefined, restNotificationId: undefined }));
    if (settings.restNotifications && session.restPausedMs === undefined) void scheduleWorkoutRest(Math.ceil(next / 1000)).then((id) => change((old) => ({ ...old, restNotificationId: id }))).catch(() => {});
  };
  const completeSet = async (entry: WorkoutExercise, override?: WorkoutSetDraft) => {
    if (session.pausedAt || pendingSets.current.has(entry.id)) return;
    const draft = override ?? selectDraft(entry);
    const parsed = parseSetDraft(draft, entry.measurementType);
    if (parsed.error || parsed.reps === undefined) return Alert.alert('Check set', parsed.error ?? 'Enter valid reps.');
    const isEdit = !override && editing?.exerciseId === entry.id;
    if (!isEdit && settings.timingMode === 'timed' && (!session.setStartedAt || (session.setExerciseId && session.setExerciseId !== entry.id))) return Alert.alert('Start this set', 'Tap Start set for this exercise before logging it.');
    const oldSet = isEdit ? entry.sets.find((set) => set.id === editing!.setId) : undefined;
    pendingSets.current.add(entry.id);
    try {
      const at = new Date().toISOString();
      const set: StrengthSet = { id: oldSet?.id ?? newId(), kind: draft.kind, weightKg: parsed.weightKg, assistanceKg: parsed.assistanceKg, holdSeconds: parsed.holdSeconds, distanceMeters: parsed.distanceMeters, reps: parsed.reps, notes: draft.notes.trim() || undefined,
        completedAt: oldSet?.completedAt ?? at, startedAt: oldSet?.startedAt ?? session.setStartedAt,
        durationMs: oldSet?.durationMs ?? (settings.timingMode === 'timed' && session.setStartedAt ? Math.max(0, Date.parse(at) - Date.parse(session.setStartedAt)) : undefined) };
      const seconds = isEdit || settings.timingMode === 'simple' ? 0 : entry.restSeconds ?? settings.exerciseRestSeconds[entry.exerciseId] ?? settings.restSeconds;
      if (!isEdit) await cancelWorkoutRest(session.restNotificationId);
      const notificationId = settings.restNotifications && seconds ? await scheduleWorkoutRest(seconds).catch(() => undefined) : undefined;
      change((old) => {
        const base = isEdit ? { ...old, exercises: old.exercises.map((item) => item.id === entry.id ? { ...item, sets: item.sets.map((existing) => existing.id === oldSet?.id ? set : existing) } : item) } : recordCompletedSet(old, entry.id, set, unit);
        return { ...base, currentExerciseId: entry.id,
          setStartedAt: isEdit ? old.setStartedAt : undefined, setExerciseId: isEdit ? old.setExerciseId : undefined,
          restStartedAt: isEdit ? old.restStartedAt : seconds ? at : undefined,
          restEndsAt: isEdit ? old.restEndsAt : seconds ? new Date(Date.now() + seconds * 1000).toISOString() : undefined,
          restPausedMs: isEdit ? old.restPausedMs : undefined, restNotificationId: isEdit ? old.restNotificationId : notificationId };
      });
      setEditing(null);
      setSetNotesOpen((old) => ({ ...old, [entry.id]: false }));
      if (settings.haptics) confirmationHaptic();
    } finally { pendingSets.current.delete(entry.id); }
  };
  const deleteSet = (entry: WorkoutExercise, setId: string) => Alert.alert('Delete this set?', 'It will be removed from this page.', [
    { text: 'Keep' },
    { text: 'Delete', style: 'destructive', onPress: () => { setEditing(null); change((old) => ({ ...old, exercises: old.exercises.map((item) => item.id === entry.id ? { ...item, sets: item.sets.filter((existing) => existing.id !== setId) } : item) })); } },
  ]);
  const move = (index: number, direction: -1 | 1) => change((old) => { if (index + direction < 0 || index + direction >= old.exercises.length) return old; const exercises = [...old.exercises]; [exercises[index], exercises[index + direction]] = [exercises[index + direction], exercises[index]]; return { ...old, exercises }; });
  const removeExercise = (entry: WorkoutExercise) => Alert.alert('Remove exercise?', 'Its logged sets will also be removed from this page.', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => change((old) => ({ ...clearSetDraft(old, entry.id), exercises: old.exercises.filter((item) => item.id !== entry.id), currentExerciseId: old.currentExerciseId === entry.id ? old.exercises.find((item) => item.id !== entry.id)?.id : old.currentExerciseId })) }]);
  const focusExercise = (entry: WorkoutExercise) => { if (editing) return Alert.alert('Finish editing?', 'Save or cancel the edited set first.'); Keyboard.dismiss(); change((old) => ({ ...old, currentExerciseId: entry.id })); };
  const finish = () => {
    const kg = bodyWeight.trim() ? toKg(Number(bodyWeight), unit) : storedWeight;
    if (calorieMode !== 'none' && calorieMode !== 'manual' && (!kg || !Number.isFinite(kg) || kg <= 0)) return Alert.alert('Body weight needed', 'Enter a body weight or select no estimate.');
    if (calorieMode === 'manual' && (!manualCalories.trim() || !Number.isFinite(Number(manualCalories)) || Number(manualCalories) < 0)) return Alert.alert('Check calories', 'Enter a nonnegative calorie value.');
    if (calorieMode === 'manual' && manualType === 'gross' && (!kg || kg <= 0)) return Alert.alert('Body weight needed', 'Enter body weight to derive active calories from total calories.');
    void cancelWorkoutRest(session.restNotificationId);
    if (calorieMode !== 'none') updateActiveWorkout((old) => ({ ...old, calories: calorieMode === 'manual' ? manualWorkoutCalories({ ...old, endedAt: new Date().toISOString() }, Number(manualCalories), manualType, kg ?? undefined) : estimateWorkoutCalories({ ...old, endedAt: new Date().toISOString() }, kg!, calorieMode) }));
    completeWorkout(); router.replace(`/workout-history?id=${session.id}` as Href);
  };
  const discard = () => { void cancelWorkoutRest(session.restNotificationId); discardWorkout(); router.replace('/workouts' as Href); };
  const finishWithCheck = () => {
    const hasDraft = !!editing || hasUnloggedSetInput(session.setDrafts);
    if (!workoutSets(session).length) return Alert.alert('Nothing logged yet', 'This page has no sets. Keep logging or discard it?', [{ text: 'Keep logging' }, { text: 'Discard page', style: 'destructive', onPress: discard }]);
    Alert.alert('Finish workout?', hasDraft ? 'You have unlogged entries. Finish without logging them?' : 'Save this page to your workout history?', [{ text: 'Keep logging' }, { text: 'Finish workout', onPress: finish }]);
  };
  const dateLabel = new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return <WorkoutPage>
    <PageHeader date={dateLabel} name={session.name} onRename={(name) => change((old) => ({ ...old, name }))} elapsed={clock(workoutElapsedMs(session, now))} paused={!!session.pausedAt} onTogglePause={togglePause} />
    {!session.exercises.length && <Text style={notepadStyles.hint}>A blank page. Add your first exercise and log each set as you go. The clock is already running.</Text>}
    {session.exercises.map((entry, index) => {
      const active = entry.id === activeId;
      const isEditing = editing?.exerciseId === entry.id;
      const draft = selectDraft(entry);
      const fields = entryFields(entry, unit);
      const lastSet = entry.sets.at(-1);
      const previous = [...workoutSessions].reverse().flatMap((item) => item.exercises).find((item) => item.exerciseId === entry.exerciseId && item.sets.length)?.sets.at(-1);
      const plannedLeft = Math.max(0, (entry.plannedSets ?? 0) - entry.sets.length);
      const plannedLabel = `${entry.targetWeightKg !== undefined ? `${displayWeight(entry.targetWeightKg, unit)} ${unit} × ` : ''}${entry.targetReps ?? '—'}${entry.targetWeightKg === undefined && entry.targetReps !== undefined ? ' reps' : ''}`;
      const timedRunning = !!session.setStartedAt && session.setExerciseId === entry.id;
      return <View key={entry.id} style={[notepadStyles.block, active && notepadStyles.blockActive]}>
        <View style={notepadStyles.blockHead}>
          <Text style={notepadStyles.exerciseName} numberOfLines={2}>{entry.name}</Text>
          <BodyPartTag muscle={entry.primaryMuscle} />
          <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name} options`} accessibilityState={{ expanded: !!menuOpen[entry.id] }} hitSlop={8} onPress={() => setMenuOpen((old) => ({ ...old, [entry.id]: !old[entry.id] }))} style={{ minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 20, lineHeight: 22 }}>⋯</Text>
          </Pressable>
        </View>
        {menuOpen[entry.id] && <View style={notepadStyles.tools}>
          <NotepadPill label={entry.notes || noteOpen[entry.id] ? 'Hide note' : 'Add note'} onPress={() => setNoteOpen((old) => ({ ...old, [entry.id]: !(old[entry.id] || entry.notes) }))} />
          <NotepadPill label="Move up" disabled={index === 0} onPress={() => move(index, -1)} />
          <NotepadPill label="Move down" disabled={index === session.exercises.length - 1} onPress={() => move(index, 1)} />
          <NotepadPill label="Remove" tone="danger" onPress={() => removeExercise(entry)} />
        </View>}
        {(entry.notes || noteOpen[entry.id]) && <TextInput accessibilityLabel={`${entry.name} note`} value={entry.notes ?? ''} placeholder="Exercise note" placeholderTextColor={colors.textDim} style={notepadStyles.noteInput} multiline
          onChangeText={(value) => change((old) => ({ ...old, exercises: old.exercises.map((item) => item.id === entry.id ? { ...item, notes: value } : item) }))} />}
        {entry.sets.map((set, setIndex) => <SetLine key={set.id} index={setIndex + 1} set={set} label={notepadSetLabel(set, entry.equipment, unit, entry.measurementType)}
          durationLabel={set.durationMs !== undefined ? clock(set.durationMs) : undefined} editing={isEditing && editing?.setId === set.id}
          onPress={() => { change((old) => ({ ...old, currentExerciseId: entry.id })); setEditing({ exerciseId: entry.id, setId: set.id, draft: { ...draftFromSet(set, unit), notes: set.notes ?? '' } }); }} />)}
        {Array.from({ length: plannedLeft }, (_, offset) => <PlannedLine key={`planned-${offset}`} index={entry.sets.length + offset + 1} label={plannedLabel}
          onPress={() => { change((old) => ({ ...old, currentExerciseId: entry.id })); suggest(entry, entry.targetWeightKg, entry.targetReps); }} />)}
        {resting && entry.id === restExerciseId && <RestLine remaining={clock(session.restPausedMs ?? rest)} paused={session.restPausedMs !== undefined} onSkip={stopRest} onTogglePause={toggleRestPause} onAdd={() => extendRest(30)} />}
        {active || isEditing ? <EntryLine index={isEditing ? entry.sets.findIndex((set) => set.id === editing!.setId) + 1 : entry.sets.length + 1}
          weight={draft.weight} amount={draft.reps} weightPlaceholder={fields.weight} amountPlaceholder={fields.amount} joiner={fields.joiner}
          onWeight={(value) => patchDraft(entry, { weight: value })} onAmount={(value) => patchDraft(entry, { reps: value })}
          onLog={() => void completeSet(entry)} logLabel={isEditing ? 'Save' : 'Log'} disabled={!!session.pausedAt}>
          {isEditing ? <>
            <NotepadPill label="Cancel" onPress={() => setEditing(null)} />
            <NotepadPill label="Delete set" tone="danger" onPress={() => deleteSet(entry, editing!.setId)} />
          </> : <>
            {lastSet && <NotepadPill label="+ Same again" tone="accent" disabled={!!session.pausedAt} onPress={() => void completeSet(entry, { ...draftFromSet(lastSet, unit), notes: '' })} />}
            {!lastSet && previous && <NotepadPill label={`Last time ${notepadSetLabel(previous, entry.equipment, unit, entry.measurementType)}`} onPress={() => suggest(entry, previous.assistanceKg ?? previous.weightKg, previous.holdSeconds ?? previous.distanceMeters ?? previous.reps)} />}
            {settings.timingMode === 'timed' && <NotepadPill label={timedRunning ? `Set ${clock(now - Date.parse(session.setStartedAt!))}` : 'Start set'} active={timedRunning} disabled={!!session.setStartedAt || !!session.pausedAt} onPress={() => change((old) => ({ ...old, setStartedAt: new Date().toISOString(), setExerciseId: entry.id }))} />}
          </>}
          <NotepadPill label={SET_KIND_LABELS[draft.kind]} onPress={() => patchDraft(entry, { kind: SET_KINDS[(SET_KINDS.indexOf(draft.kind) + 1) % SET_KINDS.length] })} />
          <NotepadPill label={draft.notes || setNotesOpen[entry.id] ? 'Note ✓' : 'Note'} onPress={() => setSetNotesOpen((old) => ({ ...old, [entry.id]: !old[entry.id] }))} />
        </EntryLine> : <View style={notepadStyles.tools}><NotepadPill label="+ Log a set" tone="accent" onPress={() => focusExercise(entry)} /></View>}
        {(active || isEditing) && (setNotesOpen[entry.id] || !!draft.notes) && <TextInput accessibilityLabel="Set note" value={draft.notes} onChangeText={(value) => patchDraft(entry, { notes: value })} placeholder="Note for this set" placeholderTextColor={colors.textDim} style={[notepadStyles.noteInput, { marginLeft: 32 }]} />}
      </View>;
    })}
    <Pressable accessibilityRole="button" accessibilityLabel="Add exercise" onPress={() => router.push('/workout-exercises?select=1' as Href)} style={notepadStyles.addExercise}><Text style={notepadStyles.addExerciseText}>+ Add exercise</Text></Pressable>
    <TextInput accessibilityLabel="Workout note" value={session.notes ?? ''} onChangeText={(value) => change((old) => ({ ...old, notes: value }))} placeholder="Notes for this workout" placeholderTextColor={colors.textDim} style={notepadStyles.noteInput} multiline />
    {settings.showCalories && <WorkoutCard><WorkoutText>Optional calories · estimates use session time, not training volume</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['none', 'light', 'moderate', 'vigorous', 'manual'] as const).map((mode) => <NotepadPill key={mode} label={mode === 'none' ? 'No estimate' : mode.charAt(0).toUpperCase() + mode.slice(1)} active={calorieMode === mode} onPress={() => setCalorieMode(mode)} />)}</View>{calorieMode !== 'none' && <WorkoutInput label={`Body weight (${unit})${storedWeight ? ' · recent weigh-in available' : ''}`} value={bodyWeight} onChangeText={setBodyWeight} numeric placeholder={storedWeight ? String(Math.round(fromKg(storedWeight, unit))) : 'Required for estimate'} />}{calorieMode === 'manual' && <><WorkoutInput label="Tracker calories" value={manualCalories} onChangeText={setManualCalories} numeric /><View style={{ flexDirection: 'row', gap: 6 }}><NotepadPill label="Active" active={manualType === 'active'} onPress={() => setManualType('active')} /><NotepadPill label="Gross" active={manualType === 'gross'} onPress={() => setManualType('gross')} /></View></>}</WorkoutCard>}
    <WorkoutButton label="Finish workout" onPress={finishWithCheck} />
    <WorkoutButton label="Discard page" secondary onPress={() => Alert.alert('Discard this page?', 'This permanently removes the workout in progress and its sets.', [{ text: 'Keep it' }, { text: 'Discard', style: 'destructive', onPress: discard }])} />
  </WorkoutPage>;
}
