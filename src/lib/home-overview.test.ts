import { Medication, TrackerState } from '@/models/tracker';
import { homeOverview, nutritionGoalReached } from './home-overview';
import { DEFAULT_PREFERENCES } from './preferences';

const base: TrackerState = { trackers: [], checkIns: [], preferences: { ...DEFAULT_PREFERENCES, visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, activity: true } } };
const medication: Medication = {
  id: 'med', name: 'Daily medication', schedule: { type: 'daily', times: ['09:00', '20:00'] },
  remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-10-01T10:00:00Z',
};
const available = { status: 'available' as const, count: 2200 };

test('nutrition goal accepts a logged total within 200 kcal of the target, inclusive', () => {
  expect(nutritionGoalReached(2199.9, 2400, 1)).toBe(false);
  expect(nutritionGoalReached(2200, 2400, 1)).toBe(true);
  expect(nutritionGoalReached(2400, 2400, 1)).toBe(true);
  expect(nutritionGoalReached(2600, 2400, 1)).toBe(true);
  expect(nutritionGoalReached(2600.1, 2400, 1)).toBe(false);
  expect(nutritionGoalReached(2400, 2400, 0)).toBe(false);
});

test('counts configured nutrition, medication and step targets while only completing reached targets', () => {
  const state: TrackerState = { ...base, stepGoals: [{ effectiveDate: '2026-10-01', count: 2000 }], medications: [medication],
    nutritionGoals: [{ id: 'goal', effectiveDate: '2026-10-01', carbsGrams: 200, proteinGrams: 100, fatGrams: 80, fiberGrams: 20, recordedAt: '2026-10-01T10:00:00Z' }] };
  const result = homeOverview(state, available, new Date(2026, 9, 2, 10, 0));
  expect(result.goalCount).toBe(3);
  expect(result.reachedCount).toBe(1);
  expect(result.nutrition?.entryCount).toBe(0);
  expect(result.nutritionReached).toBe(false);
  expect(result.attention).toHaveLength(1);
});

test('future doses are not overdue, and recorded doses complete the medication goal', () => {
  const state = { ...base, medications: [medication], medicationEvents: [
    { id: 'am', medicationId: 'med', scheduledFor: '2026-10-02T09:00', occurredAt: '2026-10-02T09:02:00', outcome: 'taken' as const },
    { id: 'pm', medicationId: 'med', scheduledFor: '2026-10-02T20:00', occurredAt: '2026-10-02T20:02:00', outcome: 'taken' as const },
  ] };
  const morning = homeOverview(state, available, new Date(2026, 9, 2, 10, 0));
  expect(morning.medications).toMatchObject({ total: 2, taken: 2, reached: true });
  expect(morning.attention).toEqual([]);
});

test('medication and supplement doses share the daily goal and overdue list', () => {
  const supplement: Medication = { ...medication, id: 'supp', kind: 'supplement', name: 'Daily supplement', schedule: { type: 'daily', times: ['08:00'] } };
  const state: TrackerState = { ...base, medications: [medication, supplement], medicationEvents: [
    { id: 'supp-taken', medicationId: 'supp', scheduledFor: '2026-10-02T08:00', occurredAt: '2026-10-02T08:01:00', outcome: 'taken' },
  ] };
  const result = homeOverview(state, available, new Date(2026, 9, 2, 10, 0));
  expect(result.medications).toMatchObject({ total: 3, taken: 1, reached: false });
  expect(result.attention).toHaveLength(1);
});

test('shows live step progress even on a partial day, but does not claim an interrupted session as complete', () => {
  const state = { ...base, stepGoals: [{ effectiveDate: '2026-10-01', count: 2000 }] };
  expect(homeOverview(state, { status: 'interrupted', count: 3000 }, new Date(2026, 9, 2, 10))).toMatchObject({ goalCount: 1, reachedCount: 0, stepProgress: { pending: true } });
  expect(homeOverview(state, { ...available, incomplete: true }, new Date(2026, 9, 2, 10))).toMatchObject({ goalCount: 1, reachedCount: 1, stepProgress: { count: 2200, pending: false } });
  expect(homeOverview(state, { status: 'available', count: 300, incomplete: true }, new Date(2026, 9, 2, 10))).toMatchObject({ goalCount: 1, reachedCount: 0, stepProgress: { count: 300, pending: false } });
});

