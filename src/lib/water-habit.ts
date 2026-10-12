import { Tracker, TrackerState, WaterLog } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';

export type WaterUnit = 'fl oz' | 'mL';
export const MILLILITERS_PER_FLUID_OUNCE = 29.5735295625;

export function waterToOunces(amount: number, unit: WaterUnit) {
  return unit === 'mL' ? amount / MILLILITERS_PER_FLUID_OUNCE : amount;
}

export function waterDisplayAmount(ounces: number, unit: WaterUnit) {
  const value = unit === 'mL' ? ounces * MILLILITERS_PER_FLUID_OUNCE : ounces;
  return unit === 'mL' ? Math.round(value).toString() : (Math.round(value * 100) / 100).toString();
}

export function waterGoalOn(tracker: Tracker, date: string): number | null {
  if (tracker.habitTemplate !== 'water') return null;
  return [...(tracker.waterGoals ?? [])].filter((goal) => goal.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.ounces ?? null;
}

export function waterTotalOn(logs: WaterLog[], trackerId: string, date: string): number {
  return Math.round(logs.filter((log) => log.trackerId === trackerId && log.eventDate === date)
    .reduce((sum, log) => sum + log.ounces, 0) * 100) / 100;
}

export function waterProgress(tracker: Tracker, logs: WaterLog[], date = localDateKey()) {
  const goal = waterGoalOn(tracker, date);
  const amount = waterTotalOn(logs, tracker.id, date);
  return { amount, goal, percent: goal ? Math.min(100, Math.round(amount / goal * 100)) : 0 };
}

export function waterStreak(tracker: Tracker, logs: WaterLog[], today = localDateKey()) {
  const cursor = new Date(`${today}T12:00:00`);
  const start = tracker.startedAt ? localDateKey(new Date(tracker.startedAt)) : today;
  let streak = 0;
  for (let i = 0; i < 3660; i += 1) {
    const date = localDateKey(cursor);
    if (date < start) break;
    const goal = waterGoalOn(tracker, date);
    if (!goal || waterTotalOn(logs, tracker.id, date) < goal) {
      if (i === 0) { cursor.setDate(cursor.getDate() - 1); continue; }
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function saveWaterLog(state: TrackerState, log: WaterLog): TrackerState {
  const tracker = state.trackers.find((item) => item.id === log.trackerId && item.habitTemplate === 'water' && !item.archived);
  if (!tracker || !validWaterDate(log.eventDate) || log.eventDate > localDateKey()
    || !Number.isFinite(log.ounces) || log.ounces <= 0 || log.ounces > 1000) return state;
  return { ...state, waterLogs: [...(state.waterLogs ?? []).filter((item) => item.id !== log.id), log] };
}

export function validWaterDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDateKey(parsed) === date;
}

export function removeWaterLog(state: TrackerState, id: string): TrackerState {
  return { ...state, waterLogs: (state.waterLogs ?? []).filter((log) => log.id !== id) };
}
