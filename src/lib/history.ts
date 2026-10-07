import { DayOutcome, HistoricalEntry, TrackerId, TrackerState } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';

export type HistoricalEntryInput = {
  id?: string;
  trackerId: TrackerId;
  eventDate: string;
  outcome: DayOutcome;
  note?: string;
  value?: number;
};

export function upsertHistoricalEntry(
  state: TrackerState,
  input: HistoricalEntryInput,
  recordedAt = new Date().toISOString(),
): TrackerState {
  const existing = (state.historicalEntries ?? []).find(
    (entry) => entry.id === input.id
      || (entry.trackerId === input.trackerId && entry.eventDate === input.eventDate),
  );
  const entry: HistoricalEntry = {
    id: existing?.id ?? `${input.trackerId}-${input.eventDate}-${recordedAt}`,
    trackerId: input.trackerId,
    eventDate: input.eventDate,
    recordedAt,
    outcome: input.outcome,
    note: input.note?.trim() || undefined,
    value: input.value ?? existing?.value,
  };
  return {
    ...state,
    historicalEntries: [
      ...(state.historicalEntries ?? []).filter((item) => item.id !== existing?.id),
      entry,
    ],
  };
}

export function removeHistoricalEntry(state: TrackerState, entryId: string) {
  return {
    ...state,
    historicalEntries: (state.historicalEntries ?? []).filter((entry) => entry.id !== entryId),
  };
}

export function dailyCheckInStreak(checkIns: string[], today = new Date()) {
  const dates = new Set(checkIns);
  let streak = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function historyCompleteness(
  startedAt: string | undefined,
  entries: HistoricalEntry[],
  today = new Date(),
) {
  if (!startedAt) return 0;
  const start = new Date(startedAt);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const total = Math.max(1, Math.floor((todayDay.getTime() - startDay.getTime()) / 86_400_000) + 1);
  const explicitDates = new Set(entries.map((entry) => entry.eventDate)).size;
  return Math.min(100, Math.round((explicitDates / total) * 100));
}

export function isBackfilled(entry: HistoricalEntry) {
  return localDateKey(new Date(entry.recordedAt)) > entry.eventDate;
}

export function outcomeLabel(outcome: DayOutcome) {
  return {
    stayed_on_plan: 'Stayed on plan',
    lapse: 'Lapse',
    partial: 'Partial reduction / exceeded target',
    no_data: 'No data / unsure',
    note_only: 'Note only',
  }[outcome];
}
