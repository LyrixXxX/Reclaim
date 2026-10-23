import type { ActivityRoute } from '@/models/tracker';

export type WalkingInterval = { startedAt: number; endedAt: number };
type RouteWindow = Pick<ActivityRoute, 'startedAt' | 'endedAt'>;

function validInterval(startedAt: number, endedAt: number): WalkingInterval | null {
  return Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt
    ? { startedAt, endedAt } : null;
}

export function walkingMinutesOutsideRoutes(intervals: WalkingInterval[], routes: RouteWindow[], active?: { startedAt: string } | null, now = Date.now()) {
  const excluded = [...routes.map((route) => validInterval(Date.parse(route.startedAt), Date.parse(route.endedAt))),
    active ? validInterval(Date.parse(active.startedAt), now) : null]
    .filter((interval): interval is WalkingInterval => interval !== null)
    .sort((a, b) => a.startedAt - b.startedAt);
  const merged: WalkingInterval[] = [];
  for (const interval of excluded) {
    const last = merged.at(-1);
    if (last && interval.startedAt <= last.endedAt) last.endedAt = Math.max(last.endedAt, interval.endedAt);
    else merged.push({ ...interval });
  }
  let totalMs = 0;
  for (const interval of intervals) {
    if (!Number.isFinite(interval.startedAt) || !Number.isFinite(interval.endedAt) || interval.endedAt <= interval.startedAt) continue;
    let cursor = interval.startedAt;
    for (const route of merged) {
      if (route.endedAt <= cursor) continue;
      if (route.startedAt >= interval.endedAt) break;
      totalMs += Math.max(0, Math.min(route.startedAt, interval.endedAt) - cursor);
      cursor = Math.max(cursor, Math.min(route.endedAt, interval.endedAt));
    }
    totalMs += Math.max(0, interval.endedAt - cursor);
  }
  return totalMs / 60_000;
}

export function walkingMinutesHistoryOutsideRoutes(days: { date: string; intervals: WalkingInterval[] }[], routes: RouteWindow[], active?: { startedAt: string } | null, now = Date.now()) {
  return Object.fromEntries(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
    .map((day) => [day.date, walkingMinutesOutsideRoutes(day.intervals, routes, active, now)]));
}
