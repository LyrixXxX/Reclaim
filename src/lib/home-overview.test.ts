import { TrackerState } from '@/models/tracker';
import { homeOverview, nutritionGoalDetail, nutritionGoalReached } from './home-overview';
import { DEFAULT_PREFERENCES } from './preferences';

const base: TrackerState = { trackers: [], checkIns: [], preferences: { ...DEFAULT_PREFERENCES, visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, activity: true } } };

test('nutrition goal accepts a logged total within 200 kcal of the target', () => {
  expect(nutritionGoalReached(2200, 2400, 1)).toBe(true);
  expect(nutritionGoalReached(2600, 2400, 1)).toBe(true);
  expect(nutritionGoalReached(2601, 2400, 1)).toBe(false);
  expect(nutritionGoalReached(2400, 2400, 0)).toBe(false);
  expect(nutritionGoalDetail(2500, 2400, 5)).toBe('100 kcal over budget · goal met');
});

test('Home counts only active wellness targets, not retained older records', () => {
  const state: TrackerState = {
    ...base,
    stepGoals: [{ effectiveDate: '2026-10-01', count: 2000 }],
    nutritionGoals: [{ id: 'goal', effectiveDate: '2026-10-01', carbsGrams: 200, proteinGrams: 100, fatGrams: 80, fiberGrams: 20, recordedAt: '2026-10-01T10:00:00Z' }],
    medications: [{ id: 'med', name: 'Older record', schedule: { type: 'daily', times: ['09:00'] }, remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-10-01T10:00:00Z' }],
    cpapUsageGoals: [{ effectiveDate: '2026-10-01', minutes: 240 }],
  };
  const result = homeOverview(state, { status: 'available', count: 2200 }, new Date(2026, 9, 2, 10));
  expect(result.goalCount).toBe(2);
  expect(result.reachedCount).toBe(1);
  expect(result.attention).toEqual([]);
  expect('medications' in result).toBe(false);
  expect('cpap' in result).toBe(false);
});

test('interrupted step tracking is not counted as reached', () => {
  const state = { ...base, stepGoals: [{ effectiveDate: '2026-10-01', count: 2000 }] };
  expect(homeOverview(state, { status: 'interrupted', count: 3000 }, new Date(2026, 9, 2, 10))).toMatchObject({ goalCount: 1, reachedCount: 0, stepProgress: { pending: true } });
});
