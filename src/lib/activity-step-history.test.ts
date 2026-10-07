import { DEFAULT_STEP_GOAL, goalForDate, setDailyStepGoal } from './activity-step-history';
import { routePreviewCoordinates } from '@/components/route-preview';
import { createReclaimBackup, parseReclaimBackup } from './backup';
import { createFreshState } from './onboarding';

test('step goals remain effective by date, replacing only the current day', () => {
  const first = setDailyStepGoal([], '2026-09-24', 7000);
  const next = setDailyStepGoal(first, '2026-09-25', 9000);
  expect(goalForDate(next, '2026-09-23')).toBe(DEFAULT_STEP_GOAL);
  expect(goalForDate(next, '2026-09-24')).toBe(7000);
  expect(goalForDate(next, '2026-09-25')).toBe(9000);
  expect(setDailyStepGoal(next, '2026-09-25', 10000)).toHaveLength(2);
  expect(() => setDailyStepGoal(next, '2026-09-26', 0)).toThrow();
});

test('step history and goals survive backup', () => {
  const state = { ...createFreshState(), stepHistory: [{ date: '2026-09-25', count: 1234, incomplete: true }], stepGoals: [{ effectiveDate: '2026-09-25', count: 8000 }] };
  const restored = parseReclaimBackup(JSON.stringify(createReclaimBackup(state)));
  expect(restored.state.stepHistory).toEqual(state.stepHistory);
  expect(restored.state.stepGoals).toEqual(state.stepGoals);
});

test('offline preview fits old route GPS points and handles empty routes', () => {
  expect(routePreviewCoordinates([])).toEqual([]);
  const projected = routePreviewCoordinates([
    { latitude: 41, longitude: -88, timestamp: 1 },
    { latitude: 42, longitude: -87, timestamp: 2 },
  ]);
  expect(projected).toHaveLength(2);
  for (const point of projected) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(320);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(150);
  }
});
