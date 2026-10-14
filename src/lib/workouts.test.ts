import { createReclaimBackup, parseReclaimBackup } from './backup';
import { BUILTIN_EXERCISES, estimateWorkoutCalories, estimatedOneRepMaxKg, exerciseCaloriesForDate, finishWorkout, manualWorkoutCalories, recentStrengthRecords, remainingWorkoutRestMs, startWorkout, workoutElapsedMs, workoutVolumeKg } from './workouts';
import { ActivityRoute, TrackerState, WorkoutSession } from '@/models/tracker';

const session: WorkoutSession = { id: 'one', name: 'Push', startedAt: '2026-10-13T15:00:00.000Z', endedAt: '2026-10-13T16:00:00.000Z', pausedMs: 600_000, exercises: [{ id: 'entry', exerciseId: 'bench', name: 'Bench', primaryMuscle: 'chest', equipment: 'barbell', plannedSets: 2, sets: [{ id: 'set', kind: 'working', reps: 10, weightKg: 50, completedAt: '2026-10-13T15:20:00.000Z' }] }] };
const route: ActivityRoute = { id: 'route', kind: 'walk', startedAt: '2026-10-13T15:30:00.000Z', endedAt: '2026-10-13T16:30:00.000Z', pausedMs: 0, distanceMeters: 5000, points: [], estimatedCalories: 120 };

test('built-in arm exercises distinguish biceps from triceps without changing IDs', () => {
  expect(BUILTIN_EXERCISES.find((item) => item.id === 'builtin-22')).toMatchObject({ name: 'Dumbbell Curl', primaryMuscle: 'biceps' });
  expect(BUILTIN_EXERCISES.find((item) => item.id === 'builtin-25')).toMatchObject({ name: 'Cable Triceps Pushdown', primaryMuscle: 'triceps' });
});

test('backups preserve specific and legacy arm muscle groups', () => {
  const state: TrackerState = { trackers: [], checkIns: [], strengthExercises: [
    { id: 'bi', name: 'Custom Curl', primaryMuscle: 'biceps', secondaryMuscles: ['triceps'], equipment: 'dumbbell', custom: true },
    { id: 'legacy', name: 'Arms', primaryMuscle: 'arms', secondaryMuscles: [], equipment: 'other', custom: true },
  ] };
  expect(parseReclaimBackup(JSON.stringify(createReclaimBackup(state))).state.strengthExercises).toEqual(state.strengthExercises);
});

test('elapsed time excludes pauses and volume counts only logged external load', () => {
  expect(workoutElapsedMs(session)).toBe(50 * 60_000);
  expect(workoutVolumeKg(session)).toBe(500);
  expect(workoutElapsedMs({ ...session, endedAt: undefined, pausedAt: '2026-10-13T15:20:00.000Z' }, Date.parse('2026-10-13T17:00:00Z'))).toBe(10 * 60_000);
});
test('rest countdown reconstructs from persisted timestamps after reopening', () => {
  const resting = { ...session, endedAt: undefined, restEndsAt: '2026-10-13T15:21:30Z' };
  expect(remainingWorkoutRestMs(resting, Date.parse('2026-10-13T15:20:30Z'))).toBe(60_000);
  expect(remainingWorkoutRestMs(resting, Date.parse('2026-10-13T15:22:00Z'))).toBe(0);
  expect(remainingWorkoutRestMs({ ...resting, restEndsAt: undefined, restPausedMs: 45_000 }, Date.parse('2026-10-13T18:00:00Z'))).toBe(45_000);
});
test('finishing an active session is idempotent', () => {
  const state: TrackerState = { trackers: [], checkIns: [], activeWorkout: startWorkout('Push', undefined, '2026-10-13T15:00:00Z') };
  const done = finishWorkout(state, '2026-10-13T16:00:00Z');
  expect(done.workoutSessions).toHaveLength(1);
  expect(done.activeWorkout).toBeUndefined();
  expect(finishWorkout(done, '2026-10-13T16:01:00Z')).toEqual(done);
});
test('estimated and manual gross calories distinguish active calories', () => {
  const estimate = estimateWorkoutCalories(session, 80, 'moderate');
  expect(estimate.kcal).toBe(233);
  expect(estimate.activeKcal).toBe(167);
  expect(manualWorkoutCalories(session, 200, 'gross', 80).activeKcal).toBe(133);
  expect(manualWorkoutCalories(session, 200, 'active').activeKcal).toBe(200);
});
test('route and workout overlap counts each covered minute once', () => {
  const workout = { ...session, calories: manualWorkoutCalories(session, 200, 'active') };
  const day = '2026-10-13';
  expect(exerciseCaloriesForDate([route], [workout], day, true, true)).toEqual({ route: 120, workout: 200, overlap: 60, total: 260 });
  expect(exerciseCaloriesForDate([route], [workout], day, false, true).total).toBe(200);
  expect(exerciseCaloriesForDate([route], [workout], day, true, false).total).toBe(120);
});
test('backups preserve an active draft and completed history', () => {
  const draft = startWorkout('Draft', undefined, '2026-10-13T18:00:00Z');
  draft.setDrafts = { press: { weight: '12.', reps: '', notes: 'First try', kind: 'warmup', unit: 'lb' } };
  const state: TrackerState = { trackers: [], checkIns: [], activeWorkout: draft, workoutSessions: [session] };
  const parsed = parseReclaimBackup(JSON.stringify(createReclaimBackup(state)));
  expect(parsed.state.activeWorkout).toEqual(draft);
  expect(parsed.state.workoutSessions).toEqual([session]);
  expect(finishWorkout(state, '2026-10-13T19:00:00Z').workoutSessions?.at(-1)?.setDrafts).toBeUndefined();
  expect(() => parseReclaimBackup(JSON.stringify({ ...createReclaimBackup(state), state: { ...state, activeWorkout: { ...draft, pausedMs: -1 } } }))).toThrow(/invalid workout/);
  expect(() => parseReclaimBackup(JSON.stringify({ ...createReclaimBackup(state), state: { ...state, activeWorkout: { ...draft, setDrafts: { press: { ...draft.setDrafts!.press, unit: 'stone' } } } } }))).toThrow(/invalid workout/);
});
test('records and estimated one-rep max stay within comparable weighted exercises', () => {
  expect(estimatedOneRepMaxKg(session.exercises[0].sets[0])).toBeCloseTo(66.67, 1);
  expect(estimatedOneRepMaxKg({ ...session.exercises[0].sets[0], reps: 15 })).toBeUndefined();
  const later = { ...session, id: 'two', startedAt: '2026-10-14T15:00:00Z', endedAt: '2026-10-14T16:00:00Z', exercises: [{ ...session.exercises[0], sets: [{ ...session.exercises[0].sets[0], weightKg: 55, completedAt: '2026-10-14T15:20:00Z' }] }] };
  expect(recentStrengthRecords([session, later])[0]).toMatchObject({ name: 'Bench', weightKg: 55 });
});
