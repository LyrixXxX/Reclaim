import { TrackerState } from '@/models/tracker';

import {
  extractServingWeightGrams,
  goalForDate,
  macroCalories,
  migrateNutritionState,
  nutritionTotals,
  nutritionTodaySoFar,
  nutritionTrendPoints,
  parseExplicitNutritionSummary,
  parseExplicitNutritionSummaries,
  removeSavedFood,
  removeSavedMeal,
  savedMealTotals,
  servingsForWeight,
  upsertNutritionEntry,
  upsertNutritionGoal,
  upsertSavedFood,
  upsertSavedMeal,
  validateAiNutritionResult,
} from './nutrition';

const nutrients = { carbsGrams: 20, proteinGrams: 10, fatGrams: 5, fiberGrams: 8 };

describe('nutrition', () => {
  test('derives calories from carbs, protein, and fat while excluding fiber', () => {
    expect(macroCalories(nutrients)).toBe(165);
    expect(macroCalories({ ...nutrients, fiberGrams: 100 })).toBe(165);
  });

  test('keeps a supplied meal summary as one exact entry without recalculating calories', () => {
    const item = parseExplicitNutritionSummary('my last meal was pulled pork and tuna wrap x2 the macros were ~678 cal | ~72g Protein | ~34g Carbs | ~37g Fat | 22g Fiber');
    expect(item).toMatchObject({
      name: 'pulled pork and tuna wrap x2',
      servingLabel: '1 complete meal',
      statedCalories: 678,
      nutrients: { proteinGrams: 72, carbsGrams: 34, fatGrams: 37, fiberGrams: 22 },
    });
    expect(macroCalories(item!.nutrients)).toBe(757);
  });

  test('reads label-first supplied totals and preserves the meal title', () => {
    expect(parseExplicitNutritionSummary('Chicken bowl — Calories: 520, Protein: 48g, Carbs: 55g, Fat: 14g, Fiber: 8g')).toMatchObject({
      name: 'Chicken bowl',
      statedCalories: 520,
      nutrients: { proteinGrams: 48, carbsGrams: 55, fatGrams: 14, fiberGrams: 8 },
    });
  });

  test('leaves incomplete descriptions for Nutrition AI estimation', () => {
    expect(parseExplicitNutritionSummary('Two eggs and toast, about 400 calories and 25g protein')).toBeUndefined();
  });

  test('keeps two fully specified foods from one prompt as separate entries', () => {
    const items = parseExplicitNutritionSummaries('Medium Caesar salad: ~275 kcal | ~7g protein | ~12g carbs | ~23g fat | ~3g fiber\n\n2 thin-crust meatball/pepperoni/onion slices: ~630 kcal | ~30g protein | ~64g carbs | ~28g fat | ~4g fiber');
    expect(items).toHaveLength(2);
    expect(items?.[0]).toMatchObject({ name: 'Medium Caesar salad', statedCalories: 275, nutrients: { proteinGrams: 7, carbsGrams: 12, fatGrams: 23, fiberGrams: 3 } });
    expect(items?.[1]).toMatchObject({ name: '2 thin-crust meatball/pepperoni/onion slices', statedCalories: 630, nutrients: { proteinGrams: 30, carbsGrams: 64, fatGrams: 28, fiberGrams: 4 } });
  });

  test('does not silently drop an incomplete second food', () => {
    expect(parseExplicitNutritionSummaries('Salad: 275 kcal | 7g protein | 12g carbs | 23g fat | 3g fiber\nPizza: 2 slices')).toBeUndefined();
    expect(parseExplicitNutritionSummaries('Salad: 275 kcal | 7g protein | 12g carbs | 23g fat | 3g fiber and pizza: 630 kcal | 30g protein | 64g carbs | 28g fat | 4g fiber')).toBeUndefined();
  });

  test('totals multiply servings and remain cumulative', () => {
    const entries = upsertNutritionEntry([], {
      eventDate: '2026-09-18', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', name: 'Oats', servingLabel: '48 g', servings: 2, nutrients, source: 'manual',
    }, 'entry-1');
    expect(nutritionTotals(entries, '2026-09-18')).toMatchObject({ carbsGrams: 40, proteinGrams: 20, fatGrams: 10, fiberGrams: 16, calories: 330 });
  });

  test('extracts a label serving weight and converts weighed food into servings', () => {
    expect(extractServingWeightGrams('1 cup (227 g)')).toBe(227);
    expect(extractServingWeightGrams('About 12 pieces (30g)')).toBe(30);
    expect(extractServingWeightGrams('1 oz')).toBeCloseTo(28.35, 2);
    expect(extractServingWeightGrams('2 large eggs')).toBeUndefined();
    expect(servingsForWeight(75, 'g', 30)).toBe(2.5);
    expect(servingsForWeight(2, 'oz', 28.349523125)).toBe(2);
  });

  test('weighed entries retain entered weight and calculate totals from the serving ratio', () => {
    const entries = upsertNutritionEntry([], {
      eventDate: '2026-09-20', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', name: 'Cereal', servingLabel: '1 cup (30 g)', servingWeightGrams: 30, amountMode: 'weight', consumedAmount: 75, consumedUnit: 'g', servings: servingsForWeight(75, 'g', 30), nutrients, source: 'ai_label',
    }, 'weighted');
    expect(entries[0]).toMatchObject({ amountMode: 'weight', consumedAmount: 75, consumedUnit: 'g', servingWeightGrams: 30, servings: 2.5 });
    expect(nutritionTotals(entries, '2026-09-20')).toMatchObject({ carbsGrams: 50, proteinGrams: 25, fatGrams: 12.5, fiberGrams: 20, calories: 412.5 });
  });

  test('scales printed label calories by weight while retaining macro totals', () => {
    const entries = upsertNutritionEntry([], {
      eventDate: '2026-09-20', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', name: 'Cereal', servingLabel: '30 g', servingWeightGrams: 30, amountMode: 'weight', consumedAmount: 75, consumedUnit: 'g', servings: 2.5, nutrients, statedCalories: 150, source: 'ai_label',
    }, 'weighted');
    expect(nutritionTotals(entries, '2026-09-20')).toMatchObject({ calories: 375, carbsGrams: 50, proteinGrams: 25 });
  });

  test('rejects impossible weighed amounts without affecting legacy serving entries', () => {
    expect(() => servingsForWeight(0, 'g', 30)).toThrow('weight greater than zero');
    expect(() => servingsForWeight(30, 'g', 0)).toThrow('label weight');
    expect(() => upsertNutritionEntry([], { eventDate: '2026-09-20', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', name: 'Food', servingLabel: '30 g', amountMode: 'weight', consumedAmount: 30, consumedUnit: 'g', servings: 1, nutrients, source: 'manual' })).toThrow('Serving weight');
    expect(upsertNutritionEntry([], { eventDate: '2026-09-20', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', name: 'Legacy', servingLabel: '1 bowl', servings: 1, nutrients, source: 'manual' })).toHaveLength(1);
  });

  test('uses effective-dated goal profiles', () => {
    let goals = upsertNutritionGoal([], { effectiveDate: '2026-09-01', ...nutrients }, 'goal-1');
    goals = upsertNutritionGoal(goals, { effectiveDate: '2026-09-15', carbsGrams: 30, proteinGrams: 20, fatGrams: 10, fiberGrams: 12 }, 'goal-2');
    expect(goalForDate(goals, '2026-09-10')?.id).toBe('goal-1');
    expect(goalForDate(goals, '2026-09-18')?.id).toBe('goal-2');
  });

  test('keeps the earliest saved goals active when browsing an earlier date', () => {
    const goals = upsertNutritionGoal([], { effectiveDate: '2026-09-19', ...nutrients }, 'goal-1');
    expect(goalForDate(goals, '2026-09-18')?.id).toBe('goal-1');
    expect(goalForDate([], '2026-09-18')).toBeUndefined();
  });

  test('rejects impossible calendar dates instead of normalizing them', () => {
    expect(() => upsertNutritionGoal([], { effectiveDate: '2026-02-31', ...nutrients })).toThrow('Enter a valid date.');
  });

  test('saved-food changes do not rewrite historical snapshots', () => {
    let foods = upsertSavedFood([], { name: 'Yogurt', servingLabel: '1 cup', nutrients, source: 'ai_label' }, 'food-1');
    const entries = upsertNutritionEntry([], { eventDate: '2026-09-18', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', foodId: 'food-1', name: foods[0].name, servingLabel: foods[0].servingLabel, servings: 1, nutrients: foods[0].nutrients, source: 'saved_food' }, 'entry-1');
    foods = upsertSavedFood(foods, { id: 'food-1', name: 'Yogurt', servingLabel: '1 cup', nutrients: { ...nutrients, proteinGrams: 30 }, source: 'ai_label' });
    expect(entries[0].nutrients.proteinGrams).toBe(10);
    expect(removeSavedFood(foods, 'food-1', true)).toHaveLength(0);
    expect(entries).toHaveLength(1);
  });

  test('creates, edits, and deletes a saved meal without changing logged food snapshots', () => {
    const oatmeal = { id: 'meal-item-oats', foodId: 'food-oats', name: 'Oatmeal', servingLabel: '48 g', servings: 1, amountMode: 'weight' as const, consumedAmount: 48, consumedUnit: 'g' as const, servingWeightGrams: 48, nutrients, statedCalories: 178 };
    const berries = { id: 'meal-item-berries', foodId: 'food-berries', name: 'Blueberries', servingLabel: '140 g', servings: 1, amountMode: 'weight' as const, consumedAmount: 140, consumedUnit: 'g' as const, servingWeightGrams: 140, nutrients: { carbsGrams: 20, proteinGrams: 1, fatGrams: 0, fiberGrams: 3 }, statedCalories: 80 };
    let meals = upsertSavedMeal([], { name: 'Fiber Oatmeal Breakfast', items: [oatmeal, berries] }, 'saved-meal-1');
    expect(savedMealTotals(meals[0].items)).toMatchObject({ calories: 258, carbsGrams: 40, proteinGrams: 11, fiberGrams: 11 });

    const logged = meals[0].items.map((item, index) => upsertNutritionEntry([], {
      ...item, eventDate: '2026-09-22', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', source: 'saved_meal', savedMealId: meals[0].id, savedMealName: meals[0].name, savedMealInstanceId: 'meal-log-1',
    }, `entry-${index}`)[0]);
    meals = upsertSavedMeal(meals, { id: 'saved-meal-1', name: 'Weekday Oatmeal', items: [{ ...oatmeal, consumedAmount: 60, servings: 1.25 }] });
    expect(logged.map((entry) => entry.consumedAmount)).toEqual([48, 140]);
    expect(logged.every((entry) => entry.savedMealInstanceId === 'meal-log-1')).toBe(true);
    expect(removeSavedMeal(meals, 'saved-meal-1', false)).toHaveLength(1);
    expect(removeSavedMeal(meals, 'saved-meal-1', true)).toHaveLength(0);
    expect(logged).toHaveLength(2);
  });

  test('rolling trends use completed days and leave missing days empty', () => {
    const entries = upsertNutritionEntry([], { eventDate: '2026-09-17', mealGroupId: 'meal-dinner', mealLabel: 'Dinner', name: 'Meal', servingLabel: '1 plate', servings: 1, nutrients, source: 'manual' }, 'entry-1');
    const points = nutritionTrendPoints(entries, 'calories', '7D', new Date(2026, 8, 19, 9));
    expect(points.map((point) => point.key)).toEqual(['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']);
    expect(points[5].value).toBe(165);
    expect(points[6].value).toBeNull();
  });

  test('today-so-far is available without entering completed-day averages', () => {
    let entries = upsertNutritionEntry([], { eventDate: '2026-09-18', mealGroupId: 'meal-dinner', mealLabel: 'Dinner', name: 'Yesterday', servingLabel: '1', servings: 1, nutrients, source: 'manual' }, 'yesterday');
    entries = upsertNutritionEntry(entries, { eventDate: '2026-09-19', mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', name: 'Today', servingLabel: '1', servings: 2, nutrients, source: 'manual' }, 'today');
    const now = new Date(2026, 8, 19, 12);
    expect(nutritionTodaySoFar(entries, 'calories', now)).toEqual({ key: '2026-09-19', value: 330, entryCount: 1 });
    const completed = nutritionTrendPoints(entries, 'calories', '7D', now);
    expect(completed.at(-1)?.key).toBe('2026-09-18');
    expect(completed.some((point) => point.key === '2026-09-19')).toBe(false);
  });

  test('monthly values average only logged days', () => {
    let entries = upsertNutritionEntry([], { eventDate: '2026-08-01', mealGroupId: 'meal-dinner', mealLabel: 'Dinner', name: 'Meal', servingLabel: '1', servings: 1, nutrients, source: 'manual' }, 'one');
    entries = upsertNutritionEntry(entries, { eventDate: '2026-08-03', mealGroupId: 'meal-dinner', mealLabel: 'Dinner', name: 'Meal', servingLabel: '1', servings: 2, nutrients, source: 'manual' }, 'two');
    expect(nutritionTrendPoints(entries, 'calories', 'MONTHS', new Date(2026, 8, 19))[0]).toMatchObject({ key: '2026-08', value: 247.5, loggedDays: 2 });
  });

  test('migrates old local state without changing existing data', () => {
    const old = { trackers: [], checkIns: [] } as TrackerState;
    const migrated = migrateNutritionState(old);
    expect(migrated.nutritionEntries).toEqual([]);
    expect(migrated.savedMeals).toEqual([]);
    expect(migrated.nutritionMealGroups?.map((item) => item.name)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
  });

  test('validates structured AI output', () => {
    const result = validateAiNutritionResult({ schemaVersion: 1, warnings: [], items: [{ name: 'Eggs', servingLabel: '2 large', nutrients, statedCalories: 140, confidence: 'high', assumptions: [] }] });
    expect(result.items[0].name).toBe('Eggs');
    const weighted = validateAiNutritionResult({ schemaVersion: 1, warnings: [], items: [{ name: 'Oats', servingLabel: '1/2 cup (40 g)', servingWeightGrams: 40, nutrients, statedCalories: 150, confidence: 'high', assumptions: [] }] });
    expect(weighted.items[0].servingWeightGrams).toBe(40);
    const fallback = validateAiNutritionResult({ schemaVersion: 1, warnings: [], items: [{ name: 'Oats', servingLabel: '1/2 cup (40 g)', nutrients, statedCalories: 150, confidence: 'high', assumptions: [] }] });
    expect(fallback.items[0].servingWeightGrams).toBe(40);
    expect(() => validateAiNutritionResult({ schemaVersion: 1, warnings: [], items: [] })).toThrow(/No food items/);
  });
});
