import { Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { WorkoutButton, WorkoutCard, WorkoutInput, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { exerciseProgress, volumeByPrimaryMuscle, weightedVolumeKg } from '@/lib/workout-analytics';
import { fromKg, newId, workoutElapsedMs, workoutReps, workoutSets, workoutVolumeKg } from '@/lib/workouts';
import { loggedWeightLabel, parseSetDraft, setAmountLabel, weightFieldLabel } from '@/lib/workout-entry';
import { StrengthSet } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

export default function WorkoutHistory() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { workoutSessions = [], workoutSettings, activeWorkout, beginWorkout, saveWorkoutRoutine, editWorkoutHistory, deleteWorkoutHistory } = useTrackers();
  const [selected, setSelected] = useState<string | null>(id ?? null);
  const [routineName, setRoutineName] = useState('');
  const [setId, setSetId] = useState<string | null>(null);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [setNotes, setSetNotes] = useState('');
  const [setKind, setSetKind] = useState<StrengthSet['kind']>('working');
  const [expandedGroup, setExpandedGroup] = useState<string>();
  const [sessionName, setSessionName] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const sessions = [...workoutSessions].sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
  const current = sessions.find((item) => item.id === selected);
  const unit = workoutSettings?.weightUnit ?? 'lb';
  const groups = current ? [...volumeByPrimaryMuscle(current).entries()].sort((a, b) => b[1].volumeKg - a[1].volumeKg) : [];
  const maxGroup = Math.max(1, ...groups.map(([, value]) => value.volumeKg));
  const repeat = () => {
    if (!current) return;
    if (activeWorkout) return Alert.alert('Workout already active', 'Finish or discard the current session first.');
    beginWorkout(current.name, { id: current.routineId ?? '', name: current.name, exercises: current.exercises.map((item) => ({ ...item, sets: [] })), createdAt: current.startedAt, updatedAt: current.endedAt! });
    router.push('/workout-session' as Href);
  };
  const beginEdit = (set: StrengthSet) => { setSetId(set.id); setReps(String(set.holdSeconds ?? set.distanceMeters ?? set.reps)); const load = set.assistanceKg ?? set.weightKg; setWeight(load === undefined ? '' : String(Math.round(fromKg(load, unit) * 10) / 10)); setSetNotes(set.notes ?? ''); setSetKind(set.kind); };
  const saveSet = () => {
    if (!current || !setId) return;
    const entry = current.exercises.find((item) => item.sets.some((set) => set.id === setId));
    const parsed = parseSetDraft({ reps, weight, notes: '', kind: 'working', unit }, entry?.measurementType);
    if (parsed.error || parsed.reps === undefined) return Alert.alert('Check set', parsed.error ?? 'Enter valid reps.');
    editWorkoutHistory({ ...current, exercises: current.exercises.map((entry) => ({ ...entry, sets: entry.sets.map((set) => set.id === setId ? { ...set, reps: parsed.reps!, weightKg: parsed.weightKg, assistanceKg: parsed.assistanceKg, holdSeconds: parsed.holdSeconds, distanceMeters: parsed.distanceMeters, notes: setNotes.trim() || undefined, kind: setKind } : set) })) });
    setSetId(null);
  };
  const makeRoutine = () => {
    if (!current) return;
    const label = routineName.trim() || current.name;
    saveWorkoutRoutine({ id: newId(), name: label, exercises: current.exercises.map((entry) => ({ id: newId(), exerciseId: entry.exerciseId, name: entry.name, primaryMuscle: entry.primaryMuscle, secondaryMuscles: entry.secondaryMuscles, equipment: entry.equipment, measurementType: entry.measurementType, sets: [] })), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setRoutineName(''); Alert.alert('Routine saved', label);
  };
  return <WorkoutPage><WorkoutTitle>Workout history</WorkoutTitle>{current ? <>
    <WorkoutCard><WorkoutTitle>{current.name}</WorkoutTitle><WorkoutText>{new Date(current.endedAt!).toLocaleString()}</WorkoutText><WorkoutText>{Math.round(workoutElapsedMs(current) / 60000)} min · {current.exercises.filter((entry) => entry.sets.length).length} exercises · {workoutSets(current).length} sets · {workoutReps(current)} reps</WorkoutText><WorkoutText>{Math.round(fromKg(workoutVolumeKg(current), unit)).toLocaleString()} {unit} training volume from entered external load</WorkoutText>
      {current.calories && <WorkoutText>{current.calories.kcal} {current.calories.type} kcal · {current.calories.source === 'estimated' ? 'estimate' : 'manual entry'} · {current.calories.activeKcal} active kcal</WorkoutText>}
      {current.notes && <WorkoutText>Notes: {current.notes}</WorkoutText>}
    </WorkoutCard>
    <WorkoutCard><WorkoutTitle>Volume by primary muscle</WorkoutTitle><WorkoutText>Weight × completed reps; bodyweight resistance is not assumed. Secondary muscles are not double-counted.</WorkoutText>
      {groups.map(([group, detail]) => <View key={group}><WorkoutRow title={`${group} · ${Math.round(fromKg(detail.volumeKg, unit)).toLocaleString()} ${unit}`} subtitle="Tap for exercise breakdown" onPress={() => setExpandedGroup(expandedGroup === group ? undefined : group)} /><View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, marginTop: 5, overflow: 'hidden' }}><View style={{ width: `${Math.max(2, detail.volumeKg / maxGroup * 100)}%`, height: 8, backgroundColor: colors.workoutsNav }} /></View>{expandedGroup === group && detail.exercises.map((entry) => <WorkoutText key={entry.id}>{entry.name} · {Math.round(fromKg(entry.volumeKg, unit)).toLocaleString()} {unit}</WorkoutText>)}</View>)}
      {!groups.length && <WorkoutText>No completed sets to break down.</WorkoutText>}
    </WorkoutCard>
    <WorkoutTitle>Exercise breakdown</WorkoutTitle>
    {current.exercises.map((entry) => {
      const prior = exerciseProgress(workoutSessions.filter((session) => session.id !== current.id && (session.endedAt ?? '') < current.endedAt!), entry.exerciseId);
      const previous = prior.at(-1);
      const nowPoint = exerciseProgress([current], entry.exerciseId)[0];
      const top = ['timed_hold','distance_carry','assisted_reps'].includes(entry.measurementType ?? '') ? 0 : Math.max(0, ...entry.sets.map((set) => set.weightKg ?? 0));
      const volume = weightedVolumeKg(entry.sets, entry.measurementType);
      const bestPrior = (field: 'topWeightKg' | 'volumeKg' | 'bestEstimatedOneRepMaxKg' | 'bestSingleKg') => Math.max(0, ...prior.map((point) => point[field] ?? 0));
      const priorReps = new Map<number, number>();
      for (const point of prior) for (const item of point.repsByWeight) priorReps.set(item.weightKg, Math.max(priorReps.get(item.weightKg) ?? 0, item.reps));
      const repImprovement = nowPoint?.repsByWeight.find((item) => priorReps.has(item.weightKg) && item.reps > priorReps.get(item.weightKg)!);
      return <WorkoutCard key={entry.id}><WorkoutTitle>{entry.name}</WorkoutTitle><WorkoutText>{entry.primaryMuscle} · {entry.sets.length} sets{entry.measurementType === 'timed_hold' ? ` · best hold ${Math.max(0, ...entry.sets.map((set) => set.holdSeconds ?? 0))} sec` : entry.measurementType === 'distance_carry' ? ` · best distance ${Math.max(0, ...entry.sets.map((set) => set.distanceMeters ?? 0))} m` : entry.measurementType === 'assisted_reps' ? ' · assistance logged separately' : ` · ${Math.round(fromKg(volume, unit))} ${unit} external-load volume · top ${top ? `${Math.round(fromKg(top, unit))} ${unit}` : '—'}`}</WorkoutText>
        {!!entry.secondaryMuscles?.length && <WorkoutText>Also involves {entry.secondaryMuscles.join(', ')} · not added to those muscle-group volume totals</WorkoutText>}
        {previous && <WorkoutText>{entry.measurementType === 'timed_hold' ? `Previous best hold: ${previous.bestHoldSeconds ?? '—'} sec` : entry.measurementType === 'distance_carry' ? `Previous best distance: ${previous.bestDistanceMeters ?? '—'} m` : entry.measurementType === 'assisted_reps' ? `Previous best reps: ${previous.bestReps ?? '—'}` : `Previous session: top ${previous.topWeightKg ? `${Math.round(fromKg(previous.topWeightKg, unit))} ${unit}` : '—'} · ${Math.round(fromKg(previous.volumeKg, unit))} ${unit} volume`}</WorkoutText>}
        {!!prior.length && nowPoint?.topWeightKg && nowPoint.topWeightKg > bestPrior('topWeightKg') && <WorkoutText>★ New heaviest weight</WorkoutText>}
        {!!prior.length && nowPoint?.bestSingleKg && nowPoint.bestSingleKg > bestPrior('bestSingleKg') && <WorkoutText>★ New heaviest completed single</WorkoutText>}
        {!!prior.length && nowPoint?.bestEstimatedOneRepMaxKg && nowPoint.bestEstimatedOneRepMaxKg > bestPrior('bestEstimatedOneRepMaxKg') && <WorkoutText>★ New estimated 1RM high</WorkoutText>}
        {!!prior.length && nowPoint?.volumeKg && nowPoint.volumeKg > bestPrior('volumeKg') && <WorkoutText>★ Highest session volume for this exercise (not necessarily a strength gain)</WorkoutText>}
        {repImprovement && <WorkoutText>★ More reps at {Math.round(fromKg(repImprovement.weightKg, unit) * 10) / 10} {unit}: {priorReps.get(repImprovement.weightKg)} → {repImprovement.reps}</WorkoutText>}
        {entry.notes && <WorkoutText>Note: {entry.notes}</WorkoutText>}
        {entry.sets.map((set, index) => <WorkoutRow key={set.id} title={`Set ${index + 1}: ${setAmountLabel(set, entry.measurementType)}`} subtitle={`${set.kind} · ${loggedWeightLabel(set, entry.equipment, unit, entry.measurementType)}${set.durationMs !== undefined ? ` · ${Math.round(set.durationMs / 1000)} sec measured` : ''}${set.notes ? ` · ${set.notes}` : ''} · tap to edit`} onPress={() => Alert.alert('Set', 'Edit or delete this logged set?', [{ text: 'Cancel' }, { text: 'Edit', onPress: () => beginEdit(set) }, { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Delete set?', 'All dependent totals will recalculate.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => editWorkoutHistory({ ...current, exercises: current.exercises.map((item) => item.id === entry.id ? { ...item, sets: item.sets.filter((existing) => existing.id !== set.id) } : item) }) }]) }])} />)}
        <WorkoutButton label="View exercise progress" secondary onPress={() => router.push(`/workout-exercise-progress?id=${entry.exerciseId}` as Href)} />
      </WorkoutCard>;
    })}
    {setId && <WorkoutCard><WorkoutTitle>Edit logged set</WorkoutTitle><View style={{ flexDirection: 'row', gap: 8 }}><WorkoutInput label={current.exercises.find((entry) => entry.sets.some((set) => set.id === setId))?.measurementType === 'timed_hold' ? 'Hold (seconds)' : current.exercises.find((entry) => entry.sets.some((set) => set.id === setId))?.measurementType === 'distance_carry' ? 'Distance (meters)' : 'Reps'} value={reps} onChangeText={setReps} numeric /><WorkoutInput label={weightFieldLabel(current.exercises.find((entry) => entry.sets.some((set) => set.id === setId))?.equipment ?? 'other', unit, current.exercises.find((entry) => entry.sets.some((set) => set.id === setId))?.measurementType)} value={weight} onChangeText={setWeight} numeric /></View><WorkoutInput label="Set note (optional)" value={setNotes} onChangeText={setSetNotes} /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{(['warmup', 'working', 'drop', 'failure'] as const).map((kind) => <WorkoutButton key={kind} label={kind} secondary={setKind !== kind} onPress={() => setSetKind(kind)} />)}</View><WorkoutButton label="Save changes" onPress={saveSet} /><WorkoutButton label="Cancel" secondary onPress={() => setSetId(null)} /></WorkoutCard>}
    <WorkoutCard><WorkoutTitle>Edit workout details</WorkoutTitle><WorkoutInput label="Name" value={sessionName} onChangeText={setSessionName} placeholder={current.name} /><WorkoutInput label="Notes" value={sessionNotes} onChangeText={setSessionNotes} placeholder={current.notes ?? 'Optional'} /><WorkoutButton label="Save details" secondary onPress={() => { editWorkoutHistory({ ...current, name: sessionName.trim() || current.name, notes: sessionNotes.trim() || current.notes }); setSessionName(''); setSessionNotes(''); }} /></WorkoutCard>
    <WorkoutButton label="Repeat workout" onPress={repeat} /><WorkoutInput label="Save as routine name" value={routineName} onChangeText={setRoutineName} placeholder={current.name} /><WorkoutButton label="Save exercise list as routine" secondary onPress={makeRoutine} />
    <WorkoutButton label="Delete workout" secondary onPress={() => Alert.alert('Delete workout?', 'This deletes the session and recalculates progress. This cannot be undone.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { deleteWorkoutHistory(current.id); setSelected(null); } }])} />
    <WorkoutButton label="Back to history" secondary onPress={() => { setSelected(null); setSetId(null); }} />
  </> : <>{sessions.map((item) => <WorkoutRow key={item.id} title={item.name} subtitle={`${new Date(item.endedAt!).toLocaleDateString()} · ${Math.round(workoutElapsedMs(item) / 60000)} min · ${workoutSets(item).length} sets`} onPress={() => setSelected(item.id)} />)}{!sessions.length && <WorkoutText>Finished workouts will appear here. Active sessions are saved separately.</WorkoutText>}</>}</WorkoutPage>;
}
