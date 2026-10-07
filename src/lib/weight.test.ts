import { latestWeightGoal, mergeWeightImport, parseWeightExport, upsertWeightEntry, weightHistoryChronological, weightStats, weightTrendSeries, weightWindow } from './weight';
import { historyPage } from './history-pages';
import { WeightEntry } from '@/models/tracker';

const file = JSON.stringify({ format: 'reclaim-weight-export', version: 1, exportedAt: '2026-09-12T12:00:00Z', unit: 'lb', entries: [
  { date: '2026-07-02', weight: 320, notes: 'later' },
  { date: '2026-07-01', weight: 321, caloriesEaten: 2000 },
] });

describe('weight migration', () => {
  test('validates, sorts, and preserves legacy fields', () => {
    const result = mergeWeightImport([], parseWeightExport(file));
    expect(result.added).toBe(2);
    expect(result.entries.map((entry) => entry.date)).toEqual(['2026-07-01', '2026-07-02']);
    expect(result.entries[0].caloriesEaten).toBe(2000);
    expect(result.entries[1].notes).toBe('later');
  });
  test('re-importing is duplicate safe', () => {
    const first = mergeWeightImport([], parseWeightExport(file));
    const second = mergeWeightImport(first.entries, parseWeightExport(file));
    expect(second.entries).toHaveLength(2); expect(second.added).toBe(0); expect(second.duplicates).toBe(2);
  });
  test('rejects invalid files before import', () => {
    expect(() => parseWeightExport('{"entries":[]}')).toThrow();
  });
  test('updates a day without duplicating it and calculates stats', () => {
    const imported = mergeWeightImport([], parseWeightExport(file)).entries;
    const updated = upsertWeightEntry(imported, { date: '2026-07-02', weight: 319, unit: 'lb' });
    expect(updated).toHaveLength(2); expect(weightStats(updated)?.current).toBe(319); expect(weightStats(updated)?.change).toBe(-2);
  });
  test('builds a rolling seven-day trend and finds the latest goal', () => {
    const imported = mergeWeightImport([], parseWeightExport(file)).entries;
    expect(weightTrendSeries(imported).map((point) => point.average)).toEqual([321, 320.5]);
    expect(latestWeightGoal(imported)).toBeUndefined();
    const withGoal = upsertWeightEntry(imported, { date: '2026-07-03', weight: 318, goal: 290, unit: 'lb' });
    expect(latestWeightGoal(withGoal)).toBe(290);
  });
});

describe('calendar-based weight averages', () => {
  const entry = (date: string, weight: number): WeightEntry => ({ id: date, date, weight, unit: 'lb', recordedAt: '' });
  test('excludes old readings, includes day seven, and does not fill gaps with zeros', () => {
    const entries = [entry('2026-09-24', 200), entry('2026-09-17', 300), entry('2026-09-18', 210)];
    const before = JSON.stringify(entries);
    expect(weightStats(entries)).toMatchObject({ sevenDayAverage: 205, latestDate: '2026-09-24', averageReadings: 2 });
    expect(weightTrendSeries(entries).at(-1)?.average).toBe(205);
    expect(JSON.stringify(entries)).toBe(before);
  });
  test('handles year boundaries and excludes later readings', () => {
    expect(weightWindow([entry('2025-12-25', 300), entry('2025-12-26', 210), entry('2026-01-01', 200), entry('2026-01-02', 190)], '2026-01-01', 7).map((item) => item.weight)).toEqual([210, 200]);
  });
  test('handles a DST change and single or empty histories', () => {
    expect(weightWindow([entry('2026-03-02', 300), entry('2026-03-03', 210), entry('2026-03-09', 200)], '2026-03-09', 7)).toHaveLength(2);
    expect(weightStats([entry('2026-01-01', 200)])?.sevenDayAverage).toBe(200);
    expect(weightStats([])).toBeNull();
    expect(weightTrendSeries([])).toEqual([]);
  });
});

describe('weight history navigation', () => {
  test('page one begins in the past and Next moves toward the latest date without changing saved order', () => {
    const entries: WeightEntry[] = Array.from({ length: 16 }, (_, index): WeightEntry => ({ id: String(index), date: `2026-03-${String(index + 1).padStart(2, '0')}`, weight: 320 - index, unit: 'lb', recordedAt: '' })).reverse();
    const original = JSON.stringify(entries);
    const ordered = weightHistoryChronological(entries);
    expect(historyPage(ordered, 0).items[0].date).toBe('2026-03-01');
    expect(historyPage(ordered, 1).items[0].date).toBe('2026-03-08');
    expect(historyPage(ordered, 2).items.at(-1)?.date).toBe('2026-03-16');
    expect(JSON.stringify(entries)).toBe(original);
  });
});
