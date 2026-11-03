import { WeightEntry } from '@/models/tracker';
import { latestRouteWeightKg } from './activity';

/** Used when no weigh-in exists yet; a typical adult weight. */
export const DEFAULT_STEP_WEIGHT_KG = 70;

/**
 * Net calories from walking, consistent with how routes are estimated: a ~3 mph walk
 * (MET 3.5, minus 1 for resting) at about 2,000 steps per mile.
 * 2.5 MET-hours × kg ÷ 3 mph ÷ 2,000 steps ≈ 0.000417 kcal per step per kg.
 */
const KCAL_PER_STEP_PER_KG = 2.5 / 3 / 2000;

export type StepCalories = { kcal: number; weightKg: number; fromWeighIn: boolean };

export function stepCalories(steps: number | undefined, weightEntries: readonly WeightEntry[] | undefined, date: string): StepCalories | undefined {
  if (steps === undefined || !Number.isFinite(steps) || steps < 0) return undefined;
  const weighed = latestRouteWeightKg([...(weightEntries ?? [])], date);
  const weightKg = weighed ?? DEFAULT_STEP_WEIGHT_KG;
  return { kcal: Math.round(steps * weightKg * KCAL_PER_STEP_PER_KG), weightKg, fromWeighIn: weighed !== null };
}
