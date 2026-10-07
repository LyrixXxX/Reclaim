import { ActivityRoute, StepDay, StepGoal } from '@/models/tracker';
import { activityDurationMs } from './activity';
import { goalForDate } from './activity-step-history';
import { localDateKey } from './progress';
import { RollingRange, datesInWindow, rollingBounds } from './rolling-range';

export function activityRange(days: readonly StepDay[], goals: readonly StepGoal[], range: RollingRange, offset: number, now: Date) {
  const bounds = rollingBounds(range, offset, now);
  const first = [...days].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? bounds.end;
  const dates = datesInWindow(range === 'ALL' ? first : bounds.start, bounds.end);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const size = range === '365D' ? 30 : range === 'ALL' ? Math.max(1, Math.ceil(dates.length / 12)) : 1;
  const slots = Array.from({ length: Math.ceil(dates.length / size) }, (_, index) => {
    const segment = dates.slice(index * size, (index + 1) * size);
    const recorded = segment.flatMap((key) => byDate.has(key) ? [byDate.get(key)!] : []);
    return { date: segment[0], label: new Date(`${segment[0]}T12:00:00`).toLocaleDateString(undefined, size === 1 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }), count: recorded.length ? Math.round(recorded.reduce((sum, day) => sum + day.count, 0) / recorded.length) : undefined, recorded };
  });
  const recorded = slots.flatMap((slot) => slot.recorded);
  const eligible = recorded.filter((day) => goalForDate(goals, day.date) > 0);
  return { slots, average: recorded.length ? Math.round(recorded.reduce((sum, day) => sum + day.count, 0) / recorded.length) : null, goalsReached: eligible.filter((day) => day.count >= goalForDate(goals, day.date)).length, goalDays: eligible.length, start: dates[0] ?? bounds.end, end: bounds.end, aggregation: size === 1 ? 'Daily steps' : 'Recorded-day average steps per date bucket' };
}

export function activityWeek(days: readonly StepDay[], goals: readonly StepGoal[], now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const today = localDateKey(now);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const slots = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    const day = key <= today ? byDate.get(key) : undefined;
    return { date: key, label: date.toLocaleDateString(undefined, { weekday: 'short' }), count: day?.count, goal: goalForDate(goals, key) };
  });
  const recorded = slots.filter((slot) => slot.count !== undefined);
  const eligible = recorded.filter((slot) => slot.goal > 0);
  return {
    slots,
    average: recorded.length ? Math.round(recorded.reduce((sum, slot) => sum + slot.count!, 0) / recorded.length) : null,
    goalsReached: eligible.filter((slot) => slot.count! >= slot.goal).length,
    goalDays: eligible.length,
  };
}

export function activityToday(routes: readonly ActivityRoute[], now: Date) {
  const today = localDateKey(now);
  const matches = routes.filter((route) => localDateKey(new Date(route.startedAt)) === today);
  const estimated = matches.filter((route) => route.estimatedCalories !== undefined);
  return {
    distanceMeters: matches.reduce((sum, route) => sum + route.distanceMeters, 0),
    activeMs: matches.reduce((sum, route) => sum + activityDurationMs(route), 0),
    estimatedCalories: estimated.length ? estimated.reduce((sum, route) => sum + route.estimatedCalories!, 0) : null,
  };
}
