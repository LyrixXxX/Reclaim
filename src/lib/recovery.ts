import { HistoricalEntry, LapseEvent, TrackerId, TrackerState } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';

export type RecoveryPoint = {
  date: string;
  cumulative: number;
  successful: boolean;
  outcome?: HistoricalEntry['outcome'] | 'inferred';
};

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key: string, days: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function recoverySeries(
  startedAt: string,
  lapses: Pick<LapseEvent, 'date'>[],
  through = new Date(),
): RecoveryPoint[] {
  const startKey = localDateKey(new Date(startedAt));
  const endKey = localDateKey(through);
  if (startKey > endKey) return [];

  const lapseDates = new Set(lapses.map((lapse) => lapse.date));
  const points: RecoveryPoint[] = [];
  let cumulative = 0;
  let cursor = startKey;

  while (cursor <= endKey) {
    const successful = !lapseDates.has(cursor);
    if (successful) cumulative += 1;
    points.push({ date: cursor, cumulative, successful });
    cursor = addDays(cursor, 1);
  }
  return points;
}

export function recoverySeriesFromEntries(
  startedAt: string,
  entries: Pick<HistoricalEntry, 'eventDate' | 'outcome'>[],
  through = new Date(),
): RecoveryPoint[] {
  const startKey = localDateKey(new Date(startedAt));
  const endKey = localDateKey(through);
  if (startKey > endKey) return [];

  const byDate = new Map(entries.map((entry) => [entry.eventDate, entry.outcome]));
  const points: RecoveryPoint[] = [];
  let cumulative = 0;
  let cursor = startKey;

  while (cursor <= endKey) {
    const outcome = byDate.get(cursor) ?? 'inferred';
    const successful = outcome === 'inferred'
      || outcome === 'stayed_on_plan'
      || outcome === 'note_only';
    if (successful) cumulative += 1;
    points.push({ date: cursor, cumulative, successful, outcome });
    cursor = addDays(cursor, 1);
  }
  return points;
}

export function currentStreakFromEntries(
  startedAt: string,
  entries: Pick<HistoricalEntry, 'eventDate' | 'outcome'>[],
  now = new Date(),
) {
  return currentStreakStartedAt(
    startedAt,
    entries
      .filter((entry) => entry.outcome === 'lapse')
      .map((entry) => ({ date: entry.eventDate })),
    now,
  );
}

export function recoveryStats(points: RecoveryPoint[]) {
  const totalTrackedDays = points.length;
  const successfulDays = points.at(-1)?.cumulative ?? 0;
  return {
    totalTrackedDays,
    successfulDays,
    successPercentage: totalTrackedDays === 0
      ? 0
      : Math.round((successfulDays / totalTrackedDays) * 100),
  };
}

export function currentStreakStartedAt(
  startedAt: string,
  lapses: Pick<LapseEvent, 'date'>[],
  now = new Date(),
) {
  const valid = lapses
    .map((lapse) => lapse.date)
    .filter((date) => date >= localDateKey(new Date(startedAt)) && date <= localDateKey(now))
    .sort();
  const latest = valid.at(-1);
  if (!latest) return startedAt;

  const nextDay = dateFromKey(addDays(latest, 1));
  return nextDay.getTime() > now.getTime() ? now.toISOString() : nextDay.toISOString();
}

export function filterRecoveryRange(
  points: RecoveryPoint[],
  range: '7D' | '30D' | '90D' | 'ALL',
) {
  if (range === 'ALL') return points;
  const days = Number.parseInt(range, 10);
  return points.slice(-days);
}

export function deleteTrackerHistory(
  state: TrackerState,
  trackerId: TrackerId,
  confirmed: boolean,
): TrackerState {
  if (!confirmed) return state;
  const preserveTaper = state.trackers.find((tracker) => tracker.id === trackerId)?.mode === 'reduction';
  return {
    ...state,
    trackers: state.trackers.map((tracker) =>
      tracker.id === trackerId && !preserveTaper ? { ...tracker, startedAt: undefined } : tracker),
    lapseEvents: (state.lapseEvents ?? []).filter((event) => event.trackerId !== trackerId),
    historicalEntries: (state.historicalEntries ?? []).filter(
      (entry) => entry.trackerId !== trackerId,
    ),
    taperSteps: preserveTaper
      ? state.taperSteps
      : (state.taperSteps ?? []).filter((step) => step.trackerId !== trackerId),
  };
}
