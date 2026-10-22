import { Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { WorkoutButton, WorkoutCard, WorkoutInput, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { BUILTIN_EXERCISES, makeWorkoutExercise, newId } from '@/lib/workouts';
import { ExerciseEquipment, ExerciseMeasurement, MuscleGroup, StrengthExercise } from '@/models/tracker';
import { MUSCLE_GROUPS } from '@/lib/workout-muscles';
import { searchStrengthExercises, similarStrengthExercises } from '@/lib/strength-exercise-search';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

const equipment: ExerciseEquipment[] = ['machine','barbell','dumbbell','cable','bodyweight','other'];
const measurements: ExerciseMeasurement[] = ['weighted_reps','bodyweight_reps','assisted_reps','timed_hold','distance_carry'];
export default function Exercises() {
  const params = useLocalSearchParams<{ select?: string }>();
  const { strengthExercises = [], workoutSessions = [], saveStrengthExercise, activeWorkout, updateActiveWorkout } = useTrackers();
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<ExerciseEquipment | 'all'>('all'), [muscleFilter, setMuscleFilter] = useState<MuscleGroup | 'all'>('all'), [source, setSource] = useState<'all' | 'custom'>('all'), [creating, setCreating] = useState(false);
  const [name, setName] = useState(''), [muscle, setMuscle] = useState<MuscleGroup>('chest'), [gear, setGear] = useState<ExerciseEquipment>('machine'), [notes, setNotes] = useState('');
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]), [editingId, setEditingId] = useState<string | null>(null), [measurement, setMeasurement] = useState<ExerciseMeasurement>('weighted_reps');
  const exercises = useMemo(() => {
    const results = searchStrengthExercises([...BUILTIN_EXERCISES, ...strengthExercises], query, { equipment: filter, muscle: muscleFilter, source });
    if (query.trim()) return results;
    const recent = [...workoutSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).flatMap((session) => session.exercises.map((item) => item.exerciseId));
    return results.sort((a, b) => {
      const ai = recent.indexOf(a.id), bi = recent.indexOf(b.id);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.name.localeCompare(b.name);
    });
  }, [strengthExercises, workoutSessions, filter, muscleFilter, query, source]);
  const select = (exercise: typeof exercises[number]) => {
    if (!activeWorkout || !params.select) {
      Alert.alert(exercise.name, `${exercise.equipment} · ${exercise.primaryMuscle}${exercise.notes ? `\n${exercise.notes}` : ''}`, [
        { text: 'Cancel' },
        { text: 'View progress', onPress: () => router.push(`/workout-exercise-progress?id=${exercise.id}` as Href) },
        ...(exercise.custom ? [{ text: 'Edit', onPress: () => { setEditingId(exercise.id); setName(exercise.name); setMuscle(exercise.primaryMuscle); setSecondary(exercise.secondaryMuscles); setGear(exercise.equipment); setMeasurement(exercise.measurementType ?? (exercise.equipment === 'bodyweight' ? 'bodyweight_reps' : 'weighted_reps')); setNotes(exercise.notes ?? ''); setCreating(true); } }] : []),
      ]);
      return;
    }
    const add = () => {
      const entry = makeWorkoutExercise(exercise);
      updateActiveWorkout((session) => ({ ...session, exercises: [...session.exercises, entry], currentExerciseId: entry.id }));
      router.back();
    };
    if (activeWorkout.exercises.some((entry) => entry.exerciseId === exercise.id)) {
      Alert.alert('Already in this workout', `${exercise.name} is already listed. Add it again as a separate block?`, [{ text: 'Cancel' }, { text: 'Add another', onPress: add }]);
    } else add();
  };
  const saveCustom = (saveToLibrary: boolean) => {
    if (!name.trim()) return Alert.alert('Name required', 'Enter an exercise name.');
    const exercise: StrengthExercise = { id: editingId ?? newId(), name: name.trim(), primaryMuscle: muscle, secondaryMuscles: secondary.filter((item) => item !== muscle), equipment: gear, measurementType: measurement, notes: notes.trim() || undefined, custom: true };
    const done = (selected: StrengthExercise, persist: boolean) => {
      const commit = () => {
        if (persist) saveStrengthExercise(selected);
        if (params.select && activeWorkout) {
          const entry = makeWorkoutExercise(selected);
          updateActiveWorkout((session) => ({ ...session, exercises: [...session.exercises, entry], currentExerciseId: entry.id }));
          router.back();
        }
        setCreating(false); setEditingId(null); setName(''); setNotes(''); setSecondary([]);
      };
      if (params.select && activeWorkout?.exercises.some((entry) => entry.exerciseId === selected.id)) {
        Alert.alert('Already in this workout', `${selected.name} is already listed. Add it again as a separate block?`, [{ text: 'Cancel' }, { text: 'Add another', onPress: commit }]);
      } else commit();
    };
    if (!saveToLibrary) return done(exercise, false);
    const matches = similarStrengthExercises([...BUILTIN_EXERCISES, ...strengthExercises], exercise, editingId ?? undefined);
    if (matches.length) Alert.alert('Similar exercise exists', `${matches[0].name} already uses this name, muscle, and equipment.`, [{ text: 'Cancel' }, { text: 'Use existing', onPress: () => done(matches[0], false) }, { text: 'Save separately', onPress: () => done(exercise, true) }]);
    else done(exercise, true);
  };
  return <WorkoutPage><WorkoutTitle>Exercise library</WorkoutTitle><WorkoutText>Search by exercise, muscle, or equipment. Recently logged exercises appear first; custom exercises stay on this device.</WorkoutText><WorkoutInput label="Search" value={query} onChangeText={setQuery} placeholder="Search exercises" />
    <WorkoutText>Muscle group</WorkoutText><View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{(['all', ...MUSCLE_GROUPS] as const).map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setMuscleFilter(item)} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10, backgroundColor: muscleFilter === item ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: muscleFilter === item ? colors.background : colors.text }}>{item}</Text></Pressable>)}</View>
    <WorkoutText>Equipment</WorkoutText>
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{(['all', ...equipment] as const).map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setFilter(item)} style={{ padding: 10, borderRadius: 10, backgroundColor: filter === item ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: filter === item ? colors.background : colors.text }}>{item}</Text></Pressable>)}</View>
    <WorkoutText>Source</WorkoutText><View style={{ flexDirection: 'row', gap: 6 }}>{(['all','custom'] as const).map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setSource(item)} style={{ padding: 10, borderRadius: 10, backgroundColor: source === item ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: source === item ? colors.background : colors.text }}>{item}</Text></Pressable>)}</View>
    <WorkoutButton label={creating ? 'Cancel custom exercise' : 'Add custom exercise'} secondary onPress={() => setCreating(!creating)} />
    {creating && <WorkoutCard><WorkoutInput label="Exercise name" value={name} onChangeText={setName} /><WorkoutInput label="Notes (optional)" value={notes} onChangeText={setNotes} /><WorkoutText>Primary muscle</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{MUSCLE_GROUPS.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => { setMuscle(item); setSecondary(secondary.filter((group) => group !== item)); }} style={{ padding: 9, borderRadius: 9, backgroundColor: muscle === item ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: muscle === item ? colors.background : colors.text }}>{item}</Text></Pressable>)}</View><WorkoutText>Secondary muscles (optional)</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{MUSCLE_GROUPS.filter((item) => item !== muscle).map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setSecondary((current) => current.includes(item) ? current.filter((group) => group !== item) : [...current, item])} style={{ padding: 9, borderRadius: 9, backgroundColor: secondary.includes(item) ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: secondary.includes(item) ? colors.background : colors.text }}>{item}</Text></Pressable>)}</View><WorkoutText>Equipment</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{equipment.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setGear(item)} style={{ padding: 9, borderRadius: 9, backgroundColor: gear === item ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: gear === item ? colors.background : colors.text }}>{item}</Text></Pressable>)}</View><WorkoutText>How is it logged?</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{measurements.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setMeasurement(item)} style={{ padding: 9, borderRadius: 9, backgroundColor: measurement === item ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: measurement === item ? colors.background : colors.text }}>{item.replaceAll('_', ' ')}</Text></Pressable>)}</View><WorkoutButton label={editingId ? 'Save changes' : params.select ? 'Add here' : 'Save exercise'} onPress={() => saveCustom(!params.select || !!editingId)} />{!editingId && !!params.select && <WorkoutButton label="Save to library & add" secondary onPress={() => saveCustom(true)} />}</WorkoutCard>}
    {exercises.map((item) => <WorkoutRow key={item.id} title={item.name} subtitle={`${item.equipment} · ${item.primaryMuscle}${item.custom ? ' · custom' : ''}`} onPress={() => select(item)} />)}
    {!exercises.length && <WorkoutText>No exercises match these filters.</WorkoutText>}
  </WorkoutPage>;
}
