import { NutritionEntry, NutritionGoalProfile } from '@/models/tracker';
import { buildNutritionReport, macroShare, reportPeriod, reportValue } from './nutrition-report';

const now = new Date(2026, 8, 23, 10);
const nutrients = { carbsGrams: 100, proteinGrams: 50, fatGrams: 20, fiberGrams: 15 };
const entry = (date: string, calories = 1000, changes: Partial<NutritionEntry> = {}): NutritionEntry => ({ id: `entry-${date}`, name: 'Food', eventDate: date, recordedAt: '', updatedAt: '', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', servingLabel: 'portion', servings: 1, source: 'manual', nutrients, statedCalories: calories, ...changes });
const goal = (date: string, carbsGrams: number): NutritionGoalProfile => ({ ...nutrients, id: date, effectiveDate: date, recordedAt: '', carbsGrams });

describe('rolling nutrition reports', () => {
  test('seven days cross Monday, month-end and New Year', () => {
    expect(reportPeriod('week', 0, now).dates).toEqual(['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
    expect(reportPeriod('week', 0, new Date(2027, 0, 1)).dates[0]).toBe('2026-12-26');
    expect(reportPeriod('week', 0, new Date(2026, 9, 1)).dates[0]).toBe('2026-09-25');
  });
  test('thirty and 365 dates have fixed lengths through leap day', () => {
    expect(reportPeriod('month', 0, new Date(2024, 2, 1)).dates).toHaveLength(30);
    expect(reportPeriod('month', 0, new Date(2024, 2, 1)).dates).toContain('2024-02-29');
    expect(reportPeriod('year', 0, new Date(2024, 2, 1)).dates).toHaveLength(365);
    expect(reportPeriod('week', -1, now).dates.at(-1)).toBe('2026-09-16');
  });
  test('all includes earliest entry and ends today', () => {
    const report = buildNutritionReport([entry('2025-01-02'), entry('2026-09-21')], [], [], 'all', 0, now);
    expect(report.dates[0]).toBe('2025-01-02');
    expect(report.dates.at(-1)).toBe('2026-09-23');
    expect(report.summary.loggedDays).toBe(2);
  });
  test('today is live, missing days are null, future entries are excluded', () => {
    const report = buildNutritionReport([entry('2026-09-21', 1000), entry('2026-09-23', 900), entry('2026-09-24', 9999)], [], [], 'week', 0, now);
    expect(report.summary.average?.calories).toBe(1000);
    expect(report.today.calories).toBe(900);
    expect(report.points.find((point) => point.key === '2026-09-20')?.average).toBeNull();
    expect(report.points.find((point) => point.key === '2026-09-23')?.state).toBe('today');
    expect(report.points.every((point) => point.key <= '2026-09-23')).toBe(true);
  });
  test('logged zero remains zero, and no entries remains empty', () => {
    const zero = entry('2026-09-21', 0, { nutrients: { carbsGrams: 0, proteinGrams: 0, fatGrams: 0, fiberGrams: 0 } });
    const report = buildNutritionReport([zero], [], [], 'week', 0, now);
    const day = report.points.find((point) => point.key === zero.eventDate)!;
    expect(day.average?.calories).toBe(0);
    expect(reportValue(day.average, 'protein', 'percent')).toBeNull();
    expect(buildNutritionReport([], [], [], 'all', 0, now).summary.average).toBeNull();
  });
  test('365-day summary weights logged days, not empty dates or bucket averages', () => {
    const report = buildNutritionReport([entry('2026-01-02', 1000), entry('2026-02-02', 2000), entry('2026-02-03', 3000)], [], [], 'year', 0, now);
    expect(report.summary.average?.calories).toBe(2000);
    expect(report.points.length).toBeLessThanOrEqual(13);
    expect(report.points.some((point) => point.loggedDays === 0 && point.average === null)).toBe(true);
  });
  test('dated goals and route estimates follow the actual dates in the window', () => {
    const entries = [entry('2026-09-21', 1000), entry('2026-09-22', 1200)];
    const goals = [goal('2026-01-01', 100), goal('2026-09-22', 200)];
    const routes = [{ id: 'r1', kind: 'route' as const, startedAt: '2026-09-21T15:00:00', endedAt: '2026-09-21T16:00:00', pausedMs: 0, distanceMeters: 1609.344, points: [], estimatedCalories: 90 }];
    const base = buildNutritionReport(entries, goals, [], 'week', 0, now, routes, false);
    const adjusted = buildNutritionReport(entries, goals, [], 'week', 0, now, routes, true);
    expect(base.points.find((point) => point.key === '2026-09-21')?.goals?.carbsGrams).toBe(100);
    expect(base.points.find((point) => point.key === '2026-09-22')?.goals?.carbsGrams).toBe(200);
    expect(adjusted.points.find((point) => point.key === '2026-09-21')!.goals!.calories - base.points.find((point) => point.key === '2026-09-21')!.goals!.calories).toBe(90);
    expect(adjusted.summary.average).toEqual(base.summary.average);
  });
  test('macro share uses macro energy, not printed calories', () => {
    const report = buildNutritionReport([entry('2026-09-21', 678, { nutrients: { carbsGrams: 100, proteinGrams: 0, fatGrams: 0, fiberGrams: 22 } }), entry('2026-09-22', 100, { nutrients: { carbsGrams: 0, proteinGrams: 25, fatGrams: 0, fiberGrams: 1 } })], [], [], 'week', 0, now);
    expect(macroShare(report.summary.average, 'carbs')).toBe(80);
  });
});
