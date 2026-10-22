import { clearSetDraft, emptySetDraft, hasUnloggedSetInput, loggedWeightLabel, parseRoutineDraft, parseSetDraft, recordCompletedSet, routineDraftFor, updateSetDraft, weightFieldLabel } from './workout-entry';
import { WorkoutExercise } from '@/models/tracker';

const chestPress: WorkoutExercise = { id: 'press', exerciseId: 'press', name: 'Chest Press', primaryMuscle: 'chest', equipment: 'machine', plannedSets: 3, targetReps: 10, sets: [] };

test('legacy routine targets are optional and invalid nonblank values are rejected', () => {
  const cleared = parseRoutineDraft({ plannedSets: '', targetReps: '', targetWeight: '', restSeconds: '' }, 'lb');
  expect(cleared.value).toMatchObject({ plannedSets: undefined, targetReps: undefined });
  expect(cleared.errors).toEqual({});
  const valid = parseRoutineDraft({ plannedSets: '9', targetReps: '', targetWeight: '12,5', restSeconds: '' }, 'lb');
  expect(valid.errors).toEqual({});
  expect(valid.value?.targetReps).toBeUndefined();
  expect(valid.value?.targetWeightKg).toBeCloseTo(12.5 / 2.2046226218);
  expect(parseRoutineDraft({ plannedSets: '2.5', targetReps: '0', targetWeight: '-3', restSeconds: '3601' }, 'kg').errors).toEqual({
    plannedSets: 'Enter 1–100 planned sets or leave blank.', targetReps: 'Enter 1–1000 reps or leave blank.', targetWeight: 'Enter 0–5000 kg or leave blank.', restSeconds: 'Enter 0–3600 seconds or leave blank.',
  });
});

test('existing routine values display while new entry drafts may start blank', () => {
  expect(routineDraftFor(chestPress, 'lb')).toMatchObject({ plannedSets: '3', targetReps: '10', targetWeight: '' });
});

test('set entry requires reps but not weight and accepts decimal load in either unit', () => {
  expect(parseSetDraft(emptySetDraft('lb')).error).toMatch(/reps/);
  expect(parseSetDraft({ ...emptySetDraft('lb'), reps: '12' })).toMatchObject({ reps: 12, weightKg: undefined });
  expect(parseSetDraft({ ...emptySetDraft('kg'), reps: '8', weight: '22,5' }).weightKg).toBe(22.5);
  expect(parseSetDraft({ ...emptySetDraft('lb'), reps: '8', weight: '45.5' }).weightKg).toBeCloseTo(45.5 / 2.2046226218);
});

test('blank weight wording depends on equipment and bodyweight load is explicitly added', () => {
  const set = { id: 'one', kind: 'working' as const, reps: 12, completedAt: '2026-10-14T00:00:00Z' };
  expect(weightFieldLabel('machine', 'lb')).toBe('Weight (lb)');
  expect(weightFieldLabel('bodyweight', 'kg')).toBe('Added weight (kg)');
  expect(loggedWeightLabel(set, 'machine', 'lb')).toBe('weight not entered');
  expect(loggedWeightLabel(set, 'bodyweight', 'lb')).toBe('bodyweight');
  expect(loggedWeightLabel({ ...set, weightKg: 10 }, 'bodyweight', 'kg')).toBe('+10 kg added');
});

test('unfinished set drafts remain separate when switching exercises and clear independently', () => {
  const session = { id: 'session', name: 'Workout', startedAt: '2026-10-14T00:00:00Z', pausedMs: 0, exercises: [chestPress] };
  const first = updateSetDraft(session, 'press', { weight: '45.', reps: '8' }, 'lb');
  const second = updateSetDraft(first, 'row', { reps: '12' }, 'kg');
  expect(second.setDrafts?.press).toMatchObject({ weight: '45.', reps: '8', unit: 'lb' });
  expect(second.setDrafts?.row).toMatchObject({ weight: '', reps: '12', unit: 'kg' });
  expect(clearSetDraft(second, 'row').setDrafts?.press).toEqual(second.setDrafts?.press);
});

test('completed sets auto-suggest editable next values and reject duplicate set IDs', () => {
  const session = { id: 'session', name: 'Workout', startedAt: '2026-10-14T00:00:00Z', pausedMs: 0, exercises: [chestPress] };
  const set = { id: 'set-one', kind: 'working' as const, reps: 8, weightKg: 40, completedAt: '2026-10-14T00:01:00Z' };
  const logged = recordCompletedSet(session, 'press', set, 'kg');
  expect(logged.exercises[0].sets).toEqual([set]);
  expect(logged.setDrafts?.press).toMatchObject({ reps: '8', weight: '40', autoSuggested: true });
  expect(recordCompletedSet(logged, 'press', set, 'kg')).toBe(logged);
  expect(updateSetDraft(logged, 'press', { weight: '42.5', autoSuggested: false }, 'kg').setDrafts?.press).toMatchObject({ weight: '42.5', autoSuggested: false });
});

test('carried values do not look unfinished, but typed set inputs do', () => {
  const carried = { ...emptySetDraft('lb'), weight: '75', reps: '10', autoSuggested: true };
  expect(hasUnloggedSetInput({ press: carried })).toBe(false);
  expect(hasUnloggedSetInput({ press: { ...carried, reps: '12', autoSuggested: false } })).toBe(true);
  expect(hasUnloggedSetInput({ press: emptySetDraft('lb') })).toBe(false);
});
