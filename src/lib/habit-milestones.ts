import { ActivityRoute, GoodHabitLog, HistoricalEntry, Tracker, WaterLog } from '@/models/tracker';
import { activeWalkMinutes, checklistOn, creditedAmount, goalOn, habitDate, templateConfig } from '@/lib/good-habit-templates';
import { localDateKey } from '@/lib/progress';
import { waterGoalOn } from '@/lib/water-habit';

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

type Period = 'day' | 'week' | 'month';
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 };

export type MilestoneProgress = {
  awards: HabitMilestone[];
  /** Days in the current unbroken run. An unfinished day or week doesn't break it. */
  runDays: number;
  periodDays: number;
  /** There's a valid start date, so a run can be counted. */
  started: boolean;
  /** Good habits need a goal set before there's anything to earn. */
  canEarn?: boolean;
};

const emptyAwards = (): HabitMilestone[] => HABIT_MILESTONES.map(({ days }) => ({ days, dates: [] as string[] }));
const notStarted = (): MilestoneProgress => ({ awards: emptyAwards(), runDays: 0, periodDays: 1, started: false });

function goalRuns(start: string, today: string, frequency: Period, isMet: (period: string, end: string) => boolean): MilestoneProgress {
  const awards = emptyAwards();
  let runDays = 0;
  for (let period = firstPeriodStart(start, frequency); period <= today; period = nextPeriod(period, frequency)) {
    const end = periodEnd(period, frequency);
    if (end > today) break; // A week or month is not earned before it finishes.
    if (!isMet(period, end)) {
      if (end === today) break; // There's still time today, so the run isn't over.
      runDays = 0;
      continue;
    }
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
  return { awards, runDays, periodDays: PERIOD_DAYS[frequency], started: true };
}

/** Historical awards are derived, so editing or backfilling an outcome recalculates them. */
export function milestoneProgress(
  tracker: Tracker,
  entries: HistoricalEntry[],
  startedAt = tracker.startedAt,
  now = new Date(),
): MilestoneProgress {
  if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) return notStarted();
  const start = localDateKey(new Date(startedAt));
  const today = localDateKey(now);
  if (start > today) return notStarted();
  const byDate = new Map(entries.filter((entry) => entry.eventDate >= start && entry.eventDate <= today)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((entry) => [entry.eventDate, entry]));

  if (tracker.mode !== 'habit') {
    const awards = emptyAwards();
    const breaks = (date: string) => ['lapse', 'partial', 'no_data'].includes(byDate.get(date)?.outcome ?? '');
    let runStart = start;
    for (let date = addDays(start, 1); date <= today; date = addDays(date, 1)) {
      if (breaks(addDays(date, -1))) runStart = date;
      if (breaks(date)) continue;
      const elapsed = daysBetween(runStart, date);
      awards.forEach((award) => {
        if (award.days === 1 ? elapsed === 1 : elapsed > 0 && elapsed % award.days === 0) award.dates.push(date);
      });
    }
    return { awards, runDays: breaks(today) ? 0 : daysBetween(runStart, today), periodDays: 1, started: true };
  }

  const frequency = tracker.frequencyPeriod ?? 'day';
  const goal = tracker.frequencyCount ?? 1;
  return { ...goalRuns(start, today, frequency, (period, end) => [...byDate.values()]
    .filter((entry) => entry.eventDate >= period && entry.eventDate <= end && entry.outcome === 'stayed_on_plan')
    .reduce((sum, entry) => sum + (entry.value ?? 1), 0) >= goal), canEarn: true };
}

export function habitMilestones(tracker: Tracker, entries: HistoricalEntry[], startedAt = tracker.startedAt, now = new Date()): HabitMilestone[] {
  return milestoneProgress(tracker, entries, startedAt, now).awards;
}

/** Built-in habits keep their own logs, so a period counts when its goal was met in those logs. */
export function templateMilestoneProgress(
  tracker: Tracker,
  data: { goodHabitLogs: readonly GoodHabitLog[]; waterLogs: readonly WaterLog[]; routes: readonly ActivityRoute[]; phoneMinutesByDate?: Record<string, number> },
  now = new Date(),
): MilestoneProgress {
  if (!tracker.startedAt || Number.isNaN(new Date(tracker.startedAt).getTime())) return notStarted();
  const start = localDateKey(new Date(tracker.startedAt));
  const today = habitDate(tracker.habitTemplate, now);
  if (start > today) return notStarted();

  if (tracker.habitTemplate === 'water') {
    const totals = new Map<string, number>();
    for (const log of data.waterLogs) if (log.trackerId === tracker.id) totals.set(log.eventDate, (totals.get(log.eventDate) ?? 0) + log.ounces);
    return { ...goalRuns(start, today, 'day', (date) => {
      const goal = waterGoalOn(tracker, date);
      return Boolean(goal) && Math.round((totals.get(date) ?? 0) * 100) / 100 >= goal!;
    }), canEarn: Boolean(waterGoalOn(tracker, today)) };
  }

  const config = templateConfig(tracker.habitTemplate);
  if (!config) return notStarted();
  const logsByDate = new Map<string, GoodHabitLog[]>();
  for (const log of data.goodHabitLogs) {
    if (log.trackerId !== tracker.id) continue;
    const day = logsByDate.get(log.eventDate);
    if (day) day.push(log); else logsByDate.set(log.eventDate, [log]);
  }
  const walkMinutes = new Map<string, number>();
  if (config.id === 'walk') {
    for (const route of data.routes) {
      if (!['walk', 'hike', 'run'].includes(route.kind)) continue;
      const date = localDateKey(new Date(route.startedAt));
      walkMinutes.set(date, (walkMinutes.get(date) ?? 0) + activeWalkMinutes(route));
    }
  }
  const goalFor = (date: string) => config.checklist ? checklistOn(tracker, date).length : goalOn(tracker, date) ?? 0;
  const isMet = (period: string, end: string) => {
    const goal = goalFor(end);
    if (!goal) return false;
    if (config.checklist) {
      const logs = logsByDate.get(period) ?? [];
      return checklistOn(tracker, period).filter((item) => logs.some((log) => log.checklistItemId === item.id)).length >= goal;
    }
    const logs: GoodHabitLog[] = [];
    for (let date = period; date <= end; date = addDays(date, 1)) logs.push(...(logsByDate.get(date) ?? []));
    const extra = config.id === 'walk' ? (walkMinutes.get(period) ?? 0) + (data.phoneMinutesByDate?.[period] ?? 0) : 0;
    return creditedAmount(tracker, logs, period, end) + extra >= goal;
  };
  return { ...goalRuns(start, today, config.period, isMet), canEarn: goalFor(today) > 0 };
}
