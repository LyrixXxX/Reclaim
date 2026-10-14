import { EXPANDED_STRENGTH_CATALOG } from '@/data/strength-exercise-catalog';
import { searchStrengthExercises } from './strength-exercise-search';
import { BUILTIN_EXERCISES, makeWorkoutExercise, workoutVolumeKg } from './workouts';
import { parseSetDraft, setAmountLabel } from './workout-entry';
import { exerciseProgress } from './workout-analytics';
import { WorkoutSession } from '@/models/tracker';
import { createReclaimBackup, parseReclaimBackup } from './backup';

test('catalog has permanent unique IDs and no duplicate movements', () => {
  expect(EXPANDED_STRENGTH_CATALOG).toHaveLength(157);
  expect(BUILTIN_EXERCISES).toHaveLength(165);
  expect(new Set(BUILTIN_EXERCISES.map((item) => item.id)).size).toBe(BUILTIN_EXERCISES.length);
  expect(new Set(BUILTIN_EXERCISES.map((item) => item.name)).size).toBe(BUILTIN_EXERCISES.length);
  for (const exercise of EXPANDED_STRENGTH_CATALOG) expect(BUILTIN_EXERCISES.filter((item) => item.name === exercise.name)).toHaveLength(1);
  expect(BUILTIN_EXERCISES.find((item) => item.name === 'Barbell Bench Press')?.id).toBe('builtin-0');
  expect(BUILTIN_EXERCISES.find((item) => item.name === 'Romanian Deadlift')?.id).toBe('builtin-19');
});

test('aliases, filters and source find the right exercise quickly', () => {
  expect(searchStrengthExercises(BUILTIN_EXERCISES, 'rdl').map((item) => item.name)).toContain('Romanian Deadlift');
  expect(searchStrengthExercises(BUILTIN_EXERCISES, 'tri pushdown').map((item) => item.name)).toContain('Cable Triceps Pushdown');
  expect(searchStrengthExercises(BUILTIN_EXERCISES, 'leg press', { muscle: 'quadriceps', equipment: 'machine' }).length).toBeGreaterThan(2);
  expect(searchStrengthExercises(BUILTIN_EXERCISES, 'bench', { source: 'custom' })).toHaveLength(0);
});

test('assisted weight, holds and carries are distinct from strength volume and 1RM', () => {
  const assisted = parseSetDraft({ weight: '50', reps: '8', notes: '', kind: 'working', unit: 'kg' }, 'assisted_reps');
  const hold = parseSetDraft({ weight: '', reps: '45.5', notes: '', kind: 'working', unit: 'kg' }, 'timed_hold');
  const carry = parseSetDraft({ weight: '20', reps: '30', notes: '', kind: 'working', unit: 'kg' }, 'distance_carry');
  expect(assisted).toMatchObject({ assistanceKg: 50, weightKg: undefined, reps: 8 });
  expect(hold).toMatchObject({ holdSeconds: 45.5, reps: 1 });
  expect(carry).toMatchObject({ distanceMeters: 30, weightKg: 20, reps: 1 });
  expect(setAmountLabel({ id: 's', kind: 'working', reps: 1, holdSeconds: 45.5, completedAt: '2026-01-01T00:00:00Z' }, 'timed_hold')).toBe('45.5 sec hold');
  const entry = makeWorkoutExercise(BUILTIN_EXERCISES.find((item) => item.name === 'Dead Hang')!);
  entry.sets.push({ id: 's', kind: 'working', reps: 1, holdSeconds: 45.5, completedAt: '2026-01-01T00:00:00Z' });
  const session: WorkoutSession = { id: 'w', name: 'Test', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:01:00Z', pausedMs: 0, exercises: [entry] };
  expect(workoutVolumeKg(session)).toBe(0);
  expect(exerciseProgress([session], entry.exerciseId)[0]).toMatchObject({ bestHoldSeconds: 45.5, volumeKg: 0, bestEstimatedOneRepMaxKg: undefined });
});

test('backup round-trip keeps exercise type and assistance separate', () => {
  const custom = { id: 'custom-assisted', name: 'Assisted Machine Pull-Up', primaryMuscle: 'back' as const, secondaryMuscles: ['biceps' as const], equipment: 'machine' as const, measurementType: 'assisted_reps' as const, aliases: ['pull-up assist'], custom: true };
  const entry = makeWorkoutExercise(custom);
  entry.sets.push({ id: 'set', kind: 'working', reps: 8, assistanceKg: 20, completedAt: '2026-01-01T00:00:00Z' });
  const session: WorkoutSession = { id: 'session', name: 'Pull', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:30:00Z', pausedMs: 0, exercises: [entry] };
  const state = { trackers: [], checkIns: [], strengthExercises: [custom], workoutSessions: [session] };
  const restored = parseReclaimBackup(JSON.stringify(createReclaimBackup(state))).state;
  expect(restored.strengthExercises?.[0]).toEqual(custom);
  expect(restored.workoutSessions?.[0].exercises[0].sets[0].assistanceKg).toBe(20);
  expect(restored.workoutSessions?.[0].exercises[0].sets[0].weightKg).toBeUndefined();
});
