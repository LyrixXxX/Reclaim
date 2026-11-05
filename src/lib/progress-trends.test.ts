import { TrackerState } from '@/models/tracker';
import { allGoalsStreak, formatTrendValue, progressTrends, trendDates, trendStats, trendSummary } from './progress-trends';

const TODAY = '2026-11-04';

function state(extra: Partial<TrackerState> = {}): TrackerState {
  return {
    trackers: [], checkIns: [],
    preferences: { visibleSections: { activity: true, nutrition: true, goals: true } },
    stepGoals: [{ effectiveDate: '2026-10-01', count: 8000 }],
    ...extra,
  } as unknown as TrackerState;
}

describe('trendDates', () => {
  it('lists the days ending today, oldest first', () => {
    expect(trendDates(TODAY, 3)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(trendDates('2026-03-01', 2)).toEqual(['2026-02-28', '2026-03-01']);
  });
});

describe('progressTrends', () => {
  it('judges steps against each day’s goal and leaves missing days blank', () => {
    const s = state({ stepGoals: [{ effectiveDate: '2026-10-01', count: 8000 }, { effectiveDate: '2026-11-04', count: 10000 }] });
    const [steps] = progressTrends(s, { stepDays: [{ date: '2026-11-02', count: 9000 }, { date: '2026-11-04', count: 9000 }], today: TODAY, days: 3 });
    expect(steps.days).toEqual([
      { date: '2026-11-02', value: 9000, goal: 8000, reached: true },
      { date: '2026-11-03', value: null, goal: 8000, reached: null },
      { date: '2026-11-04', value: 9000, goal: 10000, reached: false },
    ]);
  });

  it('skips steps when the section is hidden', () => {
    const s = state({ preferences: { visibleSections: { activity: false } } as never });
    expect(progressTrends(s, { stepDays: [], today: TODAY, days: 3 }).map((item) => item.id)).not.toContain('steps');
  });

  it('judges nutrition within 200 kcal of the budget, only on days with food logged', () => {
    const s = state({
      nutritionGoals: [{ id: 'g', effectiveDate: '2026-11-03', recordedAt: '', calorieTarget: 2000 }] as never,
      nutritionEntries: [
        { id: 'a', eventDate: '2026-11-03', servings: 1, statedCalories: 1900, nutrients: {} },
        { id: 'b', eventDate: '2026-11-04', servings: 1, statedCalories: 2600, nutrients: {} },
      ] as never,
    });
    const nutrition = progressTrends(s, { stepDays: [], today: TODAY, days: 3 }).find((item) => item.id === 'nutrition')!;
    expect(nutrition.days.map((day) => day.reached)).toEqual([null, true, false]);
    expect(nutrition.days[0]).toEqual({ date: '2026-11-02', value: null, goal: null, reached: null });
  });

  it('tracks water from the habit’s start, against each day’s goal', () => {
    const water = { id: 'w', name: 'Water', habitTemplate: 'water', mode: 'habit', startedAt: '2026-11-03T08:00:00', waterGoals: [{ effectiveDate: '2026-11-01', ounces: 64 }] };
    const s = state({ trackers: [water] as never, waterLogs: [{ id: 'l', trackerId: 'w', eventDate: '2026-11-04', ounces: 70, recordedAt: '' }] as never });
    const series = progressTrends(s, { stepDays: [], today: TODAY, days: 3 }).find((item) => item.id === 'w')!;
    expect(series.days.map((day) => [day.value, day.reached])).toEqual([[null, null], [0, false], [70, true]]);
  });

  it('counts phone walking minutes for the Walk habit', () => {
    const walk = { id: 'k', name: 'Walk more', habitTemplate: 'walk', mode: 'habit', startedAt: '2026-11-01T08:00:00', habitGoalHistory: [{ effectiveDate: '2026-11-01', value: 30 }] };
    const series = progressTrends(state({ trackers: [walk] as never }), { stepDays: [], phoneMinutesByDate: { '2026-11-04': 31 }, today: TODAY, days: 2 }).find((item) => item.id === 'k')!;
    expect(series.days.map((day) => day.reached)).toEqual([false, true]);
  });

  it('leaves out weekly, mindfulness, archived and hidden habits', () => {
    const habit = (id: string, extra: object) => ({ id, name: id, mode: 'habit', habitTemplate: 'reading', startedAt: '2026-11-01T08:00:00', habitGoalHistory: [{ effectiveDate: '2026-11-01', value: 10 }], ...extra });
    const s = state({ trackers: [habit('weekly', { habitTemplate: 'exercise' }), habit('calm', { habitTemplate: 'mindfulness' }), habit('old', { archived: true }), habit('hidden', {}), habit('read', {})] as never,
      preferences: { visibleSections: { activity: false }, hiddenHomeHabitIds: ['hidden'] } as never });
    expect(progressTrends(s, { stepDays: [], today: TODAY, days: 2 }).map((item) => item.id)).toEqual(['read']);
  });
});

describe('summary and stats', () => {
  const series = [
    { id: 'a', title: 'A', kind: 'steps', unit: 'steps', href: '', days: [{ date: '1', value: 1, goal: 1, reached: true }, { date: '2', value: 1, goal: 1, reached: true }, { date: '3', value: 0, goal: 1, reached: false }] },
    { id: 'b', title: 'B', kind: 'habit', unit: 'minutes', href: '', days: [{ date: '1', value: null, goal: null, reached: null }, { date: '2', value: 5, goal: 5, reached: true }, { date: '3', value: 2, goal: 5, reached: false }] },
  ] as const;

  it('counts goals hit per day, ignoring goals with no data', () => {
    expect(trendSummary(series as never)).toEqual([{ date: '1', reached: 1, total: 1 }, { date: '2', reached: 2, total: 2 }, { date: '3', reached: 0, total: 2 }]);
  });

  it('counts an all-goals streak that today’s unfinished day doesn’t break', () => {
    expect(allGoalsStreak(trendSummary(series as never))).toBe(2);
    expect(allGoalsStreak([{ date: '1', reached: 1, total: 2 }, { date: '2', reached: 2, total: 2 }])).toBe(1);
    expect(allGoalsStreak([])).toBe(0);
  });

  it('averages only days with data', () => {
    expect(trendStats(series[1].days as never)).toEqual({ hitDays: 1, countedDays: 2, average: 3.5 });
    // An unfinished today isn't a miss; a hit today counts.
    expect(trendStats(series[1].days as never, '3')).toEqual({ hitDays: 1, countedDays: 1, average: 3.5 });
    expect(trendStats(series[1].days as never, '2')).toEqual({ hitDays: 1, countedDays: 2, average: 3.5 });
  });

  it('formats values by kind', () => {
    expect(formatTrendValue(8123.4, { kind: 'steps', unit: 'steps' })).toBe('8,123 steps');
    expect(formatTrendValue(16.9, { kind: 'water', unit: 'fl oz' })).toBe('16.9 fl oz');
    expect(formatTrendValue(2, { kind: 'habit', unit: 'done' })).toBe('2 done');
  });
});
