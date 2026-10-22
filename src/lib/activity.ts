import { ActivityPoint, ActivityRoute } from '@/models/tracker';
import { localDateKey } from './progress';

export function pointDistanceMeters(a: ActivityPoint, b: ActivityPoint): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function routeDistanceMeters(points: ActivityPoint[]): number {
  return points.reduce((total, point, index) => index && (point.segment ?? 0) === (points[index - 1].segment ?? 0) ? total + pointDistanceMeters(points[index - 1], point) : total, 0);
}

export function validActivityPoint(point: ActivityPoint, previous?: ActivityPoint): boolean {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return false;
  if (point.accuracy != null && (point.accuracy < 0 || point.accuracy > 50)) return false;
  if (!previous || (point.segment ?? 0) !== (previous.segment ?? 0)) return point.accuracy == null || point.accuracy <= 35;
  const seconds = (point.timestamp - previous.timestamp) / 1000;
  const distance = pointDistanceMeters(previous, point);
  const uncertainty = ((previous.accuracy ?? 10) + (point.accuracy ?? 10)) * 0.75;
  return seconds > 0 && distance >= Math.max(8, uncertainty) && distance / seconds < 12;
}

export function activityDurationMs(route: Pick<ActivityRoute, 'startedAt' | 'endedAt' | 'pausedMs'>): number {
  // Reclaim's existing "active time" excluded explicit manual pauses. This
  // remains the elapsed-time convention for both new and historical routes.
  return Math.max(0, Date.parse(route.endedAt) - Date.parse(route.startedAt) - route.pausedMs);
}

export function routeMovingDurationMs(route: ActivityRoute): number | null {
  return route.movingMs === undefined || !Number.isFinite(route.movingMs) ? null : Math.max(0, Math.min(activityDurationMs(route), route.movingMs));
}

export function activeRouteDurationMs(route: { startedAt: string; pausedAt?: string; pausedMs: number }, now = Date.now()) {
  const end = route.pausedAt ? Date.parse(route.pausedAt) : now;
  return Math.max(0, end - Date.parse(route.startedAt) - route.pausedMs);
}

export function averagePaceMinPerMile(distanceMeters: number, activeMs: number): number | null {
  if (distanceMeters < 160.9344 || activeMs < 60_000) return null;
  return activeMs / 60_000 / (distanceMeters / 1609.344);
}

// 2024 Adult Compendium: level walking, speed-based MET categories.
// Subtract resting expenditure when adding an exercise estimate to a daily budget.
export function estimatedRouteCalories(distanceMeters: number, activeMs: number, weightKg?: number, kind: ActivityRoute['kind'] = 'walk'): number | null {
  if (!weightKg || weightKg <= 0 || !Number.isFinite(weightKg) || distanceMeters < 160.9344 || activeMs < 60_000) return null;
  const hours = activeMs / 3_600_000;
  const mph = distanceMeters / 1609.344 / hours;
  // 2024 Adult Compendium: cross-country hiking and pace-based running.
  // Walking and legacy neutral routes retain their original estimate.
  const met = kind === 'hike' ? 6.0 : kind === 'run'
    ? mph < 4.3 ? 6.5 : mph < 5 ? 7.8 : mph < 6 ? 8.5 : mph < 7 ? 9.3 : 11.0
    : mph < 2.8 ? 3.0 : mph < 3.5 ? 3.5 : mph < 4 ? 3.8 : 5.0;
  return Math.round((met - 1) * weightKg * hours);
}

export function latestRouteWeightKg(entries: { date: string; weight: number; unit: 'lb' | 'kg' }[], date: string) {
  const entry = [...entries].filter((item) => item.date <= date && item.weight > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
  return entry ? entry.unit === 'lb' ? entry.weight * 0.45359237 : entry.weight : null;
}

export function routeCaloriesForDate(routes: ActivityRoute[], date: string, enabled: boolean) {
  if (!enabled) return 0;
  return routes.reduce((total, route) => localDateKey(new Date(route.startedAt)) === date && Number.isFinite(route.estimatedCalories)
    ? total + Math.max(0, route.estimatedCalories ?? 0) : total, 0);
}