test('local midnight and hidden sections keep stale goals and doses out', () => {
  const state = { ...base, medications: [medication], stepGoals: [{ effectiveDate: '2026-10-03', count: 2000 }] };
  const before = homeOverview(state, available, new Date(2026, 9, 2, 23, 59));
  expect(before.stepProgress).toBeNull();
  const hidden = { ...state, preferences: { ...DEFAULT_PREFERENCES, visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, health: false, activity: false } } };
  expect(homeOverview(hidden, available, new Date(2026, 9, 3, 0, 1)).goalCount).toBe(0);
});

test('future nutrition goals and hidden modules do not create progress tiles', () => {
  const state: TrackerState = { ...base, nutritionGoals: [{ id: 'future', effectiveDate: '2026-10-03', carbsGrams: 200, proteinGrams: 100, fatGrams: 80, fiberGrams: 20, recordedAt: '2026-10-01T10:00:00Z' }], medications: [medication] };
  const result = homeOverview(state, available, new Date(2026, 9, 2, 8, 0));
  expect(result.nutrition).toBeNull();
  expect(result.attention).toEqual([]);
  const hidden = { ...state, preferences: { ...base.preferences!, visibleHealthModules: { ...base.preferences!.visibleHealthModules, medications: false } } };
  expect(homeOverview(hidden, available, new Date(2026, 9, 2, 10, 0)).medications).toBeNull();
});

test('skipped doses are logged but do not count as a completed medication goal', () => {
  const state: TrackerState = { ...base, medications: [medication], medicationEvents: [{ id: 'skip', medicationId: 'med', scheduledFor: '2026-10-02T09:00', occurredAt: '2026-10-02T09:10:00', outcome: 'skipped' }] };
  const result = homeOverview(state, available, new Date(2026, 9, 2, 10, 0));
  expect(result.medications).toMatchObject({ taken: 0, skipped: 1, reached: false });
  expect(result.attention).toEqual([]);
});

test('CPAP counts last night only when its reading and dated goal are available', () => {
  const cpap = { id: 'night', sleepDate: '2026-10-01', usedMinutes: 240, averagePressure: 6, p95Pressure: 9, ahi: 1.2, cai: 0, averageLeak: 1, p95Leak: 2, recordedAt: '2026-10-02T09:00:00Z' };
  const state: TrackerState = { ...base, cpapUsageGoals: [{ effectiveDate: '2026-10-01', minutes: 240 }], cpapReadings: [cpap] };
  const now = new Date(2026, 9, 2, 10);
  expect(homeOverview(state, available, now).cpap).toMatchObject({ sleepDate: '2026-10-01', reached: true, pending: false });
  expect(homeOverview(state, available, now)).toMatchObject({ goalCount: 1, reachedCount: 1 });
  expect(homeOverview({ ...state, cpapReadings: [{ ...cpap, usedMinutes: 239 }] }, available, now)).toMatchObject({ goalCount: 1, reachedCount: 0 });
  expect(homeOverview({ ...state, cpapReadings: [] }, available, now)).toMatchObject({ goalCount: 1, reachedCount: 0, cpap: { pending: true } });
  expect(homeOverview({ ...state, cpapReadings: [{ ...cpap, sleepDate: '2026-09-30' }] }, available, now).cpap?.pending).toBe(true);
  expect(homeOverview({ ...state, preferences: { ...base.preferences!, visibleSections: { ...base.preferences!.visibleSections, cpap: false } } }, available, now).cpap).toBeNull();
});

test('Home counts nutrition, medications, and pending CPAP before steps are configured', () => {
  const state: TrackerState = { ...base, medications: [medication], cpapUsageGoals: [{ effectiveDate: '2026-10-01', minutes: 240 }],
    nutritionGoals: [{ id: 'goal', effectiveDate: '2026-10-01', carbsGrams: 300, proteinGrams: 100, fatGrams: 80, fiberGrams: 20, recordedAt: '2026-10-01T10:00:00Z' }] };
  const now = new Date(2026, 9, 2, 10);
  expect(homeOverview(state, available, now)).toMatchObject({ goalCount: 3, reachedCount: 0 });
  expect(homeOverview({ ...state, stepGoals: [{ effectiveDate: '2026-10-01', count: 5000 }] }, { status: 'interrupted' }, now)).toMatchObject({ goalCount: 4, reachedCount: 0, stepProgress: { pending: true } });
});
