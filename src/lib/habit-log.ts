import { upsertHistoricalEntry } from '@/lib/history';
import { HistoricalEntry, Tracker, TrackerState } from '@/models/tracker';

export function todayHabitCount(entries: HistoricalEntry[], trackerId: string, date: string) {
  const entry = entries.find((item) => item.trackerId === trackerId && item.eventDate === date);
  return entry?.outcome === 'stayed_on_plan' ? entry.value ?? 1 : 0;
}

export function logHabitCompletion(state: TrackerState, trackerId: string, date: string, recordedAt = new Date().toISOString()) {
  const tracker = state.trackers.find((item) => item.id === trackerId && item.mode === 'habit' && !item.habitTemplate && !item.archived);
  if (!tracker) return state;
  const entry = (state.historicalEntries ?? []).find((item) => item.trackerId === trackerId && item.eventDate === date);
  const count = todayHabitCount(state.historicalEntries ?? [], trackerId, date);
  return upsertHistoricalEntry(state, { id: entry?.id, trackerId, eventDate: date, outcome: 'stayed_on_plan', value: count + 1, note: entry?.note }, recordedAt);
}

export function habitCanLogToday(tracker: Tracker, _entries: HistoricalEntry[], _date: string) {
  return tracker.mode === 'habit' && !tracker.habitTemplate && !tracker.archived;
}
