import { ActivityRoute, WorkoutSession } from '@/models/tracker';
import { activityDurationMs } from './activity';
import { workoutElapsedMs, workoutReps, workoutSets, workoutVolumeKg } from './workouts';

export type DashboardRange = 'week' | 'month' | '3m' | '6m' | 'year' | 'all';
export type TrainingTotals = { strengthSessions: number; cardioSessions: number; strengthMinutes: number; cardioMinutes: number; cardioMeters: number; volumeKg: number; sets: number; reps: number };
export type RoutineMetric = 'volume' | 'sets' | 'reps' | 'duration' | 'exercises';
export type RoutinePoint = { id: string; at: string; name: string; volumeKg: number; sets: number; reps: number; durationMinutes: number; exercises: number };

const empty = (): TrainingTotals => ({ strengthSessions: 0, cardioSessions: 0, strengthMinutes: 0, cardioMinutes: 0, cardioMeters: 0, volumeKg: 0, sets: 0, reps: 0 });

export function localWeekStart(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - (result.getDay() + 6) % 7);
  return result;
}

export function dashboardStart(range: DashboardRange, now: Date): Date | null {
  if (range === 'all') return null;
  if (range === 'week') return localWeekStart(now);
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'year') return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth() - (range === '3m' ? 3 : 6), now.getDate());
}

export function trainingTotals(sessions: WorkoutSession[], routes: ActivityRoute[], start: Date | null, end: Date): TrainingTotals {
  const result = empty();
  const within = (value: string) => { const at = Date.parse(value); return Number.isFinite(at) && at < end.getTime() && (!start || at >= start.getTime()); };
  const sessionIds = new Set<string>();
  for (const session of sessions) {
    if (!session.endedAt || !within(session.endedAt) || sessionIds.has(session.id)) continue;
    sessionIds.add(session.id);
    result.strengthSessions++;
    result.strengthMinutes += workoutElapsedMs(session) / 60_000;
    result.volumeKg += workoutVolumeKg(session);
    result.sets += workoutSets(session).length;
    result.reps += workoutReps(session);
  }
  const routeIds = new Set<string>();
  for (const route of routes) {
    if (!within(route.endedAt) || routeIds.has(route.id)) continue;
    routeIds.add(route.id);
    result.cardioSessions++;
    result.cardioMinutes += activityDurationMs(route) / 60_000;
    result.cardioMeters += Math.max(0, route.distanceMeters);
  }
  return result;
}

export function recentWeeks(sessions: WorkoutSession[], routes: ActivityRoute[], now: Date, count = 4) {
  const current = localWeekStart(now);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate() - (count - 1 - index) * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { start, totals: trainingTotals(sessions, routes, start, end) };
  });
}

export function routineProgress(sessions: WorkoutSession[], routineId: string): RoutinePoint[] {
  const ids = new Set<string>();
  return sessions.filter((session) => session.routineId === routineId && !!session.endedAt && !ids.has(session.id) && !!ids.add(session.id))
    .map((session) => ({ id: session.id, at: session.endedAt!, name: session.name, volumeKg: workoutVolumeKg(session), sets: workoutSets(session).length, reps: workoutReps(session), durationMinutes: workoutElapsedMs(session) / 60_000, exercises: session.exercises.filter((entry) => entry.sets.length > 0).length }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function routineValue(point: RoutinePoint, metric: RoutineMetric): number {
  return metric === 'volume' ? point.volumeKg : metric === 'duration' ? point.durationMinutes : point[metric];
}
