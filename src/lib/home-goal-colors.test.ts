import { TrackerState } from '@/models/tracker';
import { homeGoalColor, normalizeHomeGoalColors } from './home-goal-colors';
import { migratePreferences, setHomeGoalColors } from './preferences';

const empty = { trackers: [], checkIns: [] } as TrackerState;

test('existing goals retain their original color until customized', () => {
  expect(homeGoalColor('walk', undefined, '#63D8C6')).toBe('#63D8C6');
  expect(migratePreferences(empty).preferences?.homeGoalColors).toEqual({});
});

test('a saved goal color survives migration without changing goal data', () => {
  const before = migratePreferences(empty);
  const colored = setHomeGoalColors(before, { walk: '#F2B766', steps: '#78B7FF' });
  expect(homeGoalColor('walk', colored.preferences?.homeGoalColors, '#63D8C6')).toBe('#F2B766');
  expect(migratePreferences(colored).preferences?.homeGoalColors).toEqual({ walk: '#F2B766', steps: '#78B7FF' });
  expect(colored.trackers).toBe(before.trackers);
});

test('unsupported saved colors fall back safely', () => {
  expect(normalizeHomeGoalColors({ walk: 'not-a-color', steps: '#6DD7B1' })).toEqual({ steps: '#6DD7B1' });
  expect(homeGoalColor('walk', { walk: 'red' }, '#63D8C6')).toBe('#63D8C6');
});
