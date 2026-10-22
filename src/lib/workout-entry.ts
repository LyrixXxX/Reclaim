import { ExerciseEquipment, ExerciseMeasurement, StrengthSet, WorkoutExercise, WorkoutSession, WorkoutSetDraft } from '@/models/tracker';
import { fromKg, toKg } from '@/lib/workouts';

export type RoutineExerciseDraft = { plannedSets: string; targetReps: string; targetWeight: string; restSeconds: string };
export type RoutineDraftErrors = Partial<Record<keyof RoutineExerciseDraft, string>>;

export const displayWeight = (kg: number, unit: 'lb' | 'kg') => String(Math.round(fromKg(kg, unit) * 10) / 10);

export function routineDraftFor(exercise: WorkoutExercise, unit: 'lb' | 'kg'): RoutineExerciseDraft {
  return {
    plannedSets: exercise.plannedSets === undefined ? '' : String(exercise.plannedSets),
    targetReps: exercise.targetReps === undefined ? '' : String(exercise.targetReps),
    targetWeight: exercise.targetWeightKg === undefined ? '' : displayWeight(exercise.targetWeightKg, unit),
    restSeconds: exercise.restSeconds === undefined ? '' : String(exercise.restSeconds),
  };
}

function normalizedNumber(value: string) { return value.trim().replace(',', '.'); }
function integer(value: string, min: number, max: number) {
  const normalized = normalizedNumber(value);
  const number = Number(normalized);
  return normalized !== '' && /^\d+$/.test(normalized) && Number.isInteger(number) && number >= min && number <= max ? number : undefined;
}
function decimal(value: string, min: number, max: number) {
  const normalized = normalizedNumber(value);
  const number = Number(normalized);
  return normalized !== '' && /^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

export function parseRoutineDraft(draft: RoutineExerciseDraft, unit: 'lb' | 'kg') {
  const errors: RoutineDraftErrors = {};
  const plannedSets = draft.plannedSets.trim() ? integer(draft.plannedSets, 1, 100) : undefined;
  const targetReps = draft.targetReps.trim() ? integer(draft.targetReps, 1, 1000) : undefined;
  const targetWeight = draft.targetWeight.trim() ? decimal(draft.targetWeight, 0, 5000) : undefined;
  const restSeconds = draft.restSeconds.trim() ? integer(draft.restSeconds, 0, 3600) : undefined;
  if (draft.plannedSets.trim() && plannedSets === undefined) errors.plannedSets = 'Enter 1–100 planned sets or leave blank.';
  if (draft.targetReps.trim() && targetReps === undefined) errors.targetReps = 'Enter 1–1000 reps or leave blank.';
  if (draft.targetWeight.trim() && targetWeight === undefined) errors.targetWeight = `Enter 0–5000 ${unit} or leave blank.`;
  if (draft.restSeconds.trim() && restSeconds === undefined) errors.restSeconds = 'Enter 0–3600 seconds or leave blank.';
  return { errors, value: Object.keys(errors).length ? undefined : {
    plannedSets, targetReps, targetWeightKg: targetWeight === undefined ? undefined : toKg(targetWeight, unit), restSeconds,
  } };
}

export function parseSetDraft(draft: WorkoutSetDraft, measurementType?: ExerciseMeasurement) {
  const isMeasure = measurementType === 'timed_hold' || measurementType === 'distance_carry';
  const amount = isMeasure ? decimal(draft.reps, 0.1, 100000) : integer(draft.reps, 1, 1000);
  const weight = draft.weight.trim() ? decimal(draft.weight, 0, 5000) : undefined;
  return {
    error: amount === undefined ? (isMeasure ? `Enter a positive ${measurementType === 'timed_hold' ? 'duration' : 'distance'}.` : 'Enter 1–1000 reps.') : draft.weight.trim() && weight === undefined ? `Enter 0–5000 ${draft.unit} or leave weight blank.` : undefined,
    reps: isMeasure ? (amount === undefined ? undefined : 1) : amount,
    weightKg: weight === undefined || measurementType === 'assisted_reps' ? undefined : toKg(weight, draft.unit),
    assistanceKg: weight === undefined || measurementType !== 'assisted_reps' ? undefined : toKg(weight, draft.unit),
    holdSeconds: measurementType === 'timed_hold' ? amount : undefined,
    distanceMeters: measurementType === 'distance_carry' ? amount : undefined,
  };
}

export function setAmountLabel(set: StrengthSet, measurementType?: ExerciseMeasurement) {
  if (measurementType === 'timed_hold') return `${set.holdSeconds ?? set.reps} sec hold`;
  if (measurementType === 'distance_carry') return `${set.distanceMeters ?? set.reps} m carry`;
  return `${set.reps} reps`;
}

export function emptySetDraft(unit: 'lb' | 'kg'): WorkoutSetDraft { return { weight: '', reps: '', notes: '', kind: 'working', unit }; }
export function hasUnloggedSetInput(drafts?: Record<string, WorkoutSetDraft>) {
  return Object.values(drafts ?? {}).some((draft) => !draft.autoSuggested && !!(draft.weight.trim() || draft.reps.trim() || draft.notes.trim() || draft.kind !== 'working'));
}
export function updateSetDraft(session: WorkoutSession, exerciseId: string, patch: Partial<WorkoutSetDraft>, unit: 'lb' | 'kg'): WorkoutSession {
  return { ...session, setDrafts: { ...session.setDrafts, [exerciseId]: { ...(session.setDrafts?.[exerciseId] ?? emptySetDraft(unit)), ...patch } } };
}
export function clearSetDraft(session: WorkoutSession, exerciseId: string): WorkoutSession {
  const setDrafts = { ...session.setDrafts }; delete setDrafts[exerciseId];
  return { ...session, setDrafts };
}
export function recordCompletedSet(session: WorkoutSession, exerciseId: string, set: StrengthSet, unit: 'lb' | 'kg'): WorkoutSession {
  if (!session.exercises.some((entry) => entry.id === exerciseId) || session.exercises.some((entry) => entry.sets.some((item) => item.id === set.id))) return session;
  return {
    ...session,
    exercises: session.exercises.map((entry) => entry.id === exerciseId ? { ...entry, sets: [...entry.sets, set] } : entry),
    setDrafts: { ...session.setDrafts, [exerciseId]: { weight: set.weightKg === undefined && set.assistanceKg === undefined ? '' : displayWeight((set.assistanceKg ?? set.weightKg)!, unit), reps: String(set.holdSeconds ?? set.distanceMeters ?? set.reps), notes: '', kind: 'working', unit, autoSuggested: true } },
  };
}
export function weightFieldLabel(equipment: ExerciseEquipment, unit: 'lb' | 'kg', measurementType?: ExerciseMeasurement) { return `${measurementType === 'assisted_reps' ? 'Assistance' : equipment === 'bodyweight' ? 'Added weight' : 'Weight'} (${unit})`; }
export function loggedWeightLabel(set: StrengthSet, equipment: ExerciseEquipment, unit: 'lb' | 'kg', measurementType?: ExerciseMeasurement) {
  if (measurementType === 'assisted_reps') return set.assistanceKg === undefined ? 'assistance not entered' : `${displayWeight(set.assistanceKg, unit)} ${unit} assistance`;
  if (set.weightKg === undefined) return equipment === 'bodyweight' ? 'bodyweight' : 'weight not entered';
  return `${equipment === 'bodyweight' ? '+' : '× '}${displayWeight(set.weightKg, unit)} ${unit}${equipment === 'bodyweight' ? ' added' : ''}`;
}
