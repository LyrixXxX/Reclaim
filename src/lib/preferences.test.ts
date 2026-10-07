import { DEFAULT_PREFERENCES, hiddenHabitsDestination, migratePreferences, setHealthModuleVisible, setSectionVisible } from './preferences';
import { TrackerState } from '@/models/tracker';

const state = { trackers: [], checkIns: [] } as TrackerState;
describe('visibility preferences', () => {
  test('adds backward-compatible defaults', () => { expect(migratePreferences(state).preferences).toEqual(DEFAULT_PREFERENCES); });
  test('adds nutrition without changing existing visibility choices', () => {
    const migrated = migratePreferences({ ...state, preferences: { visibleSections: { goals: false, health: true, cpap: false, weight: true } as never, visibleHealthModules: DEFAULT_PREFERENCES.visibleHealthModules } });
    expect(migrated.preferences?.visibleSections).toMatchObject({ goals: false, cpap: false, nutrition: true });
  });
  test('hiding sections and modules preserves all stored data', () => { const populated = { ...state, cpapReadings: [{ id: 'x' }] } as unknown as TrackerState; const hidden = setHealthModuleVisible(setSectionVisible(populated, 'cpap', false), 'labs', false); expect(hidden.preferences?.visibleSections.cpap).toBe(false); expect(hidden.preferences?.visibleHealthModules.labs).toBe(false); expect(hidden.cpapReadings).toEqual([{ id: 'x' }]); });
  test('redirects hidden Habits to Nutrition when it is the remaining visible section', () => {
    expect(hiddenHabitsDestination({ goals: false, health: false, cpap: false, weight: false, nutrition: true, activity: false })).toBe('/nutrition');
  });
  test('redirects hidden Habits to Settings when every optional section is hidden', () => {
    expect(hiddenHabitsDestination({ goals: false, health: false, cpap: false, weight: false, nutrition: false, activity: false })).toBe('/settings');
  });
});
