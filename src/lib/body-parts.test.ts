import { BODY_PARTS, bodyPartFor, detailMusclesFor, genericMuscleFor } from './body-parts';
import { MUSCLE_GROUPS } from './workout-muscles';

test('every detailed muscle rolls up into one of the simple body parts', () => {
  for (const muscle of MUSCLE_GROUPS) expect(BODY_PARTS).toContain(bodyPartFor(muscle));
  expect(bodyPartFor('biceps')).toBe('arms');
  expect(bodyPartFor('triceps')).toBe('arms');
  expect(bodyPartFor('forearms')).toBe('arms');
  expect(bodyPartFor('quadriceps')).toBe('legs');
  expect(bodyPartFor('glutes')).toBe('legs');
  expect(bodyPartFor('traps')).toBe('back');
  expect(bodyPartFor('full body')).toBe('full body');
});

test('picking a part without detail stores its generic muscle, which maps back to the part', () => {
  for (const part of BODY_PARTS) expect(bodyPartFor(genericMuscleFor(part))).toBe(part);
});

test('detail options list only the finer muscles of that part', () => {
  expect(detailMusclesFor('arms')).toEqual(['biceps', 'triceps', 'forearms']);
  expect(detailMusclesFor('legs')).toEqual(['quadriceps', 'hamstrings', 'glutes', 'calves']);
  expect(detailMusclesFor('back')).toEqual(['traps']);
  expect(detailMusclesFor('chest')).toEqual([]);
});
