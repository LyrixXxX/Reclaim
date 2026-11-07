import type { ActiveRoute } from '@/lib/activity-recording';
import type { ActivityRoute, TrackerState, WeightEntry } from '@/models/tracker';

import { activeRouteDurationMs, activityDurationMs, estimatedRouteCalories, latestRouteWeightKg, routeDistanceMeters, routeMovingDurationMs } from './activity';
import { nutritionTotals } from './nutrition';
import { localDateKey } from './progress';
import { routeElevation } from './route-elevation';
import { stepCalories, stepsOutsideRoutes } from './step-calories';
import { walkingStride } from './stride';
import { restingCaloriesPerDay } from './weight-tdee';
import { strengthCalorieBudget } from './workouts';

export const CALORIE_MODEL = 2;

export type RecordingRoute = Pick<ActiveRoute, 'startedAt'> & Partial<ActiveRoute>;

/** Hikes and walks are estimated from distance and climb, so saved ones can be brought up to date from their GPS. */
export function migrateRouteCalories(routes: ActivityRoute[], weightEntries: readonly WeightEntry[] = []): ActivityRoute[] {
  return routes.map((route) => {
    if (route.calorieModel === CALORIE_MODEL || route.kind === 'run' || route.estimatedCalories === undefined) return route;
    const activeMs = routeMovingDurationMs(route) ?? activityDurationMs(route);
    const weightKg = route.estimateWeightKg ?? latestRouteWeightKg([...weightEntries], localDateKey(new Date(route.startedAt))) ?? undefined;
    const updated = estimatedRouteCalories(route.distanceMeters, activeMs, weightKg, route.kind, routeElevation(route.points)?.gainMeters);
    return { ...route, estimatedCalories: updated ?? route.estimatedCalories, calorieModel: CALORIE_MODEL };
  });
}

/** Digesting food uses roughly a tenth of the calories eaten. */
const DIGESTION_SHARE = 0.1;

export type RouteCalorieRow = { id: string; route?: ActivityRoute; kcal: number | null; distanceMeters: number; gainMeters: number | null };

/**
 * Everything burned through activity on a day, with nothing counted twice: steps taken on a route
 * count only toward that route, and workout time that overlaps a route counts only once.
 */
export function dailyCalories(state: Pick<TrackerState, 'activityRoutes' | 'workoutSessions' | 'nutritionEntries' | 'weightEntries' | 'weightTdeeProfile' | 'nutritionGoals'>, date: string, stepCount: number | undefined, recording?: RecordingRoute | null, now = Date.now()) {
  const routes = (state.activityRoutes ?? []).filter((route) => localDateKey(new Date(route.startedAt)) === date);
  const rows: RouteCalorieRow[] = routes.map((route) => ({ id: route.id, route, kcal: route.estimatedCalories ?? null, distanceMeters: route.distanceMeters, gainMeters: routeElevation(route.points)?.gainMeters ?? null }));
  const budget = strengthCalorieBudget(routes, state.workoutSessions ?? [], date, true);
  const current = recording?.points && localDateKey(new Date(recording.startedAt)) === date ? recording : null;
  let recordingRow: RouteCalorieRow | null = null;
  if (current?.points) {
    const distanceMeters = routeDistanceMeters(current.points);
    const gainMeters = routeElevation(current.points)?.gainMeters ?? null;
    const weightKg = current.estimateWeightKg ?? latestRouteWeightKg([...(state.weightEntries ?? [])], date) ?? undefined;
    recordingRow = { id: 'recording', kcal: estimatedRouteCalories(distanceMeters, activeRouteDurationMs({ startedAt: current.startedAt, pausedAt: current.pausedAt, pausedMs: current.pausedMs ?? 0 }, now), weightKg, current.kind, gainMeters ?? 0), distanceMeters, gainMeters };
  }
  const steps = stepsOutsideRoutes(stepCount, routes, date, walkingStride(state).meters, recording);
  const walking = stepCalories(steps, state.weightEntries, date, walkingStride(state).meters);
  const eaten = nutritionTotals(state.nutritionEntries ?? [], date).calories;
  const allRoutes = recordingRow ? [...rows, recordingRow] : rows;
  const activity = budget.total + (recordingRow?.kcal ?? 0) + (walking?.kcal ?? 0);
  // Today only counts the hours so far, so it can be compared fairly with what's been eaten so far.
  const dayStart = Date.parse(`${date}T00:00:00`);
  const dayShare = Math.min(1, Math.max(0, (now - dayStart) / 86_400_000));
  const weightKg = latestRouteWeightKg([...(state.weightEntries ?? [])], date);
  const fullDayResting = state.weightTdeeProfile && weightKg ? restingCaloriesPerDay(state.weightTdeeProfile, weightKg, new Date(`${date}T12:00:00`)) : null;
  const resting = fullDayResting === null ? null : Math.round(fullDayResting * dayShare);
  const digestion = Math.round(eaten * DIGESTION_SHARE);
  return {
    eaten,
    routes: allRoutes,
    // Workout time during a route is taken off the route, so nothing counts twice.
    routeTotal: Math.max(0, budget.route - budget.overlap) + (recordingRow?.kcal ?? 0),
    routeDistanceMeters: allRoutes.reduce((sum, route) => sum + route.distanceMeters, 0),
    routeGainMeters: allRoutes.reduce((sum, route) => sum + (route.gainMeters ?? 0), 0),
    walking: { steps, kcal: walking?.kcal ?? null, fromWeighIn: walking?.fromWeighIn ?? false },
    workouts: budget.workout,
    resting,
    digestion,
    activity,
    burned: (resting ?? 0) + digestion + activity,
  };
}
