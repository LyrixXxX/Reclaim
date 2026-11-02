import { ActivityRoute, NutritionEntry, NutritionGoalProfile, NutritionMealGroup, NutritionNutrients, WorkoutSession } from '@/models/tracker';
import { exerciseCaloriesForDate } from './workouts';
import { goalForDate, metricValue, NutritionMetric, nutritionCalorieTarget, nutritionEntryCalories, nutritionTotals } from './nutrition';
import { rollingBounds } from './rolling-range';

export type ReportRange = 'week' | 'month' | 'year' | 'all';
export type MacroMode = 'grams' | 'percent';
export type ReportTotals = NutritionNutrients & { calories: number };
export type ReportSummary = { loggedDays: number; elapsedDays: number; average: ReportTotals | null; goals: ReportTotals | null };
export type ReportPoint = ReportSummary & { key: string; label: string; detail: string; state: 'logged' | 'missing' | 'today' | 'future'; meals: Record<string, number> };
export const macroColors = { carbs: '#41B8E8', protein: '#A987F4', fat: '#F2A64A', fiber: '#6FD39A' };
const zero = (): ReportTotals => ({ calories: 0, carbsGrams: 0, proteinGrams: 0, fatGrams: 0, fiberGrams: 0 });
export function reportDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function dateFromKey(key: string) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function addDay(date: Date, count: number) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12); }

