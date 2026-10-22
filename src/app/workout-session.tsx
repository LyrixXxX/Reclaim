import { Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { WorkoutButton, WorkoutCard, WorkoutInput, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { cancelWorkoutRest, scheduleWorkoutRest } from '@/lib/workout-notifications';
import { confirmationHaptic } from '@/lib/haptics';
import { DEFAULT_WORKOUT_SETTINGS, estimateWorkoutCalories, fromKg, manualWorkoutCalories, newId, remainingWorkoutRestMs, toKg, workoutElapsedMs, workoutSets } from '@/lib/workouts';
import { clearSetDraft, displayWeight, emptySetDraft, hasUnloggedSetInput, loggedWeightLabel, parseSetDraft, recordCompletedSet, setAmountLabel, updateSetDraft, weightFieldLabel } from '@/lib/workout-entry';
import { latestRouteWeightKg } from '@/lib/activity';
import { StrengthSet, WorkoutExercise, WorkoutSession, WorkoutSetDraft } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export default function WorkoutSessionScreen() {
  const { activeWorkout, workoutSessions = [], workoutSettings, weightEntries = [], updateActiveWorkout, completeWorkout, discardWorkout } = useTrackers();
  const settings = { ...DEFAULT_WORKOUT_SETTINGS, ...workoutSettings };
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ exerciseId: string; setId: string; draft: WorkoutSetDraft } | null>(null);
  const [calorieMode, setCalorieMode] = useState<'none' | 'light' | 'moderate' | 'vigorous' | 'manual'>('none');
  const [bodyWeight, setBodyWeight] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualType, setManualType] = useState<'active' | 'gross'>('active');
  const alertedRest = useRef<string | null>(null);
  const pendingSets = useRef(new Set<string>());
  const scrollRef = useRef<ScrollView>(null);
  const exerciseOffsets = useRef<Record<string, number>>({});
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const deadline = activeWorkout?.restEndsAt;
    if (deadline && Date.parse(deadline) <= now && alertedRest.current !== deadline) {
      alertedRest.current = deadline;
      if (settings.haptics) confirmationHaptic();
    }
  }, [activeWorkout?.restEndsAt, now, settings.haptics]);
  if (!activeWorkout) return <WorkoutPage><WorkoutTitle>No active workout</WorkoutTitle><WorkoutButton label="Back to Workouts" onPress={() => router.replace('/workouts' as Href)} /></WorkoutPage>;
  const session = activeWorkout;
  const change = (update: (old: WorkoutSession) => WorkoutSession) => updateActiveWorkout(update);
  const storedWeight = latestRouteWeightKg(weightEntries, session.startedAt.slice(0, 10));
  const rest = remainingWorkoutRestMs(session, now);
  const selectDraft = (entry: WorkoutExercise) => editing?.exerciseId === entry.id ? editing.draft : session.setDrafts?.[entry.id] ?? emptySetDraft(settings.weightUnit);
  const patchDraft = (entry: WorkoutExercise, patch: Partial<WorkoutSetDraft>) => {
    if (editing?.exerciseId === entry.id) setEditing((old) => old ? { ...old, draft: { ...old.draft, ...patch } } : old);
    else change((old) => updateSetDraft(old, entry.id, { ...patch, autoSuggested: false }, settings.weightUnit));
  };
  const suggest = (entry: WorkoutExercise, weightKg?: number, reps?: number) => patchDraft(entry, { weight: weightKg === undefined ? '' : displayWeight(weightKg, settings.weightUnit), reps: reps === undefined ? '' : String(reps), unit: settings.weightUnit });
  const stopRest = () => { void cancelWorkoutRest(session.restNotificationId); change((old) => ({ ...old, restStartedAt: undefined, restEndsAt: undefined, restPausedMs: undefined, restNotificationId: undefined })); };
  const extendRest = (seconds: number) => {
    void cancelWorkoutRest(session.restNotificationId);
    const remaining = session.restPausedMs ?? rest;
    const next = remaining + seconds * 1000;
    change((old) => ({ ...old, restEndsAt: old.restPausedMs !== undefined ? undefined : new Date(Date.now() + next).toISOString(), restPausedMs: old.restPausedMs !== undefined ? next : undefined, restNotificationId: undefined }));
    if (settings.restNotifications && session.restPausedMs === undefined) void scheduleWorkoutRest(Math.ceil(next / 1000)).then((id) => change((old) => ({ ...old, restNotificationId: id }))).catch(() => {});
  };
  const completeSet = async (entry: WorkoutExercise) => {
    if (session.pausedAt || pendingSets.current.has(entry.id)) return;
    const draft = selectDraft(entry);
    const parsed = parseSetDraft(draft, entry.measurementType);
    if (parsed.error || parsed.reps === undefined) return Alert.alert('Check set', parsed.error ?? 'Enter valid reps.');
    const isEdit = editing?.exerciseId === entry.id;
    if (!isEdit && settings.timingMode === 'timed' && (!session.setStartedAt || (session.setExerciseId && session.setExerciseId !== entry.id))) return Alert.alert('Start this set', 'Tap Start timed set for this exercise before completing it.');
    const oldSet = isEdit ? entry.sets.find((set) => set.id === editing.setId) : undefined;
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
      const base = isEdit ? { ...old, exercises: old.exercises.map((item) => item.id === entry.id ? { ...item, sets: item.sets.map((existing) => existing.id === oldSet?.id ? set : existing) } : item) } : recordCompletedSet(old, entry.id, set, settings.weightUnit);
      return { ...base,
        setStartedAt: isEdit ? old.setStartedAt : undefined, setExerciseId: isEdit ? old.setExerciseId : undefined,
        restStartedAt: isEdit ? old.restStartedAt : seconds ? at : undefined,
        restEndsAt: isEdit ? old.restEndsAt : seconds ? new Date(Date.now() + seconds * 1000).toISOString() : undefined,
        restPausedMs: isEdit ? old.restPausedMs : undefined, restNotificationId: isEdit ? old.restNotificationId : notificationId };
    });
    setEditing(null);
    if (settings.haptics) confirmationHaptic();
    } finally { pendingSets.current.delete(entry.id); }
  };
  const editSet = (entry: WorkoutExercise, set: StrengthSet) => Alert.alert('Logged set', `${setAmountLabel(set, entry.measurementType)} · ${loggedWeightLabel(set, entry.equipment, settings.weightUnit, entry.measurementType)}`, [
    { text: 'Cancel' },
    { text: 'Delete set', style: 'destructive', onPress: () => change((old) => ({ ...old, exercises: old.exercises.map((item) => item.id === entry.id ? { ...item, sets: item.sets.filter((existing) => existing.id !== set.id) } : item) })) },
    { text: 'Edit', onPress: () => setEditing({ exerciseId: entry.id, setId: set.id, draft: { weight: set.weightKg === undefined && set.assistanceKg === undefined ? '' : displayWeight((set.assistanceKg ?? set.weightKg)!, settings.weightUnit), reps: String(set.holdSeconds ?? set.distanceMeters ?? set.reps), notes: set.notes ?? '', kind: set.kind, unit: settings.weightUnit } }) },
  ]);
  const move = (index: number, direction: -1 | 1) => change((old) => { if (index + direction < 0 || index + direction >= old.exercises.length) return old; const exercises = [...old.exercises]; [exercises[index], exercises[index + direction]] = [exercises[index + direction], exercises[index]]; return { ...old, exercises }; });
  const moveSet = (entry: WorkoutExercise, index: number, direction: -1 | 1) => change((old) => ({ ...old, exercises: old.exercises.map((item) => {
    if (item.id !== entry.id || index + direction < 0 || index + direction >= item.sets.length) return item;
    const sets = [...item.sets]; [sets[index], sets[index + direction]] = [sets[index + direction], sets[index]];
    return { ...item, sets };
  }) }));
  const finish = () => {
    const kg = bodyWeight.trim() ? toKg(Number(bodyWeight), settings.weightUnit) : storedWeight;
    if (calorieMode !== 'none' && calorieMode !== 'manual' && (!kg || !Number.isFinite(kg) || kg <= 0)) return Alert.alert('Body weight needed', 'Enter a body weight or select no estimate.');
    if (calorieMode === 'manual' && (!manualCalories.trim() || !Number.isFinite(Number(manualCalories)) || Number(manualCalories) < 0)) return Alert.alert('Check calories', 'Enter a nonnegative calorie value.');
    if (calorieMode === 'manual' && manualType === 'gross' && (!kg || kg <= 0)) return Alert.alert('Body weight needed', 'Enter body weight to derive active calories from total calories.');
    void cancelWorkoutRest(session.restNotificationId);
    if (calorieMode !== 'none') updateActiveWorkout((old) => ({ ...old, calories: calorieMode === 'manual' ? manualWorkoutCalories({ ...old, endedAt: new Date().toISOString() }, Number(manualCalories), manualType, kg ?? undefined) : estimateWorkoutCalories({ ...old, endedAt: new Date().toISOString() }, kg!, calorieMode) }));
    completeWorkout(); router.replace(`/workout-history?id=${session.id}` as Href);
  };
  const finishWithCheck = () => {
    const hasDraft = !!editing || hasUnloggedSetInput(session.setDrafts);
    if (!workoutSets(session).length) return Alert.alert('No sets logged', 'Nothing has been logged yet. Keep logging or discard this workout?', [{ text: 'Keep logging' }, { text: 'Discard workout', style: 'destructive', onPress: () => { void cancelWorkoutRest(session.restNotificationId); discardWorkout(); router.replace('/workouts' as Href); } }]);
    Alert.alert('Finish workout?', hasDraft ? 'You have unlogged set inputs. Finish without logging them?' : 'Save this completed workout to your history?', [{ text: 'Keep logging' }, { text: 'Finish workout', onPress: finish }]);
  };
  const nextExercise = (index: number) => {
    if (editing) return Alert.alert('Finish editing?', 'Save or cancel the edited set before moving on.');
    const next = session.exercises[index + 1];
    if (!next) return finishWithCheck();
    Keyboard.dismiss();
    setExpanded((old) => ({ ...old, [session.exercises[index].id]: false, [next.id]: true }));
    change((old) => ({ ...old, currentExerciseId: next.id }));
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (exerciseOffsets.current[next.id] ?? 0) - 12), animated: true }), 80);
  };
  return <WorkoutPage scrollRef={scrollRef}><WorkoutTitle>{session.name}</WorkoutTitle><WorkoutText>{clock(workoutElapsedMs(session, now))} elapsed · {workoutSets(session).length} completed sets · {session.pausedAt ? 'Paused' : settings.timingMode === 'smart' ? 'Smart Flow' : settings.timingMode === 'timed' ? 'Timed Sets' : 'Simple Logging'}</WorkoutText>
    <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><WorkoutButton label={session.pausedAt ? 'Resume' : 'Pause'} secondary onPress={() => session.pausedAt ? change((old) => ({ ...old, pausedMs: old.pausedMs + (Date.now() - Date.parse(old.pausedAt!)), pausedAt: undefined })) : change((old) => ({ ...old, pausedAt: new Date().toISOString(), setStartedAt: undefined, setExerciseId: undefined }))} /></View><View style={{ flex: 1 }}><WorkoutButton label="Add exercise" secondary onPress={() => router.push('/workout-exercises?select=1' as Href)} /></View></View>
    {(rest > 0 || session.restPausedMs !== undefined) && <WorkoutCard><WorkoutTitle>Rest · {clock(session.restPausedMs ?? rest)}</WorkoutTitle><WorkoutText>Countdown only; reaching zero does not measure lifting time.</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      <WorkoutButton label="Skip" secondary onPress={stopRest} />
      <WorkoutButton label={session.restPausedMs !== undefined ? 'Resume rest' : 'Pause rest'} secondary onPress={() => {
        if (session.restPausedMs !== undefined) { const remaining = session.restPausedMs; change((old) => ({ ...old, restEndsAt: new Date(Date.now() + remaining).toISOString(), restPausedMs: undefined })); if (settings.restNotifications) void scheduleWorkoutRest(Math.ceil(remaining / 1000)).then((id) => change((old) => ({ ...old, restNotificationId: id }))).catch(() => {}); }
        else { void cancelWorkoutRest(session.restNotificationId); change((old) => ({ ...old, restPausedMs: rest, restEndsAt: undefined, restNotificationId: undefined })); }
      }} /><WorkoutButton label="+30 sec" secondary onPress={() => extendRest(30)} />
    </View></WorkoutCard>}
    {!session.exercises.length && <WorkoutCard><WorkoutText>Add an exercise to start logging. Your session timer is already running.</WorkoutText></WorkoutCard>}
    {session.exercises.map((entry, index) => {
      const isExpanded = expanded[entry.id] ?? entry.id === (session.currentExerciseId ?? session.exercises[0]?.id);
      const draft = selectDraft(entry);
      const previous = [...workoutSessions].reverse().flatMap((item) => item.exercises).find((item) => item.exerciseId === entry.exerciseId && item.sets.length)?.sets.at(-1);
      return <View key={entry.id} onLayout={(event) => { exerciseOffsets.current[entry.id] = event.nativeEvent.layout.y; }}><WorkoutCard>
        <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name}, ${isExpanded ? 'collapse' : 'expand'}`} onPress={() => setExpanded((old) => ({ ...old, [entry.id]: !isExpanded }))}><WorkoutTitle>{index + 1}. {entry.name} {isExpanded ? '⌃' : '⌄'}</WorkoutTitle><WorkoutText>{entry.primaryMuscle} · {entry.equipment} · {entry.sets.length} completed sets</WorkoutText></Pressable>
        {isExpanded && <>
          {entry.sets.map((set, setIndex) => <View key={set.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ flex: 1 }}><WorkoutRow title={`Set ${setIndex + 1} · ${setAmountLabel(set, entry.measurementType)} · ${loggedWeightLabel(set, entry.equipment, settings.weightUnit, entry.measurementType)}`} subtitle={`${set.kind}${set.durationMs !== undefined ? ` · ${clock(set.durationMs)} measured` : ''}${set.notes ? ` · ${set.notes}` : ''} · tap to edit`} onPress={() => editSet(entry, set)} /></View><Pressable accessibilityRole="button" accessibilityLabel={`Move set ${setIndex + 1} up`} disabled={setIndex === 0} onPress={() => moveSet(entry, setIndex, -1)} style={{ minWidth: 42, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.workoutsNav, opacity: setIndex === 0 ? 0.35 : 1 }}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Move set ${setIndex + 1} down`} disabled={setIndex === entry.sets.length - 1} onPress={() => moveSet(entry, setIndex, 1)} style={{ minWidth: 42, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.workoutsNav, opacity: setIndex === entry.sets.length - 1 ? 0.35 : 1 }}>↓</Text></Pressable></View>)}
          <WorkoutText>{editing?.exerciseId === entry.id ? 'Edit completed set' : `Next set · ${entry.sets.length + 1}`}</WorkoutText>
          <View style={{ flexDirection: 'row', gap: 8 }}><WorkoutInput label={weightFieldLabel(entry.equipment, draft.unit, entry.measurementType)} value={draft.weight} onChangeText={(value) => patchDraft(entry, { weight: value })} numeric /><WorkoutInput label={entry.measurementType === 'timed_hold' ? 'Hold (seconds)' : entry.measurementType === 'distance_carry' ? 'Distance (meters)' : 'Reps'} value={draft.reps} onChangeText={(value) => patchDraft(entry, { reps: value })} numeric /></View>
          {entry.equipment === 'bodyweight' && <WorkoutText>Leave added weight blank for bodyweight.</WorkoutText>}
          {!entry.sets.length && previous && <WorkoutButton label={`Use previous workout · ${setAmountLabel(previous, entry.measurementType)} · ${loggedWeightLabel(previous, entry.equipment, settings.weightUnit, entry.measurementType)}`} secondary onPress={() => suggest(entry, previous.assistanceKg ?? previous.weightKg, previous.holdSeconds ?? previous.distanceMeters ?? previous.reps)} />}
          {!entry.sets.length && (entry.targetReps !== undefined || entry.targetWeightKg !== undefined) && <WorkoutButton label={`Use routine target · ${entry.targetReps ?? '—'} reps${entry.targetWeightKg !== undefined ? ` · ${displayWeight(entry.targetWeightKg, settings.weightUnit)} ${settings.weightUnit}` : ''}`} secondary onPress={() => suggest(entry, entry.targetWeightKg, entry.targetReps)} />}
          <WorkoutInput label="Set note (optional)" value={draft.notes} onChangeText={(value) => patchDraft(entry, { notes: value })} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{(['warmup', 'working', 'drop', 'failure'] as const).map((kind) => <Pressable accessibilityRole="button" accessibilityState={{ selected: draft.kind === kind }} key={kind} onPress={() => patchDraft(entry, { kind })} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 10, backgroundColor: draft.kind === kind ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: draft.kind === kind ? colors.background : colors.text }}>{kind}</Text></Pressable>)}</View>
          {settings.timingMode === 'timed' && !editing && <WorkoutButton label={session.setStartedAt ? `Set running · ${clock(now - Date.parse(session.setStartedAt))}` : 'Start timed set'} secondary disabled={!!session.setStartedAt || !!session.pausedAt} onPress={() => change((old) => ({ ...old, setStartedAt: new Date().toISOString(), setExerciseId: entry.id }))} />}
          <WorkoutButton label={editing?.exerciseId === entry.id ? 'Save edited set' : 'Complete set + add to log'} disabled={!!session.pausedAt} onPress={() => void completeSet(entry)} />
          {!editing && <WorkoutButton label={index === session.exercises.length - 1 ? 'Done with exercise · Finish workout' : 'Done with exercise → Next'} secondary onPress={() => nextExercise(index)} />}
          {editing?.exerciseId === entry.id && <WorkoutButton label="Cancel edit" secondary onPress={() => setEditing(null)} />}
          <WorkoutInput label="Exercise note (optional)" value={entry.notes ?? ''} onChangeText={(value) => change((old) => ({ ...old, exercises: old.exercises.map((item) => item.id === entry.id ? { ...item, notes: value } : item) }))} />
          <View style={{ flexDirection: 'row', gap: 7 }}><View style={{ flex: 1 }}><WorkoutButton label="Move up" secondary disabled={index === 0} onPress={() => move(index, -1)} /></View><View style={{ flex: 1 }}><WorkoutButton label="Move down" secondary disabled={index === session.exercises.length - 1} onPress={() => move(index, 1)} /></View></View>
          <WorkoutButton label="Remove exercise" secondary onPress={() => Alert.alert('Remove exercise?', 'Its logged sets will also be removed from this active session.', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => change((old) => ({ ...clearSetDraft(old, entry.id), exercises: old.exercises.filter((item) => item.id !== entry.id), currentExerciseId: old.currentExerciseId === entry.id ? old.exercises.find((item) => item.id !== entry.id)?.id : old.currentExerciseId })) }])} />
        </>}
      </WorkoutCard></View>;
    })}
    <WorkoutInput label="Workout note (optional)" value={session.notes ?? ''} onChangeText={(value) => change((old) => ({ ...old, notes: value }))} />
    {settings.showCalories && <WorkoutCard><WorkoutText>Optional calories · estimates use session time, not training volume</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{(['none', 'light', 'moderate', 'vigorous', 'manual'] as const).map((mode) => <Pressable accessibilityRole="button" key={mode} onPress={() => setCalorieMode(mode)} style={{ padding: 10, borderRadius: 10, backgroundColor: calorieMode === mode ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: calorieMode === mode ? colors.background : colors.text }}>{mode}</Text></Pressable>)}</View>{calorieMode !== 'none' && <WorkoutInput label={`Body weight (${settings.weightUnit})${storedWeight ? ' · recent weigh-in available' : ''}`} value={bodyWeight} onChangeText={setBodyWeight} numeric placeholder={storedWeight ? String(Math.round(fromKg(storedWeight, settings.weightUnit))) : 'Required for estimate'} />}{calorieMode === 'manual' && <><WorkoutInput label="Tracker calories" value={manualCalories} onChangeText={setManualCalories} numeric /><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><WorkoutButton label="Active" secondary={manualType !== 'active'} onPress={() => setManualType('active')} /></View><View style={{ flex: 1 }}><WorkoutButton label="Gross" secondary={manualType !== 'gross'} onPress={() => setManualType('gross')} /></View></View></>}</WorkoutCard>}
    <WorkoutButton label="Finish workout" onPress={finishWithCheck} /><WorkoutButton label="Discard workout" secondary onPress={() => Alert.alert('Discard workout?', 'This permanently removes the active session and its sets.', [{ text: 'Keep workout' }, { text: 'Discard', style: 'destructive', onPress: () => { void cancelWorkoutRest(session.restNotificationId); discardWorkout(); router.replace('/workouts' as Href); } }])} />
  </WorkoutPage>;
}
