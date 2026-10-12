import { habitCanLogToday, logHabitCompletion, todayHabitCount } from '@/lib/habit-log';
import { habitCompletionSeries, habitConsistencyStreak, habitPeriodProgress } from '@/lib/habit';
import { Tracker, TrackerState } from '@/models/tracker';

const tracker: Tracker = { id: 'habit-1', name: 'Walk', icon: '✓', color: '#00ff99', mode: 'habit', frequencyCount: 1, frequencyPeriod: 'day', habitLogStyle: 'done' };
const state: TrackerState = { trackers: [tracker], checkIns: [], historicalEntries: [] };

describe('positive habit logging', () => {
  it('logs a legacy Done habit repeatedly without rewriting its dated history', () => {
    const once = logHabitCompletion(state, tracker.id, '2026-10-11');
    const twice = logHabitCompletion(once, tracker.id, '2026-10-11');
    expect(twice.historicalEntries).toHaveLength(1);
    expect(todayHabitCount(twice.historicalEntries ?? [], tracker.id, '2026-10-11')).toBe(2);
    expect(habitCanLogToday(tracker, twice.historicalEntries ?? [], '2026-10-11')).toBe(true);
  });

  it('increments legacy Count habits without replacing their dated entry', () => {
    const legacy = { ...tracker, habitLogStyle: undefined };
    const first = logHabitCompletion({ ...state, trackers: [legacy] }, tracker.id, '2026-10-11');
    const second = logHabitCompletion(first, tracker.id, '2026-10-11');
    expect(second.historicalEntries).toHaveLength(1);
    expect(second.historicalEntries?.[0].value).toBe(2);
  });

  it('keeps a previous streak while the current day is unfinished', () => {
    const yesterday = logHabitCompletion(state, tracker.id, '2026-10-10');
    expect(habitConsistencyStreak(tracker, yesterday.historicalEntries ?? [], new Date(2026, 9, 11, 12))).toBe(1);
  });

  it('fills a daily goal one completion at a time and permits more than the goal', () => {
    const water = { ...tracker, frequencyCount: 4 };
    let current: TrackerState = { ...state, trackers: [water] };
    for (let count = 1; count <= 5; count += 1) {
      current = logHabitCompletion(current, water.id, '2026-10-11');
      expect(habitPeriodProgress(water, current.historicalEntries ?? [], new Date(2026, 9, 11, 12)).amount).toBe(count);
    }
  });

  it('starts weeks on Monday and charts daily counts without inventing zero logs', () => {
    const weekly = { ...tracker, frequencyPeriod: 'week' as const, frequencyCount: 4 };
    const withSunday = logHabitCompletion(state, tracker.id, '2026-10-11');
    const withMonday = logHabitCompletion(withSunday, tracker.id, '2026-10-12');
    expect(habitPeriodProgress(weekly, withMonday.historicalEntries ?? [], new Date(2026, 9, 12, 12)).amount).toBe(1);
    const points = habitCompletionSeries('2026-10-11T00:00:00', withMonday.historicalEntries ?? [], new Date(2026, 9, 13, 12));
    expect(points.map((point) => [point.cumulative, point.outcome])).toEqual([[1, 'stayed_on_plan'], [1, 'stayed_on_plan'], [0, 'no_data']]);
  });
});
