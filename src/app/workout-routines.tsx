import { Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { WorkoutButton, WorkoutCard, WorkoutInput, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { MUSCLE_GROUPS } from '@/lib/workout-muscles';
import { searchStrengthExercises, similarStrengthExercises } from '@/lib/strength-exercise-search';
import { BUILTIN_EXERCISES, makeWorkoutExercise, newId } from '@/lib/workouts';
import { ExerciseEquipment, ExerciseMeasurement, MuscleGroup, StrengthExercise, WorkoutRoutine } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const equipment: ExerciseEquipment[] = ['machine', 'barbell', 'dumbbell', 'cable', 'bodyweight', 'other'];
const measurements: ExerciseMeasurement[] = ['weighted_reps','bodyweight_reps','assisted_reps','timed_hold','distance_carry'];
const freshRoutine = (): WorkoutRoutine => ({ id: newId(), name: '', exercises: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

export default function WorkoutRoutines() {
  const params = useLocalSearchParams<{ create?: string }>();
  const { workoutRoutines = [], saveWorkoutRoutine, deleteWorkoutRoutine, beginWorkout, activeWorkout, strengthExercises = [], saveStrengthExercise } = useTrackers();
  const [editing, setEditing] = useState<WorkoutRoutine | null>(() => params.create === '1' ? freshRoutine() : null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [searchMuscle, setSearchMuscle] = useState<MuscleGroup | 'all'>('all');
  const [searchEquipment, setSearchEquipment] = useState<ExerciseEquipment | 'all'>('all');
  const [searchSource, setSearchSource] = useState<'all' | 'custom'>('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>('chest');
  const [customSecondary, setCustomSecondary] = useState<MuscleGroup[]>([]);
  const [customEquipment, setCustomEquipment] = useState<ExerciseEquipment>('machine');
  const [customMeasurement, setCustomMeasurement] = useState<ExerciseMeasurement>('weighted_reps');
  const [customNotes, setCustomNotes] = useState('');
  const found = search.trim() ? searchStrengthExercises([...BUILTIN_EXERCISES, ...strengthExercises], search, { muscle: searchMuscle, equipment: searchEquipment, source: searchSource }).slice(0, 30) : [];
  const activeFilterCount = Number(searchMuscle !== 'all') + Number(searchEquipment !== 'all') + Number(searchSource !== 'all');

  const open = (routine?: WorkoutRoutine) => {
    const next = routine ? { ...routine, exercises: routine.exercises.map((item) => ({ ...item })) } : freshRoutine();
    setEditing(next); setName(next.name); setNotes(next.notes ?? ''); setSearch(''); setAddingCustom(false);
  };
  const addExercise = (exercise: StrengthExercise) => {
    if (!editing) return;
    const add = () => { setEditing((old) => old ? { ...old, exercises: [...old.exercises, makeWorkoutExercise(exercise)] } : old); setSearch(''); };
    if (editing.exercises.some((entry) => entry.exerciseId === exercise.id)) Alert.alert('Already in this routine', `${exercise.name} is already listed. Add a second block?`, [{ text: 'Cancel' }, { text: 'Add another', onPress: add }]);
    else add();
  };
  const addCustom = (saveToLibrary: boolean) => {
    if (!customName.trim()) return Alert.alert('Exercise name required', 'Enter a name before adding it.');
    const exercise: StrengthExercise = { id: newId(), name: customName.trim(), primaryMuscle: customMuscle, secondaryMuscles: customSecondary.filter((group) => group !== customMuscle), equipment: customEquipment, measurementType: customMeasurement, notes: customNotes.trim() || undefined, custom: true };
    const add = (selected: StrengthExercise, persist: boolean) => { if (persist) saveStrengthExercise(selected); addExercise(selected); setCustomName(''); setCustomNotes(''); setCustomSecondary([]); setAddingCustom(false); };
    if (!saveToLibrary) return add(exercise, false);
    const matches = similarStrengthExercises([...BUILTIN_EXERCISES, ...strengthExercises], exercise);
    if (matches.length) Alert.alert('Similar exercise exists', `${matches[0].name} already uses this name, muscle, and equipment.`, [{ text: 'Cancel' }, { text: 'Use existing', onPress: () => add(matches[0], false) }, { text: 'Save separately', onPress: () => add(exercise, true) }]); else add(exercise, true);
  };
  const move = (index: number, direction: -1 | 1) => setEditing((old) => {
    if (!old || index + direction < 0 || index + direction >= old.exercises.length) return old;
    const exercises = [...old.exercises]; [exercises[index], exercises[index + direction]] = [exercises[index + direction], exercises[index]];
    return { ...old, exercises };
  });
  const launch = (routine: WorkoutRoutine) => {
    if (activeWorkout) return Alert.alert('Workout already active', 'Finish or discard the current workout first.');
    if (!routine.exercises.length) return Alert.alert('Add an exercise', 'This routine needs at least one exercise before you can start it.');
    beginWorkout(routine.name, routine); router.push('/workout-session' as Href);
  };
  const save = () => {
    if (!editing || !name.trim() || !editing.exercises.length) return Alert.alert('Complete routine', 'Add a routine name and at least one exercise. Sets and weights can wait until your workout.');
    saveWorkoutRoutine({ ...editing, name: name.trim(), notes: notes.trim() || undefined, updatedAt: new Date().toISOString() }); setEditing(null);
  };
  return <WorkoutPage><WorkoutTitle>Routines</WorkoutTitle><WorkoutText>Plan exercises now. Log actual sets, weights and reps during the workout.</WorkoutText>
    {editing ? <>
      <WorkoutInput label="Routine name" value={name} onChangeText={setName} placeholder="Push day" />
      <WorkoutInput label="Routine notes (optional)" value={notes} onChangeText={setNotes} placeholder="Anything to remember" />
      <WorkoutCard><WorkoutText>Assigned days (optional) · routines can be started any day</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{weekdays.map((day, index) => <Chip key={day} label={day} selected={!!editing.weekdays?.includes(index)} onPress={() => setEditing((old) => old ? { ...old, weekdays: old.weekdays?.includes(index) ? old.weekdays.filter((item) => item !== index) : [...(old.weekdays ?? []), index].sort() } : old)} />)}</View></WorkoutCard>
      <WorkoutCard><WorkoutText>Add an exercise</WorkoutText><WorkoutInput label="Search library" value={search} onChangeText={setSearch} placeholder="Name, muscle, or equipment" />
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersExpanded }} onPress={() => setFiltersExpanded((expanded) => !expanded)} style={{ minHeight: 44, borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surfaceRaised }}><Text style={{ color: colors.text, fontWeight: '600' }}>{filtersExpanded ? 'Hide filters' : 'Show filters'}{activeFilterCount ? ` · ${activeFilterCount} active` : ''} {filtersExpanded ? '⌃' : '⌄'}</Text></Pressable>
        {filtersExpanded && <>
          <WorkoutText>Filter by muscle</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['all', ...MUSCLE_GROUPS] as const).map((item) => <Chip key={item} label={item} selected={searchMuscle === item} onPress={() => setSearchMuscle(item)} />)}</View>
          <WorkoutText>Filter by equipment</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['all', ...equipment] as const).map((item) => <Chip key={item} label={item} selected={searchEquipment === item} onPress={() => setSearchEquipment(item)} />)}</View>
          <WorkoutText>Library source</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['all','custom'] as const).map((item) => <Chip key={item} label={item} selected={searchSource === item} onPress={() => setSearchSource(item)} />)}</View>
          {activeFilterCount > 0 && <WorkoutButton label="Clear filters" secondary onPress={() => { setSearchMuscle('all'); setSearchEquipment('all'); setSearchSource('all'); }} />}
        </>}
        {found.map((item) => <WorkoutRow key={item.id} title={`+ ${item.name}`} subtitle={`${item.equipment} · ${item.primaryMuscle}`} onPress={() => addExercise(item)} />)}
        {!!search.trim() && !found.length && <WorkoutText>No exercises match this search. Try another name or clear the filters.</WorkoutText>}
        <WorkoutButton label={addingCustom ? 'Cancel custom exercise' : 'Add custom exercise manually'} secondary onPress={() => setAddingCustom(!addingCustom)} />
        {addingCustom && <><WorkoutInput label="Exercise name" value={customName} onChangeText={setCustomName} /><WorkoutText>Primary muscle</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{MUSCLE_GROUPS.map((group) => <Chip key={group} label={group} selected={customMuscle === group} onPress={() => { setCustomMuscle(group); setCustomSecondary((old) => old.filter((item) => item !== group)); }} />)}</View>
          <WorkoutText>Secondary muscles (optional)</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{MUSCLE_GROUPS.filter((group) => group !== customMuscle).map((group) => <Chip key={group} label={group} selected={customSecondary.includes(group)} onPress={() => setCustomSecondary((old) => old.includes(group) ? old.filter((item) => item !== group) : [...old, group])} />)}</View>
          <WorkoutText>Equipment</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{equipment.map((item) => <Chip key={item} label={item} selected={customEquipment === item} onPress={() => setCustomEquipment(item)} />)}</View>
          <WorkoutText>How is it logged?</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{measurements.map((item) => <Chip key={item} label={item.replaceAll('_', ' ')} selected={customMeasurement === item} onPress={() => setCustomMeasurement(item)} />)}</View>
          <WorkoutInput label="Exercise notes (optional)" value={customNotes} onChangeText={setCustomNotes} /><WorkoutButton label="Add here" onPress={() => addCustom(false)} /><WorkoutButton label="Save to library & add" secondary onPress={() => addCustom(true)} /></>}
      </WorkoutCard>
      <WorkoutTitle>Exercise order</WorkoutTitle>{!editing.exercises.length && <WorkoutText>No exercises yet. Search or add one above.</WorkoutText>}
      {editing.exercises.map((entry, index) => <WorkoutCard key={entry.id}><WorkoutText>{index + 1}. {entry.name} · {entry.primaryMuscle} · {entry.equipment}</WorkoutText><View style={{ flexDirection: 'row', gap: 7 }}><View style={{ flex: 1 }}><WorkoutButton label="Up" secondary disabled={index === 0} onPress={() => move(index, -1)} /></View><View style={{ flex: 1 }}><WorkoutButton label="Down" secondary disabled={index === editing.exercises.length - 1} onPress={() => move(index, 1)} /></View><View style={{ flex: 1 }}><WorkoutButton label="Remove" secondary onPress={() => Alert.alert('Remove exercise?', entry.name, [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => setEditing((old) => old ? { ...old, exercises: old.exercises.filter((item) => item.id !== entry.id) } : old) }])} /></View></View></WorkoutCard>)}
      <WorkoutButton label="Save routine" onPress={save} /><WorkoutButton label="Cancel" secondary onPress={() => setEditing(null)} />
    </> : <><WorkoutButton label="Create routine" onPress={() => open()} /><WorkoutButton label="Build a training week" secondary onPress={() => router.push('/workout-plan' as Href)} />
      {workoutRoutines.map((routine) => <WorkoutCard key={routine.id}><WorkoutRow title={routine.name} subtitle={`${routine.exercises.length} exercises${routine.weekdays?.length ? ` · ${routine.weekdays.map((day) => weekdays[day]).join(', ')}` : ''} · tap to start`} onPress={() => launch(routine)} /><View style={{ flexDirection: 'row', gap: 7 }}><View style={{ flex: 1 }}><WorkoutButton label="Edit" secondary onPress={() => open(routine)} /></View><View style={{ flex: 1 }}><WorkoutButton label="Copy" secondary onPress={() => saveWorkoutRoutine({ ...routine, id: newId(), name: `${routine.name} copy`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), exercises: routine.exercises.map((item) => ({ ...item, id: newId() })) })} /></View><View style={{ flex: 1 }}><WorkoutButton label="Delete" secondary onPress={() => Alert.alert('Delete routine?', `${routine.name}\nPast workouts will remain.`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteWorkoutRoutine(routine.id) }])} /></View></View></WorkoutCard>)}{!workoutRoutines.length && <WorkoutText>No routines yet. Create one by choosing the exercises you want to do.</WorkoutText>}</>}
  </WorkoutPage>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11, backgroundColor: selected ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: selected ? colors.background : colors.text, fontWeight: '700' }}>{label}</Text></Pressable>;
}