export function reportPeriod(range: ReportRange, offset: number, now: Date, firstDate?: string) {
  const bounds = rollingBounds(range === 'week' ? '7D' : range === 'month' ? '30D' : range === 'year' ? '365D' : 'ALL', offset, now);
  const start = dateFromKey(range === 'all' ? firstDate && firstDate <= bounds.end ? firstDate : bounds.end : bounds.start);
  const end = dateFromKey(bounds.end);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDay(date, 1)) dates.push(reportDateKey(date));
  const label = `${range === 'all' ? 'All history · ' : ''}${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return { dates, label, start, end };
}

function sum(values: ReportTotals[]) { return values.reduce((a, b) => ({ calories: a.calories + b.calories, carbsGrams: a.carbsGrams + b.carbsGrams, proteinGrams: a.proteinGrams + b.proteinGrams, fatGrams: a.fatGrams + b.fatGrams, fiberGrams: a.fiberGrams + b.fiberGrams }), zero()); }
function average(values: ReportTotals[]): ReportTotals | null {
  if (!values.length) return null;
  const total = sum(values);
  return { calories: total.calories / values.length, carbsGrams: total.carbsGrams / values.length, proteinGrams: total.proteinGrams / values.length, fatGrams: total.fatGrams / values.length, fiberGrams: total.fiberGrams / values.length };
}
function goalTotals(goal: NutritionGoalProfile): ReportTotals { return { ...goal, calories: nutritionCalorieTarget(goal) }; }

export function macroShare(totals: NutritionNutrients | null, metric: 'carbs' | 'protein' | 'fat') {
  if (!totals) return null;
  const denominator = totals.carbsGrams * 4 + totals.proteinGrams * 4 + totals.fatGrams * 9;
  if (!denominator) return null;
  return (metric === 'carbs' ? totals.carbsGrams * 4 : metric === 'protein' ? totals.proteinGrams * 4 : totals.fatGrams * 9) / denominator * 100;
}
export function reportValue(totals: ReportTotals | null, metric: NutritionMetric, mode: MacroMode = 'grams') {
  if (!totals) return null;
  if (mode === 'percent' && metric !== 'calories' && metric !== 'fiber') return macroShare(totals, metric);
  return metricValue({ ...totals, entryCount: 0 }, metric);
}

export function buildNutritionReport(entries: NutritionEntry[], goals: NutritionGoalProfile[], groups: NutritionMealGroup[], range: ReportRange, offset: number, now = new Date(), routes: ActivityRoute[] = [], includeRoutes = false, workouts: WorkoutSession[] = [], includeWorkouts = false) {
  const today = reportDateKey(now);
  const firstDate = [...entries].sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0]?.eventDate;
  const period = reportPeriod(range, offset, now, firstDate);
  const previousPeriod = range === 'all' ? period : reportPeriod(range, Math.min(0, offset) - 1, now, firstDate);
  const byDate = new Map<string, NutritionEntry[]>();
  for (const entry of entries) byDate.set(entry.eventDate, [...(byDate.get(entry.eventDate) ?? []), entry]);
  const summarize = (dates: string[], includeToday = false): ReportSummary => {
    const eligible = dates.filter((key) => key < today || (includeToday && key === today));
    const logged = eligible.filter((key) => byDate.has(key));
    return { loggedDays: logged.length, elapsedDays: eligible.length, average: average(logged.map((key) => nutritionTotals(byDate.get(key)!))), goals: average(logged.flatMap((key) => { const goal = goalForDate(goals, key); return goal ? [{ ...goalTotals(goal), calories: goalTotals(goal).calories + exerciseCaloriesForDate(routes, workouts, key, includeRoutes, includeWorkouts).total }] : []; })) };
  };
  const summary = summarize(period.dates);
  const previousDates = range === 'all' ? [] : offset === 0 ? previousPeriod.dates.slice(0, summary.elapsedDays) : previousPeriod.dates;
  const previous = summarize(previousDates);
  const bucketSize = range === 'year' ? 30 : range === 'all' ? Math.max(1, Math.ceil(period.dates.length / 12)) : 1;
  const buckets = bucketSize === 1 ? period.dates.map((key) => [key]) : Array.from({ length: Math.ceil(period.dates.length / bucketSize) }, (_, index) => period.dates.slice(index * bucketSize, (index + 1) * bucketSize));
  const points: ReportPoint[] = buckets.map((dates) => {
    // Plot live intake, but keep the report summaries/comparisons completed-day only.
    const summary = summarize(dates, true);
    const date = dateFromKey(dates[0]);
    const eligible = dates.filter((key) => key <= today);
    const meals: Record<string, number> = {};
    for (const key of eligible) for (const entry of byDate.get(key) ?? []) meals[entry.mealGroupId] = (meals[entry.mealGroupId] ?? 0) + nutritionEntryCalories(entry) / summary.loggedDays;
    const dayGoal = dates[0] <= today ? goalForDate(goals, dates[0]) : undefined;
    return { ...summary, goals: bucketSize > 1 ? summary.goals : dayGoal ? { ...goalTotals(dayGoal), calories: goalTotals(dayGoal).calories + exerciseCaloriesForDate(routes, workouts, dates[0], includeRoutes, includeWorkouts).total } : null,
      key: dates[0], label: bucketSize > 1 ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : range === 'week' ? `${date.toLocaleDateString(undefined, { weekday: 'short' })}\n${date.getMonth() + 1}/${date.getDate()}` : `${date.getMonth() + 1}/${date.getDate()}`,
      detail: dates.length > 1 ? `${dates[0]} – ${dates.at(-1)}` : date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }),
      state: dates.includes(today) ? 'today' : summary.loggedDays ? 'logged' : eligible.length ? 'missing' : 'future', meals };
  });
  const usedIds = new Set(points.flatMap((point) => Object.keys(point.meals)));
  const mealGroups = [...usedIds].map((id) => ({ id, name: groups.find((g) => g.id === id)?.name ?? entries.find((e) => e.mealGroupId === id)?.mealLabel ?? 'Meal', color: mealColor(id) })).sort((a, b) => (groups.find((g) => g.id === a.id)?.sortOrder ?? 999) - (groups.find((g) => g.id === b.id)?.sortOrder ?? 999) || a.id.localeCompare(b.id));
  const todayGoal = goalForDate(goals, today);
  return { ...period, points, summary, previous, previousLabel: previousDates.length ? `${previousDates[0]} – ${previousDates.at(-1)}` : 'No elapsed comparison days', mealGroups, today: nutritionTotals(byDate.get(today) ?? []), todayGoal: todayGoal ? { ...todayGoal, calorieBudget: goalTotals(todayGoal).calories + exerciseCaloriesForDate(routes, workouts, today, includeRoutes, includeWorkouts).total } : undefined, isCurrent: offset === 0 };
}

export function mealColor(id: string) {
  const standard: Record<string, string> = { 'meal-breakfast': '#92AEFF', 'meal-lunch': '#F47F87', 'meal-dinner': '#F2B766', 'meal-snack': '#63D8B0' };
  if (standard[id]) return standard[id];
  const hash = [...id].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 0);
  return ['#80CADB', '#C49DEC', '#EBA8C1', '#B7CB82', '#DAAE82', '#98BCBB'][hash % 6];
}

export function reportLabelIndices(count: number, range: ReportRange) {
  if (range !== 'month' && range !== 'year' && range !== 'all') return Array.from({ length: count }, (_, i) => i);
  return Array.from({ length: Math.min(6, count) }, (_, i) => Math.round(i * (count - 1) / (Math.min(6, count) - 1 || 1)));
}
export function reportChartMaximum(values: (number | null)[]) {
  const max = Math.max(1, ...values.filter((value): value is number => value !== null));
  const step = 10 ** Math.floor(Math.log10(max)) / 2;
  return Math.ceil(max * 1.18 / step) * step;
}
export const reportNumber = (value: number | null, decimals = 1) => value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: decimals });
export function reportPlotLayout(width: number, count: number) {
  return { left: 39, right: 8, slot: Math.max(1, width - 47) / Math.max(1, count) };
}
export function reportValueLabel(value: number) {
  return value >= 10000 ? `${reportNumber(value / 1000, 0)}k` : String(Math.round(value));
}
