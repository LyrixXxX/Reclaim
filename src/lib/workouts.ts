import { ActivityRoute, StrengthExercise, StrengthSet, TrackerState, WorkoutCalories, WorkoutExercise, WorkoutRoutine, WorkoutSession, WorkoutSettings } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';
import { EXPANDED_STRENGTH_CATALOG } from '@/data/strength-exercise-catalog';

export const DEFAULT_WORKOUT_SETTINGS: WorkoutSettings = { timingMode: 'smart', restSeconds: 90, exerciseRestSeconds: {}, haptics: true, restNotifications: false, weightUnit: 'lb', showCalories: false };
const seed: Omit<StrengthExercise, 'id'>[] = [
  ['Bench Press','chest','barbell'], ['Incline Press','chest','dumbbell'], ['Chest Press','chest','machine'], ['Cable Fly','chest','cable'], ['Push-Up','chest','bodyweight'],
  ['Overhead Press','shoulders','barbell'], ['Shoulder Press','shoulders','dumbbell'], ['Lateral Raise','shoulders','dumbbell'], ['Face Pull','shoulders','cable'],
  ['Deadlift','back','barbell'], ['Barbell Row','back','barbell'], ['Lat Pulldown','back','cable'], ['Seated Row','back','machine'], ['Pull-Up','back','bodyweight'],
  ['Back Squat','quadriceps','barbell'], ['Front Squat','quadriceps','barbell'], ['Leg Press','quadriceps','machine'], ['Leg Extension','quadriceps','machine'], ['Leg Curl','hamstrings','machine'], ['Romanian Deadlift','hamstrings','barbell'], ['Dumbbell Lunge','quadriceps','dumbbell'], ['Calf Raise','calves','machine'],
  ['Biceps Curl','biceps','dumbbell'], ['Barbell Curl','biceps','barbell'], ['Cable Curl','biceps','cable'], ['Triceps Pushdown','triceps','cable'], ['Skull Crusher','triceps','barbell'], ['Triceps Dip','triceps','bodyweight'],
  ['Plank','core','bodyweight'], ['Crunch','core','bodyweight'], ['Cable Crunch','core','cable'], ['Hanging Leg Raise','core','bodyweight'],
].map(([name, primaryMuscle, equipment]) => ({ name: name as string, primaryMuscle: primaryMuscle as StrengthExercise['primaryMuscle'], equipment: equipment as StrengthExercise['equipment'], secondaryMuscles: [] }));
const legacyCanonical: Record<number, string> = {
  0: 'Barbell Bench Press', 1: 'Incline Dumbbell Bench Press', 3: 'Cable Chest Fly', 4: 'Push-Up',
  5: 'Barbell Overhead Press', 7: 'Dumbbell Lateral Raise', 8: 'Face Pull', 9: 'Conventional Deadlift',
  10: 'Barbell Bent-Over Row', 12: 'Seated Row Machine', 13: 'Pull-Up', 14: 'Barbell Back Squat',
  15: 'Barbell Front Squat', 17: 'Leg Extension Machine', 19: 'Romanian Deadlift',
  22: 'Dumbbell Curl', 23: 'Barbell Curl', 24: 'Cable Biceps Curl', 25: 'Cable Triceps Pushdown',
  26: 'Skull Crusher', 28: 'Plank', 29: 'Crunch', 30: 'Cable Crunch', 31: 'Hanging Leg Raise',
};
const replacedNames = new Set(Object.values(legacyCanonical));
const legacyExercises = seed.map((item, index): StrengthExercise => {
  const canonical = EXPANDED_STRENGTH_CATALOG.find((exercise) => exercise.name === legacyCanonical[index]);
  return canonical ? { ...canonical, id: `builtin-${index}`, aliases: [...(canonical.aliases ?? []), item.name] }
    : { ...item, id: `builtin-${index}`, measurementType: item.equipment === 'bodyweight' ? 'bodyweight_reps' : 'weighted_reps', custom: false };
});
export const BUILTIN_EXERCISES: StrengthExercise[] = [...legacyExercises, ...EXPANDED_STRENGTH_CATALOG.filter((exercise) => !replacedNames.has(exercise.name))];
export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export const toKg = (value: number, unit: 'lb' | 'kg') => unit === 'kg' ? value : value / 2.2046226218;
export const fromKg = (value: number, unit: 'lb' | 'kg') => unit === 'kg' ? value : value * 2.2046226218;
export const workoutElapsedMs = (session: WorkoutSession, now = Date.now()) => Math.max(0, (session.endedAt ? Date.parse(session.endedAt) : session.pausedAt ? Date.parse(session.pausedAt) : now) - Date.parse(session.startedAt) - session.pausedMs);
export const remainingWorkoutRestMs = (session: WorkoutSession, now = Date.now()) => session.restPausedMs ?? (session.restEndsAt ? Math.max(0, Date.parse(session.restEndsAt) - now) : 0);
export const workoutVolumeKg = (session: WorkoutSession) => session.exercises.reduce((total, exercise) => total + (exercise.measurementType === 'timed_hold' || exercise.measurementType === 'distance_carry' || exercise.measurementType === 'assisted_reps' ? 0 : exercise.sets.reduce((sum, set) => sum + (set.weightKg ?? 0) * set.reps, 0)), 0);
export const workoutSets = (session: WorkoutSession) => session.exercises.flatMap((exercise) => exercise.sets);
export const workoutReps = (session: WorkoutSession) => session.exercises.reduce((total, exercise) => total + (exercise.measurementType === 'timed_hold' || exercise.measurementType === 'distance_carry' ? 0 : exercise.sets.reduce((sum, set) => sum + set.reps, 0)), 0);
export function recentStrengthRecords(sessions: WorkoutSession[]) {
  const best = new Map<string, number>();
  const records: { name: string; weightKg: number; at: string }[] = [];
  for (const session of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    for (const exercise of session.exercises) for (const set of exercise.sets) {
      if (['timed_hold','distance_carry','assisted_reps'].includes(exercise.measurementType ?? '') || !set.weightKg || set.kind === 'warmup' || set.weightKg <= (best.get(exercise.exerciseId) ?? 0)) continue;
      best.set(exercise.exerciseId, set.weightKg);
      records.push({ name: exercise.name, weightKg: set.weightKg, at: set.completedAt });
    }
  }
  return records.sort((a, b) => b.at.localeCompare(a.at));
}
export const estimatedOneRepMaxKg = (set: StrengthSet) => set.weightKg && set.reps >= 1 && set.reps <= 10 ? set.weightKg * (1 + set.reps / 30) : undefined;
// 2024 Adult Compendium, Conditioning Exercise: general bodyweight 02056,
// varied resistance 02054, vigorous weight lifting 02050.
// https://pacompendium.com/conditioning-exercise/
export const workoutMET = { light: 3.0, moderate: 3.5, vigorous: 6 } as const;
export function estimateWorkoutCalories(session: WorkoutSession, weightKg: number, intensity: keyof typeof workoutMET): WorkoutCalories {
  const hours = workoutElapsedMs(session) / 3_600_000;
  const gross = workoutMET[intensity] * weightKg * hours;
  return { source: 'estimated', type: 'gross', kcal: Math.round(gross), activeKcal: Math.round((workoutMET[intensity] - 1) * weightKg * hours), intensity, estimateWeightKg: weightKg };
}
export function manualWorkoutCalories(session: WorkoutSession, kcal: number, type: 'active' | 'gross', weightKg?: number): WorkoutCalories {
  const resting = weightKg ? weightKg * workoutElapsedMs(session) / 3_600_000 : 0;
  return { source: 'manual', type, kcal, activeKcal: Math.max(0, Math.round(type === 'active' ? kcal : kcal - resting)), estimateWeightKg: weightKg };
}
export function strengthCalorieBudget(routes: ActivityRoute[], sessions: WorkoutSession[], date: string, enabled: boolean) {
  if (!enabled) return { route: 0, workout: 0, overlap: 0, total: 0 };
  const dayStart = Date.parse(`${date}T00:00:00`), dayEnd = dayStart + 86_400_000;
  const eligible = sessions.filter((session) => session.endedAt && session.calories && localDateKey(new Date(session.startedAt)) === date);
  const workout = eligible.reduce((sum, session) => sum + (session.calories?.activeKcal ?? 0), 0);
  let route = 0, overlap = 0;
  for (const item of routes.filter((entry) => localDateKey(new Date(entry.startedAt)) === date && entry.estimatedCalories)) {
    const begin = Math.max(dayStart, Date.parse(item.startedAt)), end = Math.min(dayEnd, Date.parse(item.endedAt));
    const duration = Math.max(1, end - begin);
    const covered = eligible.map((session) => [Math.max(begin, Date.parse(session.startedAt)), Math.min(end, Date.parse(session.endedAt!))] as const).filter(([start, stop]) => stop > start).sort((a, b) => a[0] - b[0]);
    let coveredMs = 0, last = begin;
    for (const [start, stop] of covered) { coveredMs += Math.max(0, stop - Math.max(start, last)); last = Math.max(last, stop); }
    const deducted = Math.round((item.estimatedCalories ?? 0) * Math.min(1, coveredMs / duration));
    route += item.estimatedCalories ?? 0; overlap += deducted;
  }
  return { route, workout, overlap, total: route + workout - overlap };
}
export function exerciseCaloriesForDate(routes: ActivityRoute[], sessions: WorkoutSession[], date: string, includeRoutes: boolean, includeWorkouts: boolean) {
  return strengthCalorieBudget(includeRoutes ? routes : [], includeWorkouts ? sessions : [], date, includeRoutes || includeWorkouts);
}
export function makeWorkoutExercise(exercise: StrengthExercise): WorkoutExercise {
  return { id: newId(), exerciseId: exercise.id, name: exercise.name, primaryMuscle: exercise.primaryMuscle, secondaryMuscles: exercise.secondaryMuscles, equipment: exercise.equipment, measurementType: exercise.measurementType ?? (exercise.equipment === 'bodyweight' ? 'bodyweight_reps' : 'weighted_reps'), sets: [] };
}
export function startWorkout(name: string, routine?: WorkoutRoutine, now = new Date().toISOString(), customExercises: StrengthExercise[] = []): WorkoutSession {
  const exercises = routine?.exercises.map((entry) => {
    const definition = [...BUILTIN_EXERCISES, ...customExercises].find((item) => item.id === entry.exerciseId);
    return { ...entry, id: newId(), measurementType: entry.measurementType ?? definition?.measurementType ?? (entry.equipment === 'bodyweight' ? 'bodyweight_reps' : 'weighted_reps'), sets: [] };
  }) ?? [];
  return { id: newId(), name: name.trim() || 'Workout', routineId: routine?.id, startedAt: now, pausedMs: 0, exercises, currentExerciseId: exercises[0]?.id };
}
export function finishWorkout(state: TrackerState, endedAt = new Date().toISOString()): TrackerState {
  const current = state.activeWorkout;
  if (!current || state.workoutSessions?.some((item) => item.id === current.id)) return state;
  const pausedMs = current.pausedMs + (current.pausedAt ? Math.max(0, Date.parse(endedAt) - Date.parse(current.pausedAt)) : 0);
  const { setDrafts: _drafts, ...withoutDrafts } = current;
  const complete = { ...withoutDrafts, pausedMs, pausedAt: undefined, restStartedAt: undefined, restEndsAt: undefined, restPausedMs: undefined, restNotificationId: undefined, setStartedAt: undefined, setExerciseId: undefined, endedAt };
  return { ...state, activeWorkout: undefined, workoutSessions: [...(state.workoutSessions ?? []), complete] };
}
