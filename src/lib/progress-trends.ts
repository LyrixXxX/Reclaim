import { StepDay, TrackerState } from '@/models/tracker';
import { goalForDate as stepGoalForDate } from './activity-step-history';
import { goalForDate as nutritionGoalForDate, nutritionCalorieTarget, nutritionTotals } from './nutrition';
import { exerciseCaloriesForDate } from './workouts';
import { DEFAULT_PREFERENCES } from './preferences';
import { localDateKey } from './progress';
import { habitProgress, routeMinutesOn, templateConfig } from './good-habit-templates';
import { waterDisplayAmount, waterGoalOn, waterTotalOn } from './water-habit';
import { nutritionGoalReached } from './home-overview';

/** One day of one goal. A null value means nothing to show for that day (not tracked yet, or no data). */
export type TrendDay = { date: string; value: number | null; goal: number | null; reached: boolean | null; /** Extra detail for the day, such as where walking minutes came from. */ parts?: string[] };
export type TrendSeries = { id: string; title: string; kind: 'steps' | 'nutrition' | 'water' | 'habit'; unit: string; href: string; days: TrendDay[] };
export type TrendSummaryDay = { date: string; reached: number; total: number };
export type TrendStats = { hitDays: number; countedDays: number; average: number | null };

export type TrendInputs = {
  /** Daily step totals from the phone. */
  stepDays: readonly Pick<StepDay, 'date' | 'count'>[];
  /** Phone walking minutes outside routes, by date, for the Walk habit. */
  phoneMinutesByDate?: Record<string, number>;
  today: string;
  days: number;
};

/** The last `count` dates ending today, oldest first. */
export function trendDates(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - (count - 1 - index));
    return localDateKey(date);
  });
}

/**
 * The same daily goals as Today's progress on Home, day by day. Each day is judged against the goal
 * that was set on that day, so changing a goal never rewrites history.
 */
export function progressTrends(state: TrackerState, { stepDays, phoneMinutesByDate = {}, today, days }: TrendInputs): TrendSeries[] {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const dates = trendDates(today, days);
  const series: TrendSeries[] = [];

  if (preferences.visibleSections.activity && stepGoalForDate(state.stepGoals ?? [], today)) {
    const counts = new Map(stepDays.map((day) => [day.date, day.count]));
    series.push({ id: 'steps', title: 'Steps', kind: 'steps', unit: 'steps', href: '/activity', days: dates.map((date) => {
      const goal = stepGoalForDate(state.stepGoals ?? [], date) || null;
      const value = counts.get(date) ?? null;
      return { date, value, goal, reached: value === null || goal === null ? null : value >= goal };
    }) });
  }

  const nutritionGoals = state.nutritionGoals ?? [];
  if (preferences.visibleSections.nutrition && nutritionGoals.some((goal) => goal.effectiveDate <= today)) {
    series.push({ id: 'nutrition', title: 'Nutrition', kind: 'nutrition', unit: 'kcal', href: '/nutrition', days: dates.map((date) => {
      if (!nutritionGoals.some((goal) => goal.effectiveDate <= date)) return { date, value: null, goal: null, reached: null };
      const totals = nutritionTotals(state.nutritionEntries ?? [], date);
      const goal = nutritionCalorieTarget(nutritionGoalForDate(nutritionGoals, date)) + exerciseCaloriesForDate(state.activityRoutes ?? [], state.workoutSessions ?? [], date, preferences.includeRouteCaloriesInNutrition ?? false, preferences.includeWorkoutCaloriesInNutrition ?? false).total;
      if (!totals.entryCount) return { date, value: null, goal, reached: null };
      return { date, value: totals.calories, goal, reached: nutritionGoalReached(totals.calories, goal, totals.entryCount), parts: [`${totals.entryCount} ${totals.entryCount === 1 ? 'food' : 'foods'} logged`] };
    }) });
  }

  const hidden = new Set(preferences.hiddenHomeHabitIds ?? []);
  for (const tracker of state.trackers) {
    if (tracker.archived || !tracker.habitTemplate || tracker.habitTemplate === 'mindfulness' || hidden.has(tracker.id)) continue;
    const config = templateConfig(tracker.habitTemplate);
    if (tracker.habitTemplate !== 'water' && (!config || config.period === 'week')) continue;
    const started = tracker.startedAt ? localDateKey(new Date(tracker.startedAt)) : dates[0];
    const title = tracker.displayName || tracker.name;
    const href = `/tracker/${encodeURIComponent(tracker.id)}`;
    if (tracker.habitTemplate === 'water') {
      if (!waterGoalOn(tracker, today)) continue;
      series.push({ id: tracker.id, title, kind: 'water', unit: tracker.waterDisplayUnit ?? 'fl oz', href, days: dates.map((date) => {
        const goal = waterGoalOn(tracker, date);
        if (date < started || goal === null) return { date, value: null, goal, reached: null };
        const value = waterTotalOn(state.waterLogs ?? [], tracker.id, date);
        return { date, value, goal, reached: value >= goal };
      }) });
      continue;
    }
    const todayProgress = habitProgress(tracker, state.goodHabitLogs ?? [], state.activityRoutes ?? [], new Date(`${today}T12:00:00`));
    if (!todayProgress.goal) continue;
    series.push({ id: tracker.id, title, kind: 'habit', unit: config!.checklist ? 'done' : config!.unit ?? 'minutes', href, days: dates.map((date) => {
      if (date < started) return { date, value: null, goal: null, reached: null };
      const progress = habitProgress(tracker, state.goodHabitLogs ?? [], state.activityRoutes ?? [], new Date(`${date}T12:00:00`), tracker.habitTemplate === 'walk' ? phoneMinutesByDate[date] ?? 0 : 0);
      if (!progress.goal) return { date, value: null, goal: null, reached: null };
      const parts = tracker.habitTemplate === 'walk' ? [
        `Phone ${minutes(phoneMinutesByDate[date] ?? 0)}`,
        `Routes ${minutes(routeMinutesOn(state.activityRoutes ?? [], tracker, date))}`,
        `Logged ${minutes((state.goodHabitLogs ?? []).filter((log) => log.trackerId === tracker.id && log.eventDate === date).reduce((sum, log) => sum + log.amount, 0))}`,
      ] : undefined;
      return { date, value: progress.amount, goal: progress.goal, reached: progress.amount >= progress.goal, parts };
    }) });
  }
  return series;
}

