import { NutritionMealGroup } from '@/models/tracker';

/** No default meal: logging always requires an explicit final selection. */
export function requireNutritionMeal(groups: NutritionMealGroup[], selectedId?: string) {
  const group = groups.find((candidate) => candidate.id === selectedId);
  if (!group) throw new Error('Select a meal before confirming.');
  return group;
}
