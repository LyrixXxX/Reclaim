import { ExerciseEquipment, MuscleGroup, StrengthExercise, WorkoutRoutine } from '@/models/tracker';
import { BUILTIN_EXERCISES, makeWorkoutExercise, newId } from './workouts';

export type PlanExperience = 'beginner' | 'intermediate' | 'advanced';
export type WorkoutPlanAnswers = {
  weekdays: number[];
  minutes: number;
  experience: PlanExperience;
  equipment: ExerciseEquipment[];
  priorityMuscles: MuscleGroup[];
};
export type PlannedExercise = { exerciseId: string };
export type PlannedDay = { weekday: number; name: string; exercises: PlannedExercise[] };
export type WorkoutPlan = { days: PlannedDay[] };

export const PLAN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const PLAN_EQUIPMENT: ExerciseEquipment[] = ['machine', 'barbell', 'dumbbell', 'cable', 'bodyweight'];
export const PLAN_MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'core'];

export function validateWorkoutPlanAnswers(value: WorkoutPlanAnswers): string | undefined {
  if (!value.weekdays.length || value.weekdays.length > 6 || new Set(value.weekdays).size !== value.weekdays.length || value.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return 'Choose one to six different training days.';
  if (!Number.isInteger(value.minutes) || value.minutes < 20 || value.minutes > 120) return 'Choose a session length between 20 and 120 minutes.';
  if (!['beginner', 'intermediate', 'advanced'].includes(value.experience)) return 'Choose your experience level.';
  if (!value.equipment.length || new Set(value.equipment).size !== value.equipment.length || value.equipment.some((item) => !PLAN_EQUIPMENT.includes(item))) return 'Choose at least one equipment option.';
  if (value.priorityMuscles.length > 3 || new Set(value.priorityMuscles).size !== value.priorityMuscles.length || value.priorityMuscles.some((item) => !PLAN_MUSCLES.includes(item))) return 'Choose up to three muscle groups to emphasize.';
  return undefined;
}

export function planCatalog(answers: WorkoutPlanAnswers): StrengthExercise[] {
  return BUILTIN_EXERCISES.filter((exercise) => answers.equipment.includes(exercise.equipment) && ['weighted_reps', 'bodyweight_reps', undefined].includes(exercise.measurementType));
}

export function validateWorkoutPlan(value: unknown, answers: WorkoutPlanAnswers, catalog: StrengthExercise[]): WorkoutPlan {
  if (!value || typeof value !== 'object' || !Array.isArray((value as WorkoutPlan).days)) throw new Error('The draft was incomplete. Try generating it again.');
  const days = (value as WorkoutPlan).days;
  const allowedIds = new Set(catalog.map((exercise) => exercise.id));
  if (days.length !== answers.weekdays.length || new Set(days.map((day) => day.weekday)).size !== days.length || days.some((day) => !answers.weekdays.includes(day.weekday) || typeof day.name !== 'string' || !day.name.trim() || day.name.length > 60 || !Array.isArray(day.exercises) || day.exercises.length < 1 || day.exercises.length > 10 || day.exercises.some((exercise) => !allowedIds.has(exercise.exerciseId)))) throw new Error('The draft contained unavailable exercises. Try generating it again.');
  // Accept older relay responses, but never carry AI-generated set or rep targets into a routine.
  return { days: answers.weekdays.map((weekday) => {
    const day = days.find((entry) => entry.weekday === weekday)!;
    return { weekday, name: day.name, exercises: day.exercises.map(({ exerciseId }) => ({ exerciseId })) };
  }) };
}

export function offlineSamplePlan(answers: WorkoutPlanAnswers): WorkoutPlan {
  const catalog = planCatalog(answers);
  const preferred = catalog.filter((exercise) => answers.priorityMuscles.includes(exercise.primaryMuscle));
  const base = preferred.length ? [...preferred, ...catalog.filter((exercise) => !preferred.includes(exercise))] : catalog;
  if (!base.length) throw new Error('No built-in exercises match that equipment. Choose another option.');
  const count = answers.minutes < 40 ? 3 : answers.minutes < 65 ? 4 : 5;
  return { days: answers.weekdays.map((weekday, dayIndex) => ({
    weekday,
    name: `${PLAN_WEEKDAYS[weekday]} strength`,
    exercises: Array.from({ length: Math.min(count, base.length) }, (_, position) => base[(dayIndex * count + position) % base.length]).map((exercise) => ({ exerciseId: exercise.id })),
  })) };
}

export function planDayToRoutine(day: PlannedDay, catalog: StrengthExercise[], now = new Date().toISOString()): WorkoutRoutine {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  return {
    id: newId(), name: day.name.trim(), weekdays: [day.weekday], createdAt: now, updatedAt: now,
    exercises: day.exercises.map((planned) => {
      const exercise = byId.get(planned.exerciseId);
      if (!exercise) throw new Error('An exercise in this draft is no longer available.');
      return makeWorkoutExercise(exercise);
    }),
  };
}
