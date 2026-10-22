import { DEFAULT_PREFERENCES, hiddenHabitsDestination, migratePreferences, moveNavigationSection, normalizeNavigationOrder, setHealthModuleVisible, setNavigationOrder, setSectionVisible } from './preferences';
import { TrackerState } from '@/models/tracker';

const state = { trackers: [], checkIns: [] } as TrackerState;
describe('visibility preferences', () => {
  test('adds backward-compatible defaults', () => { expect(migratePreferences(state).preferences).toEqual(DEFAULT_PREFERENCES); });
  test('Workouts is hidden by default but a saved setting stays enabled', () => {
    expect(migratePreferences(state).preferences?.visibleSections.workouts).toBe(false);
    const enabled = setSectionVisible(migratePreferences(state), 'workouts', true);
    expect(migratePreferences(enabled).preferences?.visibleSections.workouts).toBe(true);
  });
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
  test('preserves the old bottom-bar order for existing users', () => {
    expect(migratePreferences(state).preferences?.navigationOrder).toEqual(['activity', 'routes', 'goals', 'weight', 'nutrition', 'workouts']);
  });
  test('saves and restores a custom order independently of visibility', () => {
    const ordered = setNavigationOrder(migratePreferences(state), moveNavigationSection(DEFAULT_PREFERENCES.navigationOrder!, 5, 0));
    expect(migratePreferences(ordered).preferences?.navigationOrder).toEqual(['workouts', 'activity', 'routes', 'goals', 'weight', 'nutrition']);
    expect(ordered.preferences?.visibleSections).toEqual(DEFAULT_PREFERENCES.visibleSections);
  });
  test('repairs missing, duplicate, or retired navigation entries', () => {
    expect(normalizeNavigationOrder(['nutrition', 'nutrition', 'health', 'goals'])).toEqual(['nutrition', 'goals', 'activity', 'routes', 'weight', 'workouts']);
  });
  test('drops retired Health Connect settings without touching saved records', () => {
    const oldState = { ...state, weightEntries: [{ id: 'old-reading', date: '2026-10-20', weight: 90, unit: 'kg', source: 'health-connect' }], preferences: { ...DEFAULT_PREFERENCES, stepSource: 'health-connect', autoImportHealthWeights: true } } as unknown as TrackerState;
    const migrated = migratePreferences(oldState);
    expect(migrated.weightEntries).toEqual(oldState.weightEntries);
    expect(migrated.preferences).not.toHaveProperty('stepSource');
    expect(migrated.preferences).not.toHaveProperty('autoImportHealthWeights');
  });
});
