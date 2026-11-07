import { TrackerState } from '@/models/tracker';
import { assignGoalColors, HOME_GOAL_COLORS, homeGoalColor, normalizeHomeGoalColors } from './home-goal-colors';
import { assignHomeGoalColors, migratePreferences, setHomeGoalColors } from './preferences';

const empty = { trackers: [], checkIns: [] } as TrackerState;

test('existing goals retain their original color until customized', () => {
  expect(homeGoalColor('walk', undefined, '#63D8C6')).toBe('#63D8C6');
  expect(migratePreferences(empty).preferences?.homeGoalColors).toEqual({});
});

test('a saved goal color survives migration without changing goal data', () => {
  const before = migratePreferences(empty);
  const colored = setHomeGoalColors(before, { walk: '#FF9F43', steps: '#38BDF8' });
  expect(homeGoalColor('walk', colored.preferences?.homeGoalColors, '#63D8C6')).toBe('#FF9F43');
  expect(migratePreferences(colored).preferences?.homeGoalColors).toEqual({ walk: '#FF9F43', steps: '#38BDF8' });
  expect(colored.trackers).toBe(before.trackers);
});

test('a color picked from the earlier palette moves to its closest replacement', () => {
  expect(normalizeHomeGoalColors({ walk: '#F2B766', steps: '#19DDD0' })).toEqual({ walk: '#FF9F43', steps: '#19DDD0' });
  expect(homeGoalColor('walk', { walk: '#78B7FF' }, '#63D8C6')).toBe('#5B8CFF');
});

test('every goal gets its own color, starting from its natural one', () => {
  const colors = assignGoalColors([{ id: 'steps', kind: 'steps' }, { id: 'a', kind: 'water' }, { id: 'b', kind: 'water' }], {});
  expect(colors.steps).toBe('#38BDF8');
  expect(colors.a).toBe('#5B8CFF');
  expect(new Set(Object.values(colors)).size).toBe(3);
});

test('a chosen color is kept, and a later goal does not take it', () => {
  const colors = assignGoalColors([{ id: 'a', kind: 'walk' }, { id: 'b', kind: 'water' }], { b: '#3DDC6E' });
  expect(colors.b).toBe('#3DDC6E');
  expect(colors.a).not.toBe('#3DDC6E');
});

test('two goals saved with the same color are separated, and the first keeps it', () => {
  const colors = assignGoalColors([{ id: 'a', kind: 'walk' }, { id: 'b', kind: 'reading' }], { a: '#19DDD0', b: '#19DDD0' });
  expect(colors.a).toBe('#19DDD0');
  expect(colors.b).toBe('#FF9F43');
});

test('a color can repeat only when goals outnumber the colors', () => {
  const goals = Array.from({ length: HOME_GOAL_COLORS.length + 1 }, (_, index) => ({ id: `goal-${index}`, kind: 'custom' }));
  expect(new Set(Object.values(assignGoalColors(goals, {}))).size).toBe(HOME_GOAL_COLORS.length);
});

test('assigning colors leaves the state untouched when nothing needs one', () => {
  const state = { ...migratePreferences(empty), stepGoals: [{ effectiveDate: '2026-01-01', count: 8000 }] } as TrackerState;
  const assigned = assignHomeGoalColors(state);
  expect(assigned.preferences?.homeGoalColors?.steps).toBe('#38BDF8');
  expect(assignHomeGoalColors(assigned)).toBe(assigned);
});

test('unsupported saved colors fall back safely', () => {
  expect(normalizeHomeGoalColors({ walk: 'not-a-color', steps: '#3DDC6E' })).toEqual({ steps: '#3DDC6E' });
  expect(homeGoalColor('walk', { walk: 'red' }, '#63D8C6')).toBe('#63D8C6');
});
