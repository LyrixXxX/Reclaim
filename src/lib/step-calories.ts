import { WeightEntry } from '@/models/tracker';
import { latestRouteWeightKg } from './activity';

/** Used when no weigh-in exists yet; a typical adult weight. */
export const DEFAULT_STEP_WEIGHT_KG = 70;

/**
 * Net calories from walking, consistent with how routes are estimated: a ~3 mph walk
 * (MET 3.5, minus 1 for resting), so 2.5 MET-hours × kg ÷ 3 mph per mile walked.
 * Steps become miles through your stride; without one, about 2,000 steps per mile.
 */
const KCAL_PER_MILE_PER_KG = 2.5 / 3;
const DEFAULT_STRIDE_METERS = 1609.344 / 2000;

export type StepCalories = { kcal: number; weightKg: number; fromWeighIn: boolean };

export function stepCalories(steps: number | undefined, weightEntries: readonly WeightEntry[] | undefined, date: string, strideMeters = DEFAULT_STRIDE_METERS): StepCalories | undefined {
  if (steps === undefined || !Number.isFinite(steps) || steps < 0) return undefined;
  const weighed = latestRouteWeightKg([...(weightEntries ?? [])], date);
  const weightKg = weighed ?? DEFAULT_STEP_WEIGHT_KG;
  return { kcal: Math.round(steps * strideMeters / 1609.344 * weightKg * KCAL_PER_MILE_PER_KG), weightKg, fromWeighIn: weighed !== null };
}