/** Goals hit per day across every series. Days with no judged goals are left out of the totals. */
export function trendSummary(series: readonly TrendSeries[]): TrendSummaryDay[] {
  const dates = series[0]?.days.map((day) => day.date) ?? [];
  return dates.map((date, index) => {
    const judged = series.map((item) => item.days[index]).filter((day) => day.reached !== null);
    return { date, reached: judged.filter((day) => day.reached).length, total: judged.length };
  });
}

/** Today only counts once its goal is hit, so an unfinished day isn't a miss. */
export function trendStats(days: readonly TrendDay[], today?: string): TrendStats {
  const judged = days.filter((day) => day.reached !== null && !(day.date === today && !day.reached));
  const values = days.map((day) => day.value).filter((value): value is number => value !== null);
  return { hitDays: judged.filter((day) => day.reached).length, countedDays: judged.length, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}

/** Days in a row, ending today or yesterday, where every judged goal was hit. Today doesn't break it while it's unfinished. */
export function allGoalsStreak(summary: readonly TrendSummaryDay[]): number {
  let streak = 0;
  for (let index = summary.length - 1; index >= 0; index -= 1) {
    const day = summary[index];
    const complete = day.total > 0 && day.reached === day.total;
    if (index === summary.length - 1 && !complete) continue;
    if (!complete) break;
    streak += 1;
  }
  return streak;
}

const minutes = (value: number) => `${Number(value.toFixed(1))} min`;

/** The number alone, rounded the way the item is shown. */
export function formatTrendAmount(value: number, item: Pick<TrendSeries, 'kind' | 'unit'>): string {
  if (item.kind === 'water') return waterDisplayAmount(Math.round(value * 10) / 10, item.unit as 'fl oz' | 'mL');
  if (item.kind === 'habit' && item.unit !== 'done') return Number(value.toFixed(1)).toLocaleString();
  return Math.round(value).toLocaleString();
}

export function formatTrendValue(value: number, item: Pick<TrendSeries, 'kind' | 'unit'>): string {
  return `${formatTrendAmount(value, item)} ${item.unit}`;
}

export type TrendDayDetail = { heading: string; line: string; status: 'hit' | 'missed' | 'so-far' | 'empty'; parts: string[] };

/** What the detail card says for one tapped day. */
export function trendDayDetail(item: TrendSeries, day: TrendDay, today: string): TrendDayDetail {
  const heading = new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const parts = day.parts ?? [];
  if (day.goal === null) return { heading, line: 'Not tracked yet on this day', status: 'empty', parts };
  if (day.value === null) return { heading, line: `Nothing logged · goal ${formatTrendValue(day.goal, item)}`, status: 'empty', parts };
  const ofGoal = `${formatTrendAmount(day.value, item)} of ${formatTrendValue(day.goal, item)}`;
  const difference = Math.abs(day.value - day.goal);
  if (item.kind === 'nutrition') {
    const side = day.value > day.goal ? 'over' : 'under';
    const gap = difference < 0.5 ? 'On budget' : `${formatTrendValue(difference, item)} ${side}`;
    return { heading, line: `${ofGoal} · ${gap}${day.reached ? ' · goal met' : ''}`, status: day.reached ? 'hit' : day.date === today ? 'so-far' : 'missed', parts };
  }
  if (day.reached) return { heading, line: `${ofGoal} · Goal hit${difference > 0 ? ` · ${formatTrendAmount(difference, item)} over` : ''}`, status: 'hit', parts };
  return { heading, line: `${ofGoal} · ${formatTrendAmount(difference, item)} ${day.date === today ? 'to go' : 'short'}`, status: day.date === today ? 'so-far' : 'missed', parts };
}
