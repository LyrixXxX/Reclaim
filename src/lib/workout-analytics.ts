import { ActualOneRepMax, MuscleGroup, StrengthSet, WorkoutExercise, WorkoutSession } from '@/models/tracker';
import { estimatedOneRepMaxKg } from '@/lib/workouts';

export type ExerciseProgressPoint = { sessionId: string; date: string; topWeightKg?: number; volumeKg: number; bestEstimatedOneRepMaxKg?: number; bestSingleKg?: number; bestHoldSeconds?: number; bestDistanceMeters?: number; bestReps?: number; repsByWeight: { weightKg: number; reps: number }[] };

export function eligibleWorkingSets(entry: WorkoutExercise) {
  return entry.sets.filter((set) => set.kind !== 'warmup');
}

export function weightedVolumeKg(sets: StrengthSet[], measurementType?: WorkoutExercise['measurementType']) {
  if (measurementType === 'timed_hold' || measurementType === 'distance_carry' || measurementType === 'assisted_reps') return 0;
  return sets.reduce((sum, set) => sum + (set.weightKg ?? 0) * set.reps, 0);
}

export function volumeByPrimaryMuscle(session: WorkoutSession) {
  const groups = new Map<MuscleGroup, { volumeKg: number; exercises: { id: string; name: string; volumeKg: number }[] }>();
  for (const entry of session.exercises) {
    if (!entry.sets.length) continue;
    const volumeKg = weightedVolumeKg(entry.sets, entry.measurementType);
    if (!volumeKg) continue;
    const group = groups.get(entry.primaryMuscle) ?? { volumeKg: 0, exercises: [] };
    group.volumeKg += volumeKg;
    group.exercises.push({ id: entry.id, name: entry.name, volumeKg });
    groups.set(entry.primaryMuscle, group);
  }
  return groups;
}

export function exerciseProgress(sessions: WorkoutSession[], exerciseId: string): ExerciseProgressPoint[] {
  return sessions.filter((session) => !!session.endedAt).flatMap((session) => {
    const entries = session.exercises.filter((entry) => entry.exerciseId === exerciseId && entry.sets.length);
    if (!entries.length) return [];
    const allSets = entries.flatMap((entry) => entry.sets);
    const sets = entries.flatMap((entry) => eligibleWorkingSets(entry));
    const eligible = entries.every((entry) => !['timed_hold','distance_carry','assisted_reps'].includes(entry.measurementType ?? ''));
    const weighted = eligible ? sets.filter((set) => set.weightKg !== undefined) : [];
    const bestByWeight = new Map<number, number>();
    for (const set of weighted) bestByWeight.set(set.weightKg!, Math.max(bestByWeight.get(set.weightKg!) ?? 0, set.reps));
    return [{ sessionId: session.id, date: session.endedAt!, topWeightKg: weighted.length ? Math.max(...weighted.map((set) => set.weightKg!)) : undefined,
      volumeKg: eligible ? entries.reduce((sum, entry) => sum + weightedVolumeKg(entry.sets, entry.measurementType), 0) : 0, bestEstimatedOneRepMaxKg: entries.some((entry) => entry.measurementType === 'bodyweight_reps') ? undefined : Math.max(0, ...weighted.map((set) => estimatedOneRepMaxKg(set) ?? 0)) || undefined,
      bestSingleKg: entries.some((entry) => entry.measurementType === 'bodyweight_reps') ? undefined : Math.max(0, ...weighted.filter((set) => set.reps === 1).map((set) => set.weightKg!)) || undefined,
      bestHoldSeconds: Math.max(0, ...allSets.map((set) => set.holdSeconds ?? 0)) || undefined,
      bestDistanceMeters: Math.max(0, ...allSets.map((set) => set.distanceMeters ?? 0)) || undefined,
      bestReps: Math.max(0, ...allSets.map((set) => set.reps)) || undefined,
      repsByWeight: [...bestByWeight.entries()].map(([weightKg, reps]) => ({ weightKg, reps })).sort((a, b) => a.weightKg - b.weightKg) }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function exerciseRecords(points: ExerciseProgressPoint[], confirmed: ActualOneRepMax[]) {
  const repsAtWeight = new Map<number, number>();
  for (const point of points) for (const item of point.repsByWeight) repsAtWeight.set(item.weightKg, Math.max(repsAtWeight.get(item.weightKg) ?? 0, item.reps));
  return { topWeightKg: Math.max(0, ...points.map((point) => point.topWeightKg ?? 0)), topVolumeKg: Math.max(0, ...points.map((point) => point.volumeKg)),
    bestEstimatedOneRepMaxKg: Math.max(0, ...points.map((point) => point.bestEstimatedOneRepMaxKg ?? 0)), bestSingleKg: Math.max(0, ...points.map((point) => point.bestSingleKg ?? 0)),
    bestActualOneRepMaxKg: Math.max(0, ...confirmed.map((record) => record.weightKg)), bestRepsByWeight: repsAtWeight };
}

export function recordIsNewActualBest(records: ActualOneRepMax[], record: ActualOneRepMax) {
  return record.weightKg > Math.max(0, ...records.filter((item) => item.exerciseId === record.exerciseId && item.id !== record.id).map((item) => item.weightKg));
}

export function validWorkoutDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
