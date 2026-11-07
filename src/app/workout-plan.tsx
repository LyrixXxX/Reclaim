import { Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { WorkoutButton, WorkoutCard, WorkoutInput, WorkoutPage, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { generateWorkoutPlan } from '@/lib/workout-plan-ai';
import { PLAN_EQUIPMENT, PLAN_MUSCLES, PLAN_WEEKDAYS, planCatalog, planDayToRoutine, validateWorkoutPlan, validateWorkoutPlanAnswers, WorkoutPlan, WorkoutPlanAnswers } from '@/lib/workout-plan';
import { useTrackers } from '@/state/tracker-context';
import { colors, font } from '@/theme';

type EditableExercise = { exerciseId: string };
type EditableDay = { weekday: number; name: string; exercises: EditableExercise[] };
const initialAnswers: WorkoutPlanAnswers = { weekdays: [], minutes: 45, experience: 'beginner', equipment: ['machine', 'dumbbell', 'bodyweight'], priorityMuscles: [] };

export default function WorkoutPlanScreen() {
  const { saveWorkoutRoutine, workoutRoutines = [] } = useTrackers();
  const [answers, setAnswers] = useState<WorkoutPlanAnswers>(initialAnswers);
  const [draft, setDraft] = useState<EditableDay[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState<{ weekday: number; index: number } | null>(null);
  const [replacementSearch, setReplacementSearch] = useState('');
  const catalog = planCatalog(answers);
  const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]));

  const setPlan = (plan: WorkoutPlan) => {
    setDraft(plan.days.map((day) => ({ ...day, exercises: day.exercises.map(({ exerciseId }) => ({ exerciseId })) })));
    setReplacing(null);
  };
  const generate = async () => {
    const error = validateWorkoutPlanAnswers(answers);
    if (error) return Alert.alert('Check your choices', error);
    setBusy(true);
    try { setPlan(await generateWorkoutPlan(answers)); }
    catch (failure) { Alert.alert('Could not generate a draft', failure instanceof Error ? failure.message : 'Try again later. You can still make routines manually.'); }
    finally { setBusy(false); }
  };
  const editDay = (weekday: number, update: (day: EditableDay) => EditableDay) => setDraft((current) => current?.map((day) => day.weekday === weekday ? update(day) : day) ?? null);
  const save = () => {
    if (!draft) return;
    const validated = draft.map((day) => ({ weekday: day.weekday, name: day.name.trim(), exercises: day.exercises.map(({ exerciseId }) => ({ exerciseId })) }));
    try { validateWorkoutPlan({ days: validated }, answers, catalog); }
    catch (failure) { return Alert.alert('Check the draft', failure instanceof Error ? failure.message : 'Every day needs valid exercises.'); }
    const overlap = validated.filter((day) => workoutRoutines.some((routine) => routine.weekdays?.includes(day.weekday)));
    const commit = () => {
      try {
        const routines = validated.map((day) => planDayToRoutine(day, catalog));
        routines.forEach(saveWorkoutRoutine);
        router.replace('/workout-routines' as Href);
      } catch (failure) { Alert.alert('Could not save the draft', failure instanceof Error ? failure.message : 'Review the exercises and try again.'); }
    };
    if (overlap.length) Alert.alert('Routines already assigned', `${overlap.map((day) => PLAN_WEEKDAYS[day.weekday]).join(', ')} already has a saved routine. Keep both?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Save both', onPress: commit }]);
    else commit();
  };

  return <WorkoutPage><WorkoutTitle>Build a training week</WorkoutTitle><WorkoutText>Choose your schedule. AI can suggest editable strength routines from Reclaim’s built-in exercise library. Nothing is saved until you approve the draft.</WorkoutText>
    {!draft ? <>
      <WorkoutCard><WorkoutText>Which days can you train?</WorkoutText><View style={wrap}>{PLAN_WEEKDAYS.map((day, weekday) => <Choice key={day} label={day.slice(0, 3)} selected={answers.weekdays.includes(weekday)} onPress={() => setAnswers((old) => ({ ...old, weekdays: old.weekdays.includes(weekday) ? old.weekdays.filter((item) => item !== weekday) : [...old.weekdays, weekday].sort() }))} />)}</View></WorkoutCard>
      <WorkoutCard><WorkoutText>Time per session</WorkoutText><View style={wrap}>{[30, 45, 60, 75, 90].map((minutes) => <Choice key={minutes} label={`${minutes} min`} selected={answers.minutes === minutes} onPress={() => setAnswers((old) => ({ ...old, minutes }))} />)}</View><WorkoutText>Experience</WorkoutText><View style={wrap}>{(['beginner', 'intermediate', 'advanced'] as const).map((experience) => <Choice key={experience} label={experience} selected={answers.experience === experience} onPress={() => setAnswers((old) => ({ ...old, experience }))} />)}</View></WorkoutCard>
      <WorkoutCard><WorkoutText>Equipment you can use</WorkoutText><View style={wrap}>{PLAN_EQUIPMENT.map((item) => <Choice key={item} label={item} selected={answers.equipment.includes(item)} onPress={() => setAnswers((old) => ({ ...old, equipment: toggle(old.equipment, item) }))} />)}</View><WorkoutText>Muscles to emphasize (optional, up to three)</WorkoutText><View style={wrap}>{PLAN_MUSCLES.map((item) => <Choice key={item} label={item} selected={answers.priorityMuscles.includes(item)} onPress={() => setAnswers((old) => ({ ...old, priorityMuscles: old.priorityMuscles.includes(item) ? old.priorityMuscles.filter((selected) => selected !== item) : old.priorityMuscles.length < 3 ? [...old.priorityMuscles, item] : old.priorityMuscles }))} />)}</View></WorkoutCard>
      <WorkoutCard><WorkoutText>Only these choices and built-in exercise names are sent through Lyrix Studios’ relay to OpenAI when you tap Generate. Workout history, weights, and saved routines are not sent.</WorkoutText><WorkoutButton label={busy ? 'Generating…' : 'Generate with AI'} disabled={busy} onPress={() => { void generate(); }} /><WorkoutText>AI suggests exercises and a weekly structure, not sets, reps, or weights. You enter those while training.</WorkoutText></WorkoutCard>
    </> : <>
      <WorkoutCard><WorkoutText>Draft only · review every day and exercise. Sets, reps, and weights are left for you to log.</WorkoutText><WorkoutButton label="Start over" secondary onPress={() => Alert.alert('Discard this draft?', 'No routines have been saved.', [{ text: 'Keep editing' }, { text: 'Discard draft', style: 'destructive', onPress: () => { setDraft(null); setReplacing(null); } }])} /></WorkoutCard>
      {draft.map((day) => <WorkoutCard key={day.weekday}><WorkoutTitle>{PLAN_WEEKDAYS[day.weekday]}</WorkoutTitle><WorkoutInput label="Routine name" value={day.name} onChangeText={(name) => editDay(day.weekday, (current) => ({ ...current, name }))} />
        {day.exercises.map((planned, index) => <View key={`${day.weekday}-${index}`} style={exerciseBox}><Text style={exerciseName}>{index + 1}. {catalogById.get(planned.exerciseId)?.name ?? 'Unavailable exercise'}</Text><View style={wrap}><Choice label="Replace" selected={replacing?.weekday === day.weekday && replacing.index === index} onPress={() => { setReplacing({ weekday: day.weekday, index }); setReplacementSearch(''); }} /><Choice label="Remove" selected={false} onPress={() => editDay(day.weekday, (current) => ({ ...current, exercises: current.exercises.filter((_, position) => position !== index) }))} /></View></View>)}
        <WorkoutButton label="Add exercise" secondary onPress={() => { setReplacing({ weekday: day.weekday, index: day.exercises.length }); setReplacementSearch(''); }} />
        {replacing?.weekday === day.weekday && <View style={exerciseBox}><WorkoutInput label={replacing.index === day.exercises.length ? 'Search to add' : 'Search replacement'} value={replacementSearch} onChangeText={setReplacementSearch} placeholder="Exercise name" />{catalog.filter((exercise) => !replacementSearch.trim() || exercise.name.toLowerCase().includes(replacementSearch.trim().toLowerCase())).slice(0, 12).map((exercise) => <Choice key={exercise.id} label={`${exercise.name} · ${exercise.equipment}`} selected={false} onPress={() => { editDay(day.weekday, (current) => { const exercises = [...current.exercises]; const next = { exerciseId: exercise.id }; if (exercises[replacing.index]) exercises[replacing.index] = next; else exercises.push(next); return { ...current, exercises }; }); setReplacing(null); }} />)}<WorkoutButton label="Cancel selection" secondary onPress={() => setReplacing(null)} /></View>}
      </WorkoutCard>)}
      <WorkoutButton label={`Save ${draft.length} routine${draft.length === 1 ? '' : 's'}`} onPress={save} />
    </>}
  </WorkoutPage>;
}

function toggle<T>(items: T[], item: T): T[] { return items.includes(item) ? items.filter((existing) => existing !== item) : [...items, item]; }
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11, backgroundColor: selected ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: selected ? colors.background : colors.text, fontFamily: font.bold }}>{label}</Text></Pressable>; }
const wrap = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 7 };
const exerciseBox = { backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 12, gap: 9 };
const exerciseName = { color: colors.text, fontSize: 15, fontFamily: font.semibold };
