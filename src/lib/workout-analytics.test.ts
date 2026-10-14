import { createReclaimBackup, parseReclaimBackup } from './backup';
import { exerciseProgress, exerciseRecords, recordIsNewActualBest, validWorkoutDate, volumeByPrimaryMuscle } from './workout-analytics';
import { finishWorkout, fromKg, makeWorkoutExercise, startWorkout, toKg, workoutElapsedMs } from './workouts';
import { TrackerState, WorkoutSession } from '@/models/tracker';

const first: WorkoutSession = {
  id: 'first', name: 'Push', startedAt: '2026-09-01T10:00:00Z', endedAt: '2026-09-01T11:00:00Z', pausedMs: 0,
  exercises: [
    { id: 'press-entry', exerciseId: 'machine-one', name: 'Press', primaryMuscle: 'chest', equipment: 'machine', sets: [
      { id: 'warm', kind: 'warmup', reps: 10, weightKg: 20, completedAt: '2026-09-01T10:10:00Z' },
      { id: 'a', kind: 'working', reps: 8, weightKg: 80, completedAt: '2026-09-01T10:20:00Z' },
      { id: 'b', kind: 'working', reps: 10, weightKg: 70, completedAt: '2026-09-01T10:30:00Z' },
    ] },
    { id: 'other-entry', exerciseId: 'machine-two', name: 'Press', primaryMuscle: 'triceps', equipment: 'machine', sets: [{ id: 'c', kind: 'working', reps: 10, weightKg: 30, completedAt: '2026-09-01T10:40:00Z' }] },
  ],
};
const second: WorkoutSession = { ...first, id: 'second', startedAt: '2026-10-01T10:00:00Z', endedAt: '2026-10-01T11:00:00Z', exercises: [
  { ...first.exercises[0], id: 'later-press', sets: [{ id: 'd', kind: 'working', reps: 10, weightKg: 80, completedAt: '2026-10-01T10:20:00Z' }] },
] };

test('volume credits only the primary muscle and no secondary duplicate', () => {
  const groups = volumeByPrimaryMuscle(first);
  expect(groups.get('chest')?.volumeKg).toBe(1540);
  expect(groups.get('triceps')?.volumeKg).toBe(300);
  expect([...groups.values()].reduce((sum, group) => sum + group.volumeKg, 0)).toBe(1840);
});

test('exercise charts use stable IDs, eligible sets, and reps at a matched weight', () => {
  const points = exerciseProgress([first, second], 'machine-one');
  expect(points).toHaveLength(2);
  expect(points[0].volumeKg).toBe(1540);
  expect(points[0].topWeightKg).toBe(80);
  expect(points[1].repsByWeight).toContainEqual({ weightKg: 80, reps: 10 });
  expect(exerciseProgress([first], 'machine-two')).toHaveLength(1);
  const records = exerciseRecords(points, []);
  expect(records.bestRepsByWeight.get(80)).toBe(10);
  expect(records.topVolumeKg).toBe(1540);
  expect(records.bestEstimatedOneRepMaxKg).toBeCloseTo(80 * (1 + 10 / 30));
});

test('confirmed actual 1RM stays separate from estimates and lower attempts preserve the best', () => {
  const records = [{ id: 'one', exerciseId: 'machine-one', weightKg: 100, date: '2026-09-01' }, { id: 'two', exerciseId: 'machine-one', weightKg: 90, date: '2026-10-01' }];
  expect(recordIsNewActualBest(records, records[1])).toBe(false);
  expect(recordIsNewActualBest(records, { id: 'three', exerciseId: 'machine-one', weightKg: 105, date: '2026-10-02' })).toBe(true);
  expect(exerciseRecords(exerciseProgress([first], 'machine-one'), records).bestActualOneRepMaxKg).toBe(100);
});

test('actual 1RM dates reject impossible calendar days', () => {
  expect(validWorkoutDate('2026-02-28')).toBe(true);
  expect(validWorkoutDate('2026-02-31')).toBe(false);
});

test('editing or deleting history recalculates exercise progress from current records', () => {
  const edited = { ...second, exercises: [{ ...second.exercises[0], sets: [{ ...second.exercises[0].sets[0], weightKg: 85 }] }] };
  expect(exerciseProgress([first, edited], 'machine-one').at(-1)?.topWeightKg).toBe(85);
  expect(exerciseProgress([first], 'machine-one')).toHaveLength(1);
});

test('old and exercise-only routines remain usable, active drafts and actual 1RM survive backup', () => {
  const exerciseOnly = makeWorkoutExercise({ id: 'custom', name: 'Machine', equipment: 'machine', primaryMuscle: 'chest', secondaryMuscles: [], custom: true });
  expect(exerciseOnly.plannedSets).toBeUndefined();
  const routine = { id: 'routine', name: 'Push', weekdays: [1, 3], notes: 'Easy start', exercises: [exerciseOnly], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
  const active = startWorkout('Push', routine, '2026-10-01T10:00:00Z');
  active.setDrafts = { [active.exercises[0].id]: { weight: '80', reps: '10', notes: '', kind: 'working', unit: 'kg', autoSuggested: true } };
  const state: TrackerState = { trackers: [], checkIns: [], activeWorkout: active, workoutRoutines: [routine], actualOneRepMaxes: [{ id: 'max', exerciseId: 'custom', weightKg: 90, date: '2026-10-01' }] };
  expect(parseReclaimBackup(JSON.stringify(createReclaimBackup(state))).state).toMatchObject(state);
  expect(finishWorkout(state, '2026-10-01T11:00:00Z').workoutSessions?.[0].setDrafts).toBeUndefined();
  expect(workoutElapsedMs({ ...active, pausedAt: '2026-10-01T10:30:00Z' }, Date.parse('2026-10-01T12:00:00Z'))).toBe(30 * 60_000);
  expect(fromKg(toKg(180, 'lb'), 'lb')).toBeCloseTo(180);
});

test('routine order is copied into a session and later routine edits cannot rewrite its history', () => {
  const press = makeWorkoutExercise({ id: 'press', name: 'Press', equipment: 'machine', primaryMuscle: 'chest', secondaryMuscles: ['triceps'] });
  const curl = makeWorkoutExercise({ id: 'curl', name: 'Curl', equipment: 'dumbbell', primaryMuscle: 'biceps', secondaryMuscles: [] });
  const routine = { id: 'plan', name: 'Monday', weekdays: [1], exercises: [press, curl], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
  const started = startWorkout('Monday', routine, '2026-10-05T10:00:00Z');
  expect(started.exercises.map((entry) => entry.exerciseId)).toEqual(['press', 'curl']);
  expect(started.exercises[0].plannedSets).toBeUndefined();
  routine.exercises.reverse();
  expect(started.exercises.map((entry) => entry.exerciseId)).toEqual(['press', 'curl']);
});
