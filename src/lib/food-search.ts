import { NutritionEntry, NutritionMealGroup, NutritionNutrients, SavedFood, SavedMeal } from '@/models/tracker';
import { nutritionEntryCalories } from './nutrition';

/** Something the quick-add search can log in one step. */
export type FoodChoice = {
  key: string;
  kind: 'food' | 'meal' | 'recent';
  name: string;
  brand?: string;
  servingLabel: string;
  servingWeightGrams?: number;
  nutrients: NutritionNutrients;
  statedCalories?: number;
  /** Servings to start the amount at: 1, or what was eaten last time. */
  servings: number;
  foodId?: string;
  mealId?: string;
  /** Calories for one serving, for the result row. */
  calories: number;
};

const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 0 = name starts with the query, 1 = a word starts with it, 2 = every typed word starts a word; -1 = no match. */
export function foodMatchRank(text: string, query: string) {
  const haystack = normalize(text);
  const needle = normalize(query);
  if (!needle) return 0;
  if (haystack.startsWith(needle)) return 0;
  const words = haystack.split(' ');
  if (words.some((word) => word.startsWith(needle))) return 1;
  const parts = needle.split(' ');
  if (parts.every((part) => words.some((word) => word.startsWith(part)))) return 2;
  return haystack.includes(needle) ? 3 : -1;
}

const perServingCalories = (nutrients: NutritionNutrients, statedCalories?: number) => nutritionEntryCalories({ nutrients, servings: 1, statedCalories });

export function foodChoice(food: SavedFood): FoodChoice {
  return { key: `food-${food.id}`, kind: 'food', name: food.name, brand: food.brand, servingLabel: food.servingLabel, servingWeightGrams: food.servingWeightGrams, nutrients: food.nutrients, statedCalories: food.statedCalories, servings: 1, foodId: food.id, calories: perServingCalories(food.nutrients, food.statedCalories) };
}

export function mealChoice(meal: SavedMeal): FoodChoice {
  const calories = meal.items.reduce((sum, item) => sum + nutritionEntryCalories(item), 0);
  return { key: `meal-${meal.id}`, kind: 'meal', name: meal.name, servingLabel: `${meal.items.length} ${meal.items.length === 1 ? 'food' : 'foods'}`, nutrients: { carbsGrams: 0, proteinGrams: 0, fatGrams: 0, fiberGrams: 0 }, servings: 1, mealId: meal.id, calories: Math.round(calories) };
}

/** Distinct foods logged recently, newest first. Saved-meal items count as their own foods. */
export function recentFoodChoices(entries: readonly NutritionEntry[], limit = 12): FoodChoice[] {
  const seen = new Set<string>();
  const out: FoodChoice[] = [];
  for (const entry of [...entries].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))) {
    const identity = entry.foodId ? `id:${entry.foodId}` : `name:${normalize(entry.name)}|${normalize(entry.servingLabel)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push({ key: `recent-${entry.id}`, kind: 'recent', name: entry.name, brand: entry.brand, servingLabel: entry.servingLabel, servingWeightGrams: entry.servingWeightGrams, nutrients: entry.nutrients, statedCalories: entry.statedCalories, servings: entry.servings > 0 ? entry.servings : 1, foodId: entry.foodId, calories: perServingCalories(entry.nutrients, entry.statedCalories) });
    if (out.length >= limit) break;
  }
  return out;
}

/** Saved foods, saved meals and recent foods that match the query, best first, with duplicates of a saved food dropped. */
export function searchFoodChoices(query: string, foods: readonly SavedFood[], meals: readonly SavedMeal[], recents: readonly FoodChoice[], limit = 12) {
  const savedIds = new Set(foods.map((food) => food.id));
  const candidates = [
    ...recents.filter((item) => !item.foodId || !savedIds.has(item.foodId)),
    ...foods.map(foodChoice),
    ...meals.map(mealChoice),
  ];
  const kindOrder = { recent: 0, food: 1, meal: 2 } as const;
  return candidates
    .map((item) => ({ item, rank: foodMatchRank(`${item.name} ${item.brand ?? ''}`, query) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || kindOrder[a.item.kind] - kindOrder[b.item.kind] || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map(({ item }) => item);
}

/** The meal most likely meant right now, from the built-in meal groups. */
export function suggestedMealGroupId(groups: readonly NutritionMealGroup[], now = new Date()) {
  const active = groups.filter((group) => !group.archived);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const wanted = minutes < 10 * 60 + 30 ? 'meal-breakfast' : minutes < 15 * 60 ? 'meal-lunch' : minutes >= 17 * 60 && minutes < 21 * 60 + 30 ? 'meal-dinner' : 'meal-snacks';
  return (active.find((group) => group.id === wanted) ?? active[0])?.id;
}
