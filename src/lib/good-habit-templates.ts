import { ActivityRoute, GoodHabitLog, Tracker } from '@/models/tracker';
import { localDateKey } from './progress';

export type NewHabitTemplate = Exclude<NonNullable<Tracker['habitTemplate']>, 'water'>;
export const GOOD_HABIT_TEMPLATES: { id: NewHabitTemplate; title: string; icon: string; unit: string; period: 'day' | 'week'; checklist?: boolean; suggestions?: string[] }[] = [
  { id: 'walk', title: 'Walk more', icon: '🚶', unit: 'minutes', period: 'day' },
  { id: 'sleep', title: 'Build a sleep routine', icon: '🌙', unit: 'steps', period: 'day', checklist: true, suggestions: ['Wind down', 'Get ready for bed', 'Lights out'] },
  { id: 'exercise', title: 'Exercise regularly', icon: '💪', unit: 'workouts', period: 'week' },
  { id: 'produce', title: 'Fruits & vegetables', icon: '🥦', unit: 'servings', period: 'day' },
  { id: 'reading', title: 'Read every day', icon: '📖', unit: 'minutes', period: 'day' },
  { id: 'mindfulness', title: 'Practice mindfulness', icon: '🧘', unit: 'minutes', period: 'day' },
  { id: 'dental', title: 'Dental-care routine', icon: '🪥', unit: 'steps', period: 'day', checklist: true, suggestions: ['Morning brush', 'Evening brush', 'Floss'] },
];

export const templateConfig = (id?: Tracker['habitTemplate']) => GOOD_HABIT_TEMPLATES.find((item) => item.id === id);
export const goodHabitLogId = () => `habit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function habitDate(template: Tracker['habitTemplate'], now = new Date()) {
  const date = new Date(now);
  if (template === 'sleep' && date.getHours() < 6) date.setDate(date.getDate() - 1);
  return localDateKey(date);
}
export function periodStart(date: string, period: 'day' | 'week') {
  if (period === 'day') return date;
  const day = new Date(`${date}T12:00:00`);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return localDateKey(day);
}
export function goalOn(tracker: Tracker, date: string) {
  return [...(tracker.habitGoalHistory ?? [])].filter((item) => item.effectiveDate <= date).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.value ?? null;
}
export function checklistOn(tracker: Tracker, date: string) {
  return [...(tracker.habitChecklistHistory ?? [])].filter((item) => item.effectiveDate <= date).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.items ?? [];
}
export function activeWalkMinutes(route: ActivityRoute) {
  return Math.max(0, (Date.parse(route.endedAt) - Date.parse(route.startedAt) - route.pausedMs) / 60000);
}
export function routeMinutesOn(routes: ActivityRoute[], tracker: Tracker, date: string) {
  const started = tracker.startedAt?.slice(0, 10) ?? date;
  if (date < started) return 0;
  return routes.filter((route) => route.kind === 'walk' && localDateKey(new Date(route.startedAt)) === date).reduce((sum, route) => sum + activeWalkMinutes(route), 0);
}
export function habitProgress(tracker: Tracker, logs: GoodHabitLog[], routes: ActivityRoute[], now = new Date()) {
  const config = templateConfig(tracker.habitTemplate);
  if (!config) return { date: localDateKey(now), amount: 0, goal: 0, percent: 0 };
  const date = habitDate(tracker.habitTemplate, now);
  const start = periodStart(date, config.period);
  const goal = config.checklist ? checklistOn(tracker, date).length : goalOn(tracker, date) ?? 0;
  const applicable = logs.filter((log) => log.trackerId === tracker.id && log.eventDate >= start && log.eventDate <= date);
  const amount = config.checklist
    ? checklistOn(tracker, date).filter((item) => applicable.some((log) => log.eventDate === date && log.checklistItemId === item.id)).length
    : applicable.reduce((sum, log) => sum + log.amount, 0) + (config.id === 'walk' ? routeMinutesOn(routes, tracker, date) : 0);
  return { date, amount, goal, percent: goal ? Math.min(100, Math.round(amount / goal * 100)) : 0 };
}
export function habitStreak(tracker: Tracker, logs: GoodHabitLog[], routes: ActivityRoute[], now = new Date()) {
  const config = templateConfig(tracker.habitTemplate);
  if (!config) return 0;
  const current = habitDate(tracker.habitTemplate, now);
  const cursor = new Date(`${current}T12:00:00`);
  if (config.period === 'week') cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  const started = tracker.startedAt?.slice(0, 10) ?? current;
  let streak = 0;
  for (let index = 0; index < 3660; index += 1) {
    const date = localDateKey(cursor);
    if (date < started && (config.period === 'day' || index > 0)) break;
    const periodEnd = new Date(cursor);
    if (config.period === 'week') periodEnd.setDate(periodEnd.getDate() + 6);
    const goal = config.checklist ? checklistOn(tracker, date).length : goalOn(tracker, config.period === 'week' ? localDateKey(periodEnd) : date) ?? 0;
    const amount = config.checklist
      ? checklistOn(tracker, date).filter((item) => logs.some((log) => log.trackerId === tracker.id && log.eventDate === date && log.checklistItemId === item.id)).length
      : logs.filter((log) => log.trackerId === tracker.id && log.eventDate >= date && log.eventDate <= localDateKey(periodEnd)).reduce((sum, log) => sum + log.amount, 0)
        + (config.id === 'walk' ? routeMinutesOn(routes, tracker, date) : 0);
    if (!goal || amount < goal) { if (index !== 0) break; }
    else streak += 1;
    cursor.setDate(cursor.getDate() - (config.period === 'week' ? 7 : 1));
  }
  return streak;
}
export function validHabitLog(log: GoodHabitLog) {
  return Boolean(typeof log.id === 'string' && log.id && typeof log.trackerId === 'string' && log.trackerId
    && typeof log.eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(log.eventDate) && localDateKey(new Date(`${log.eventDate}T12:00:00`)) === log.eventDate
    && typeof log.amount === 'number' && Number.isFinite(log.amount) && log.amount > 0 && log.amount <= 10000
    && typeof log.recordedAt === 'string' && Number.isFinite(Date.parse(log.recordedAt))
    && (log.durationMinutes === undefined || (typeof log.durationMinutes === 'number' && Number.isFinite(log.durationMinutes) && log.durationMinutes > 0 && log.durationMinutes <= 1440))
    && (log.note === undefined || typeof log.note === 'string')
    && (log.checklistItemId === undefined || typeof log.checklistItemId === 'string')
    && (log.nutritionEntryId === undefined || typeof log.nutritionEntryId === 'string')
    && (log.source === undefined || log.source === 'manual' || log.source === 'nutrition'));
}
