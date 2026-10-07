import { HistoricalEntry, Tracker } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';
import { RecoveryPoint } from '@/lib/recovery';

export function habitCompletionSeries(
  startedAt: string,
  entries: HistoricalEntry[],
  through = new Date(),
): RecoveryPoint[] {
  const start = new Date(startedAt);
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const end = new Date(through.getFullYear(), through.getMonth(), through.getDate());
  const byDate = new Map(entries.map((entry) => [entry.eventDate, entry]));
  const points: RecoveryPoint[] = [];
  let cumulative = 0;
  while (cursor <= end) {
    const date = localDateKey(cursor);
    const entry = byDate.get(date);
    const amount = entry?.outcome === 'stayed_on_plan' ? entry.value ?? 1 : 0;
    cumulative += amount;
    points.push({ date, cumulative, successful: amount > 0, outcome: entry?.outcome ?? 'no_data' });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

export function habitPeriodProgress(tracker: Tracker, entries: HistoricalEntry[], today = new Date()) {
  const period = tracker.frequencyPeriod ?? 'day';
  const start = periodStart(today, period);
  const amount = entries
    .filter((entry) => new Date(`${entry.eventDate}T00:00:00`) >= start && new Date(`${entry.eventDate}T00:00:00`) <= today)
    .reduce((sum, entry) => sum + (entry.outcome === 'stayed_on_plan' ? entry.value ?? 1 : 0), 0);
  return { amount, goal: tracker.frequencyCount ?? 1, period };
}

export function habitConsistencyStreak(tracker: Tracker, entries: HistoricalEntry[], today = new Date()) {
  const period = tracker.frequencyPeriod ?? 'day';
  const goal = tracker.frequencyCount ?? 1;
  let cursor = periodStart(today, period);
  let streak = 0;
  for (let i = 0; i < 366; i += 1) {
    const next = nextPeriod(cursor, period);
    const count = entries.filter((entry) => {
      const date = new Date(`${entry.eventDate}T00:00:00`);
      return date >= cursor && date < next && entry.outcome === 'stayed_on_plan';
    }).reduce((sum, entry) => sum + (entry.value ?? 1), 0);
    if (count < goal) break;
    streak += 1;
    cursor = previousPeriod(cursor, period);
  }
  return streak;
}

function periodStart(date: Date, period: 'day' | 'week' | 'month') {
  if (period === 'month') return new Date(date.getFullYear(), date.getMonth(), 1);
  if (period === 'week') {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextPeriod(date: Date, period: 'day' | 'week' | 'month') {
  const next = new Date(date);
  if (period === 'month') next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + (period === 'week' ? 7 : 1));
  return next;
}

function previousPeriod(date: Date, period: 'day' | 'week' | 'month') {
  const previous = new Date(date);
  if (period === 'month') previous.setMonth(previous.getMonth() - 1);
  else previous.setDate(previous.getDate() - (period === 'week' ? 7 : 1));
  return previous;
}
