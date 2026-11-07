import { TrackerState } from '@/models/tracker';
import { homeOverview } from './home-overview';
import { DEFAULT_PREFERENCES } from './preferences';

const base: TrackerState = { trackers: [], checkIns: [], preferences: { ...DEFAULT_PREFERENCES, visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, activity: true } } };

test('calories are reported on Home but never count as a goal', () => {
  const state: TrackerState = {
    ...base,
    nutritionGoals: [{ id: 'goal', effectiveDate: '2026-10-01', calorieTarget: 2000, carbsGrams: 200, proteinGrams: 100, fatGrams: 80, fiberGrams: 20, recordedAt: '2026-10-01T10:00:00Z' }],
    nutritionEntries: [{ id: 'food', eventDate: '2026-10-02', servings: 1, statedCalories: 2000, nutrients: {} }] as never,
  };
  const result = homeOverview(state, { status: 'permission-needed' }, new Date(2026, 9, 2, 10));
  expect(result.nutrition).toMatchObject({ calories: 2000, budget: 2000, entryCount: 1 });
  expect(result.goalCount).toBe(0);
  expect(result.reachedCount).toBe(0);
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
  expect(result.goalCount).toBe(1);
  expect(result.reachedCount).toBe(1);
  expect(result.attention).toEqual([]);
  expect('medications' in result).toBe(false);
  expect('cpap' in result).toBe(false);
});

test('interrupted step tracking is not counted as reached', () => {
  const state = { ...base, stepGoals: [{ effectiveDate: '2026-10-01', count: 2000 }] };
  expect(homeOverview(state, { status: 'interrupted', count: 3000 }, new Date(2026, 9, 2, 10))).toMatchObject({ goalCount: 1, reachedCount: 0, stepProgress: { pending: true } });
});

test('visible daily habits join Home goals while hidden or archived habits do not', () => {
  const water = { id: 'water', name: 'Drink water', icon: 'water', color: '#fff', mode: 'habit' as const, habitTemplate: 'water' as const,
    waterGoals: [{ effectiveDate: '2026-10-01', ounces: 64 }], waterQuickAddOz: 8 };
  const walk = { id: 'walk', name: 'Walk more', icon: 'walk', color: '#fff', mode: 'habit' as const, habitTemplate: 'walk' as const,
    habitGoalHistory: [{ effectiveDate: '2026-10-01', value: 30 }] };
  const state: TrackerState = { ...base, trackers: [water, walk], waterLogs: [{ id: 'one', trackerId: 'water', eventDate: '2026-10-22', ounces: 64, recordedAt: '2026-10-22T12:00:00Z' }],
    preferences: { ...base.preferences!, hiddenHomeHabitIds: ['walk'] } };
  const result = homeOverview(state, { status: 'permission-needed' }, new Date(2026, 9, 22, 12));
  expect(result.dailyHabitGoals.map((goal) => goal.id)).toEqual(['water']);
  expect(result.goalCount).toBe(1);
  expect(result.reachedCount).toBe(1);
  expect(homeOverview({ ...state, trackers: [{ ...water, archived: true }] }, { status: 'permission-needed' }, new Date(2026, 9, 22, 12)).goalCount).toBe(0);
});

test('weekly habits show as cards and do not enter the daily goal count', () => {
  const weekly = { id: 'exercise', name: 'Exercise', icon: 'exercise', color: '#fff', mode: 'habit' as const, habitTemplate: 'exercise' as const,
    habitGoalHistory: [{ effectiveDate: '2026-10-01', value: 2 }] };
  const result = homeOverview({ ...base, trackers: [weekly] }, { status: 'permission-needed' }, new Date(2026, 9, 22, 12));
  expect(result.goalCount).toBe(0);
  expect(result.weeklyHabitCards.map((card) => card.id)).toEqual(['exercise']);
});

test('mindfulness is reserved for its own Home card, not the daily goals ring', () => {
  const mindfulness = { id: 'mindfulness', name: 'Practice mindfulness', icon: 'mindfulness', color: '#fff', mode: 'habit' as const, habitTemplate: 'mindfulness' as const,
    habitGoalHistory: [{ effectiveDate: '2026-10-01', value: 10 }] };
  const result = homeOverview({ ...base, trackers: [mindfulness] }, { status: 'permission-needed' }, new Date(2026, 9, 22, 12));
  expect(result.dailyHabitGoals).toEqual([]);
  expect(result.goalCount).toBe(0);
});

test('Home ignores walking intervals fetched for the previous day', () => {
  const walk = { id: 'walk', name: 'Walk more', icon: 'walk', color: '#fff', mode: 'habit' as const, habitTemplate: 'walk' as const,
    habitGoalHistory: [{ effectiveDate: '2026-10-01', value: 30 }] };
  const now = new Date(2026, 9, 22, 0, 1);
  const previous = { date: '2026-10-21', intervals: [{ startedAt: new Date(2026, 9, 21, 9).getTime(), endedAt: new Date(2026, 9, 21, 9, 40).getTime() }] };
  expect(homeOverview({ ...base, trackers: [walk] }, { status: 'permission-needed' }, now, previous).dailyHabitGoals[0].reached).toBe(false);
});

test('Home shows due supplement doses but no future, taken, skipped, or archived doses', () => {
  const supplement = { id: 'vitamin', kind: 'supplement' as const, name: 'Vitamin D', schedule: { type: 'daily' as const, times: ['09:00', '18:00'] },
    remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-10-01T12:00:00Z' };
  const now = new Date(2026, 9, 22, 10);
  const state = { ...base, medications: [supplement] };
  expect(homeOverview(state, { status: 'permission-needed' }, now).attention).toEqual([
    { id: 'supplement-vitamin-09:00', title: 'Supplement: Vitamin D', detail: '9:00 AM · Not logged yet', href: '/supplements' },
  ]);
  const logged = { ...state, medicationEvents: [{ id: 'taken', medicationId: 'vitamin', scheduledFor: '2026-10-22T09:00', occurredAt: now.toISOString(), outcome: 'taken' as const }] };
  expect(homeOverview(logged, { status: 'permission-needed' }, now).attention).toEqual([]);
  expect(homeOverview({ ...state, medications: [{ ...supplement, archived: true }] }, { status: 'permission-needed' }, now).attention).toEqual([]);
});
