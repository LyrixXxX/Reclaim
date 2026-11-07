import { bodyPartTrend, bodyPartTrends } from './body-part-progress';
import { MuscleGroup, StrengthSet, WorkoutExercise, WorkoutSession } from '@/models/tracker';

const set = (weightKg: number | undefined, reps: number, kind: StrengthSet['kind'] = 'working', extra: Partial<StrengthSet> = {}): StrengthSet =>
  ({ id: `${kind}-${weightKg}-${reps}-${Math.random()}`, kind, weightKg, reps, completedAt: '2026-01-01T10:00:00Z', ...extra });
const entry = (exerciseId: string, muscle: MuscleGroup, sets: StrengthSet[], measurementType?: WorkoutExercise['measurementType']): WorkoutExercise =>
  ({ id: `${exerciseId}-entry`, exerciseId, name: exerciseId, primaryMuscle: muscle, equipment: 'barbell', measurementType, sets });
const session = (id: string, date: string, exercises: WorkoutExercise[], ended = true): WorkoutSession =>
  ({ id, name: id, startedAt: `${date}T10:00:00Z`, endedAt: ended ? `${date}T11:00:00Z` : undefined, pausedMs: 0, exercises });
// Epley estimate used by the app: weight × (1 + reps / 30).
const e1rm = (weight: number, reps: number) => weight * (1 + reps / 30);

test('measures each exercise against its own first logged estimated max', () => {
  const trend = bodyPartTrend([
    session('a', '2026-03-02', [entry('bench', 'chest', [set(80, 8)])]),
    session('b', '2026-03-16', [entry('bench', 'chest', [set(85, 8)])]),
  ], 'chest');
  expect(trend.points).toHaveLength(2);
  expect(trend.points[0].value).toBeCloseTo(0);
  expect(trend.changePercent).toBeCloseTo((e1rm(85, 8) / e1rm(80, 8) - 1) * 100);
  expect(trend.exercises[0]).toMatchObject({ exerciseId: 'bench', sessions: 2 });
});

test('carries untrained exercises forward so switching movements does not swing the line', () => {
  const trend = bodyPartTrend([
    session('a', '2026-03-02', [entry('curl', 'biceps', [set(20, 10)]), entry('pushdown', 'triceps', [set(30, 10)])]),
    // Next week only curls are trained, and they improve 10%.
    session('b', '2026-03-09', [entry('curl', 'biceps', [set(22, 10)])]),
  ], 'arms');
  // Pushdown carries forward at 1.0, so the part is the average of 1.10 and 1.00.
  expect(trend.changePercent).toBeCloseTo(5);
});

test('ignores warmups, unfinished sessions, and movements without a comparable strength number', () => {
  const trend = bodyPartTrend([
    session('a', '2026-03-02', [entry('bench', 'chest', [set(200, 5, 'warmup'), set(80, 8)])]),
    session('live', '2026-03-09', [entry('bench', 'chest', [set(120, 8)])], false),
  ], 'chest');
  expect(trend.points).toHaveLength(1);
  expect(trend.changePercent).toBeCloseTo(0);
  const core = bodyPartTrend([
    session('a', '2026-03-02', [entry('plank', 'core', [set(undefined, 1, 'working', { holdSeconds: 60 })], 'timed_hold')]),
    session('b', '2026-03-09', [entry('plank', 'core', [set(undefined, 1, 'working', { holdSeconds: 90 })], 'timed_hold')]),
  ], 'core');
  expect(core.points).toEqual([]);
  expect(core.changePercent).toBeNull();
});

test('bodyweight movements trend by best reps', () => {
  const trend = bodyPartTrend([
    session('a', '2026-03-02', [entry('pushup', 'chest', [set(undefined, 10)], 'bodyweight_reps')]),
    session('b', '2026-03-16', [entry('pushup', 'chest', [set(undefined, 15)], 'bodyweight_reps')]),
  ], 'chest');
  expect(trend.changePercent).toBeCloseTo(50);
});

test('detail filter narrows a part to one muscle', () => {
  const sessions = [
    session('a', '2026-03-02', [entry('curl', 'biceps', [set(20, 10)]), entry('pushdown', 'triceps', [set(30, 10)])]),
    session('b', '2026-03-09', [entry('curl', 'biceps', [set(22, 10)]), entry('pushdown', 'triceps', [set(30, 10)])]),
  ];
  expect(bodyPartTrend(sessions, 'arms', 'biceps').changePercent).toBeCloseTo(10);
  expect(bodyPartTrend(sessions, 'arms', 'triceps').changePercent).toBeCloseTo(0);
});

test('an empty history returns every part with no trend yet', () => {
  const trends = bodyPartTrends([]);
  expect(trends).toHaveLength(7);
  for (const trend of trends) expect(trend).toMatchObject({ points: [], changePercent: null, exercises: [] });
});
