import { HistoricalEntry, Tracker } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';

export const HABIT_MILESTONES = [
  { days: 1, label: '1 Day', subtitle: 'The First Step' },
  { days: 7, label: '1 Week', subtitle: 'Getting Started' },
  { days: 30, label: '1 Month', subtitle: 'Building Momentum' },
  { days: 90, label: '3 Months', subtitle: 'Establishing Change' },
  { days: 180, label: '6 Months', subtitle: 'Stronger Every Day' },
  { days: 365, label: '1 Year', subtitle: 'A New You' },
] as const;

export type HabitMilestone = { days: (typeof HABIT_MILESTONES)[number]['days']; dates: string[] };

function parseDay(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(key: string, days: number) {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function daysBetween(first: string, last: string) {
  return Math.round((Date.UTC(...dateParts(last)) - Date.UTC(...dateParts(first))) / 86_400_000);
}

function dateParts(key: string): [number, number, number] {
  const [year, month, day] = key.split('-').map(Number);
  return [year, month - 1, day];
}

function periodEnd(start: string, period: 'day' | 'week' | 'month') {
  if (period === 'day') return start;
  const date = parseDay(start);
  if (period === 'week') date.setDate(date.getDate() + 6);
  else date.setMonth(date.getMonth() + 1, 0);
  return localDateKey(date);
}

function nextPeriod(start: string, period: 'day' | 'week' | 'month') {
  if (period !== 'month') return addDays(start, period === 'week' ? 7 : 1);
  const date = parseDay(start);
  date.setMonth(date.getMonth() + 1, 1);
  return localDateKey(date);
}

function firstPeriodStart(start: string, period: 'day' | 'week' | 'month') {
  const date = parseDay(start);
  if (period === 'week') date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  if (period === 'month') date.setDate(1);
  return localDateKey(date);
}

/** Historical awards are derived, so editing or backfilling an outcome recalculates them. */
export function habitMilestones(
  tracker: Tracker,
  entries: HistoricalEntry[],
  startedAt = tracker.startedAt,
  now = new Date(),
): HabitMilestone[] {
  const awards = HABIT_MILESTONES.map(({ days }) => ({ days, dates: [] as string[] }));
  if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) return awards;
  const start = localDateKey(new Date(startedAt));
  const today = localDateKey(now);
  if (start > today) return awards;
  const byDate = new Map(entries.filter((entry) => entry.eventDate >= start && entry.eventDate <= today)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((entry) => [entry.eventDate, entry]));

  if (tracker.mode !== 'habit') {
    let runStart = start;
    for (let date = addDays(start, 1); date <= today; date = addDays(date, 1)) {
      if (byDate.get(addDays(date, -1))?.outcome === 'lapse'
        || byDate.get(addDays(date, -1))?.outcome === 'partial'
        || byDate.get(addDays(date, -1))?.outcome === 'no_data') runStart = date;
      const outcome = byDate.get(date)?.outcome;
      if (outcome === 'lapse' || outcome === 'partial' || outcome === 'no_data') continue;
      const elapsed = daysBetween(runStart, date);
      awards.forEach((award) => {
        if (award.days === 1 ? elapsed === 1 : elapsed > 0 && elapsed % award.days === 0) award.dates.push(date);
      });
    }
    return awards;
  }

  const frequency = tracker.frequencyPeriod ?? 'day';
  const goal = tracker.frequencyCount ?? 1;
  let runDays = 0;
  for (let period = firstPeriodStart(start, frequency); period <= today; period = nextPeriod(period, frequency)) {
    const end = periodEnd(period, frequency);
    if (end > today) break; // A week or month is not earned before it finishes.
    const completed = [...byDate.values()]
      .filter((entry) => entry.eventDate >= period && entry.eventDate <= end && entry.outcome === 'stayed_on_plan')
      .reduce((sum, entry) => sum + (entry.value ?? 1), 0);
    if (completed < goal) { runDays = 0; continue; }
    const previous = runDays;
    runDays += daysBetween(period, addDays(end, 1));
    awards.forEach((award) => {
      if (award.days === 1) {
        if (previous === 0) award.dates.push(end);
        return;
      }
      for (let threshold = (Math.floor(previous / award.days) + 1) * award.days; threshold <= runDays; threshold += award.days) award.dates.push(end);
    });
  }
  return awards;
}
