import { ActivityRoute, WeightEntry } from '@/models/tracker';
import { KCAL_PER_MILE_PER_KG, latestRouteWeightKg } from './activity';
import { localDateKey } from './progress';

/** Used when no weigh-in exists yet; a typical adult weight. */
export const DEFAULT_STEP_WEIGHT_KG = 70;

/**
 * Net calories from walking, consistent with how routes are estimated: a ~3 mph walk
 * (MET 3.5, minus 1 for resting), so 2.5 MET-hours × kg ÷ 3 mph per mile walked.
 * Steps become miles through your stride; without one, about 2,000 steps per mile.
 */
const DEFAULT_STRIDE_METERS = 1609.344 / 2000;

/**
 * The day's steps that weren't taken on a route, whose calories already include them. A route with
 * no full step count uses its distance instead.
 */
export function stepsOutsideRoutes(steps: number | undefined, routes: readonly ActivityRoute[], date: string, strideMeters = DEFAULT_STRIDE_METERS, recording?: { startedAt: string; routeSteps?: number } | null): number | undefined {
  if (steps === undefined || !Number.isFinite(steps)) return undefined;
  const onRoutes = routes.filter((route) => localDateKey(new Date(route.startedAt)) === date).reduce((sum, route) => {
    const counted = route.routeSteps ?? 0;
    return sum + (route.routeStepStatus === 'available' ? counted : Math.max(counted, route.distanceMeters / strideMeters));
  }, 0);
  const recordingSteps = recording && localDateKey(new Date(recording.startedAt)) === date ? recording.routeSteps ?? 0 : 0;
  return Math.max(0, Math.round(steps - onRoutes - recordingSteps));
}

export type StepCalories = { kcal: number; weightKg: number; fromWeighIn: boolean };

export function stepCalories(steps: number | undefined, weightEntries: readonly WeightEntry[] | undefined, date: string, strideMeters = DEFAULT_STRIDE_METERS): StepCalories | undefined {
  if (steps === undefined || !Number.isFinite(steps) || steps < 0) return undefined;
  const weighed = latestRouteWeightKg([...(weightEntries ?? [])], date);
  const weightKg = weighed ?? DEFAULT_STEP_WEIGHT_KG;
  return { kcal: Math.round(steps * strideMeters / 1609.344 * weightKg * KCAL_PER_MILE_PER_KG), weightKg, fromWeighIn: weighed !== null };
}
