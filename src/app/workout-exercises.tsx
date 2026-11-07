import { Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chevron } from '@/components/icon';
import { WorkoutButton, WorkoutCard, WorkoutInput, WorkoutPage, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { BUILTIN_EXERCISES, makeWorkoutExercise, newId } from '@/lib/workouts';
import { ExerciseEquipment, ExerciseMeasurement, MuscleGroup, StrengthExercise } from '@/models/tracker';
import { MUSCLE_GROUPS } from '@/lib/workout-muscles';
import { BodyPart, BODY_PART_LABELS, BODY_PARTS, bodyPartFor, detailMusclesFor, genericMuscleFor, muscleLabel } from '@/lib/body-parts';
import { NotepadPill } from '@/components/workout-notepad';
import { searchStrengthExercises, similarStrengthExercises } from '@/lib/strength-exercise-search';
import { useTrackers } from '@/state/tracker-context';
import { colors, font, radius } from '@/theme';

const equipment: ExerciseEquipment[] = ['machine','barbell','dumbbell','cable','bodyweight','other'];
const measurements: ExerciseMeasurement[] = ['weighted_reps','bodyweight_reps','assisted_reps','timed_hold','distance_carry'];
export default function Exercises() {
  const params = useLocalSearchParams<{ select?: string }>();
  const { strengthExercises = [], workoutSessions = [], saveStrengthExercise, activeWorkout, updateActiveWorkout } = useTrackers();
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<ExerciseEquipment | 'all'>('all'), [partFilter, setPartFilter] = useState<BodyPart | 'all'>('all'), [detailFilter, setDetailFilter] = useState<MuscleGroup | 'all'>('all'), [source, setSource] = useState<'all' | 'custom'>('all'), [creating, setCreating] = useState(false), [moreFilters, setMoreFilters] = useState(false);
  const [name, setName] = useState(''), [muscle, setMuscle] = useState<MuscleGroup>('chest'), [gear, setGear] = useState<ExerciseEquipment>('machine'), [notes, setNotes] = useState('');
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]), [editingId, setEditingId] = useState<string | null>(null), [measurement, setMeasurement] = useState<ExerciseMeasurement>('weighted_reps');
  const exercises = useMemo(() => {
    const results = searchStrengthExercises([...BUILTIN_EXERCISES, ...strengthExercises], query, { equipment: filter, muscle: detailFilter, source })
      .filter((item) => partFilter === 'all' || bodyPartFor(item.primaryMuscle) === partFilter);
    if (query.trim()) return results;
    const recent = [...workoutSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).flatMap((session) => session.exercises.map((item) => item.exerciseId));
    return results.sort((a, b) => {
      const ai = recent.indexOf(a.id), bi = recent.indexOf(b.id);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.name.localeCompare(b.name);
    });
  }, [strengthExercises, workoutSessions, filter, partFilter, detailFilter, query, source]);
  const select = (exercise: typeof exercises[number]) => {
    if (!activeWorkout || !params.select) {
      Alert.alert(exercise.name, `${exercise.equipment} · ${describeMuscle(exercise.primaryMuscle)}${exercise.notes ? `\n${exercise.notes}` : ''}`, [
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
  const pickMuscle = (item: MuscleGroup) => { setMuscle(item); setSecondary(secondary.filter((group) => group !== item)); };
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
  const selecting = !!params.select && !!activeWorkout;
  const trimmed = query.trim();
  const exactMatch = exercises.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
  const SUGGESTION_LIMIT = 8;
  const showSuggestions = selecting && !!trimmed && !creating;
  const suggestions = exercises.slice(0, SUGGESTION_LIMIT);
  const hiddenMatches = Math.max(0, exercises.length - SUGGESTION_LIMIT);
  const recentIds = [...new Set([...workoutSessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).flatMap((session) => session.exercises.map((item) => item.exerciseId)))];
  const recent = recentIds.slice(0, 5).flatMap((id) => [...BUILTIN_EXERCISES, ...strengthExercises].find((item) => item.id === id) ?? []);
  const startCreate = (prefill: string) => { setEditingId(null); setName(prefill); setNotes(''); setSecondary([]); setCreating(true); };
  return <WorkoutPage>
    <WorkoutTitle>{selecting ? 'Add an exercise' : 'Exercise library'}</WorkoutTitle>
    <View>
      <View style={[styles.search, showSuggestions && styles.searchOpen]}>
        <TextInput accessibilityLabel={selecting ? 'Type an exercise' : 'Search exercises'} value={query} onChangeText={setQuery} autoFocus={selecting} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
          placeholder={selecting ? 'Start typing an exercise, like bench' : 'Search exercises, like bench or squat'} placeholderTextColor={colors.textDim} style={styles.searchInput} />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')} style={styles.clear}><Text style={styles.clearText}>×</Text></Pressable>}
      </View>
      {showSuggestions && <View style={styles.dropdown} accessibilityLabel="Suggestions">
        {suggestions.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} onPress={() => select(item)} style={styles.suggestion}>
          <View style={{ flex: 1 }}><Highlighted text={item.name} query={trimmed} /><Text style={styles.rowMeta}>{describeMuscle(item.primaryMuscle)} · {item.equipment}{item.custom ? ' · custom' : ''}</Text></View>
          <Text style={styles.add}>+</Text>
        </Pressable>)}
        {hiddenMatches > 0 && <Text style={styles.more}>Keep typing to narrow it down ({hiddenMatches} more)</Text>}
        {!exactMatch && <Pressable accessibilityRole="button" onPress={() => startCreate(trimmed)} style={styles.suggestion}>
          <Text style={[styles.rowName, { color: colors.workoutsNav, flex: 1 }]}>{suggestions.length ? `+ Add “${trimmed}” as a new exercise` : `No match. + Add “${trimmed}” as a new exercise`}</Text>
        </Pressable>}
      </View>}
    </View>
    {selecting && !trimmed && !creating && (recent.length > 0
      ? <View style={{ gap: 8 }}><Text style={styles.count}>Recent</Text><View style={styles.wrapChips}>{recent.map((item) => <NotepadPill key={item.id} label={item.name} onPress={() => select(item)} />)}</View></View>
      : <Text style={styles.hint}>Type the exercise you’re doing. Matching exercises appear as you type, or add your own if it isn’t there.</Text>)}
    {!selecting && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
      {(['all', ...BODY_PARTS] as const).map((item) => <NotepadPill key={item} label={item === 'all' ? 'All' : BODY_PART_LABELS[item]} active={partFilter === item} onPress={() => { setPartFilter(item); setDetailFilter('all'); }} />)}
    </ScrollView>}
    {!selecting && partFilter !== 'all' && detailMusclesFor(partFilter).length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
      {(['all', ...detailMusclesFor(partFilter)] as const).map((item) => <NotepadPill key={item} label={item === 'all' ? `All ${BODY_PART_LABELS[partFilter].toLowerCase()}` : muscleLabel(item)} active={detailFilter === item} onPress={() => setDetailFilter(item)} />)}
    </ScrollView>}
    {!selecting && <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreFilters }} onPress={() => setMoreFilters(!moreFilters)} style={styles.moreFilters}>
      <Text style={styles.moreFiltersText}>More filters{filter !== 'all' || source !== 'all' ? ' · on' : ''}</Text><Chevron direction={moreFilters ? 'up' : 'down'} size={18} />
    </Pressable>}
    {!selecting && moreFilters && <>
      <View style={styles.wrapChips}>{(['all', ...equipment] as const).map((item) => <NotepadPill key={item} label={item === 'all' ? 'Any equipment' : item} active={filter === item} onPress={() => setFilter(item)} />)}</View>
      <View style={styles.wrapChips}>{(['all', 'custom'] as const).map((item) => <NotepadPill key={item} label={item === 'all' ? 'All exercises' : 'My custom'} active={source === item} onPress={() => setSource(item)} />)}</View>
    </>}
    {creating && <WorkoutCard><WorkoutInput label="Exercise name" value={name} onChangeText={setName} /><WorkoutInput label="Notes (optional)" value={notes} onChangeText={setNotes} /><WorkoutText>Body part</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{BODY_PARTS.map((item) => <NotepadPill key={item} label={BODY_PART_LABELS[item]} active={bodyPartFor(muscle) === item} onPress={() => pickMuscle(genericMuscleFor(item))} />)}</View>{detailMusclesFor(bodyPartFor(muscle)).length > 0 && <><WorkoutText>Detail (optional)</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[genericMuscleFor(bodyPartFor(muscle)), ...detailMusclesFor(bodyPartFor(muscle))].map((item) => <NotepadPill key={item} label={item === genericMuscleFor(bodyPartFor(muscle)) ? 'Any' : muscleLabel(item)} active={muscle === item} onPress={() => pickMuscle(item)} />)}</View></>}<WorkoutText>Secondary muscles (optional)</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{MUSCLE_GROUPS.filter((item) => item !== muscle).map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setSecondary((current) => current.includes(item) ? current.filter((group) => group !== item) : [...current, item])} style={{ padding: 9, borderRadius: 9, backgroundColor: secondary.includes(item) ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: secondary.includes(item) ? colors.background : colors.text }}>{item}</Text></Pressable>)}</View><WorkoutText>Equipment</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{equipment.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setGear(item)} style={{ padding: 9, borderRadius: 9, backgroundColor: gear === item ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: gear === item ? colors.background : colors.text }}>{item}</Text></Pressable>)}</View><WorkoutText>How is it logged?</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{measurements.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setMeasurement(item)} style={{ padding: 9, borderRadius: 9, backgroundColor: measurement === item ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: measurement === item ? colors.background : colors.text }}>{item.replaceAll('_', ' ')}</Text></Pressable>)}</View><WorkoutButton label={editingId ? 'Save changes' : params.select ? 'Add here' : 'Save exercise'} onPress={() => saveCustom(!params.select || !!editingId)} />{!editingId && !!params.select && <WorkoutButton label="Save to library & add" secondary onPress={() => saveCustom(true)} />}</WorkoutCard>}
    {creating && <WorkoutButton label="Cancel" secondary onPress={() => { setCreating(false); setEditingId(null); }} />}
    {!selecting && <View style={styles.list}>
      <Text style={styles.count}>{trimmed ? `${exercises.length} ${exercises.length === 1 ? 'match' : 'matches'}` : 'Recent first, then A to Z'}</Text>
      {exercises.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${selecting ? 'Add' : 'Open'} ${item.name}`} onPress={() => select(item)} style={styles.row}>
        <View style={{ flex: 1 }}><Text style={styles.rowName}>{item.name}</Text><Text style={styles.rowMeta}>{describeMuscle(item.primaryMuscle)} · {item.equipment}{item.custom ? ' · custom' : ''}</Text></View>
        {selecting ? <Text style={styles.add}>+</Text> : <Chevron />}
      </Pressable>)}
      {!creating && <Pressable accessibilityRole="button" onPress={() => startCreate(trimmed && !exactMatch ? trimmed : '')} style={styles.row}>
        <Text style={[styles.rowName, { color: colors.workoutsNav }]}>{trimmed && !exactMatch ? `+ Create “${trimmed}”` : '+ Create a custom exercise'}</Text>
      </Pressable>}
    </View>}
  </WorkoutPage>;
}

/** The exercise name with the typed word starts emphasized, like an address autocomplete. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const parts = text.split(/(\s+)/);
  return <Text style={styles.rowName}>{parts.map((part, index) => {
    const word = words.filter((item) => part.toLowerCase().startsWith(item)).sort((a, b) => b.length - a.length)[0];
    return word ? <Text key={index}><Text style={styles.match}>{part.slice(0, word.length)}</Text>{part.slice(word.length)}</Text> : <Text key={index}>{part}</Text>;
  })}</Text>;
}

function describeMuscle(muscle: MuscleGroup) {
  const part = bodyPartFor(muscle);
  return muscle === part ? BODY_PART_LABELS[part] : `${BODY_PART_LABELS[part]} · ${muscleLabel(muscle)}`;
}

const styles = StyleSheet.create({
  searchOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: colors.workoutsNav },
  dropdown: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.workoutsNav, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 14 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  match: { color: colors.workoutsNav, fontFamily: font.bold },
  more: { color: colors.textDim, fontSize: 12, fontFamily: font.medium, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  hint: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, lineHeight: 20 },
  search: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, paddingLeft: 16, paddingRight: 6 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, fontFamily: font.medium, paddingVertical: 12 },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.textMuted, fontSize: 22, lineHeight: 24 },
  chips: { gap: 6, paddingRight: 8 },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  moreFilters: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 36 },
  moreFiltersText: { color: colors.textMuted, fontSize: 13, fontFamily: font.semibold },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 10 },
  count: { color: colors.textDim, fontSize: 12, fontFamily: font.semibold, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  rowName: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  rowMeta: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  add: { color: colors.workoutsNav, fontSize: 24, lineHeight: 26, fontFamily: font.semibold, width: 28, textAlign: 'center' },
});
