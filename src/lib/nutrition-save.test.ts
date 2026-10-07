import { TrackerState } from '@/models/tracker';
import {
  applyNutritionLogBatch,
  applyPreparedSavedMeal,
  NutritionEntryInput,
  prepareNutritionLogBatch,
  prepareSavedMeal,
  savedMealTotals,
} from './nutrition';

const nutrients = { carbsGrams: 34, proteinGrams: 6, fatGrams: 3, fiberGrams: 5 };
const food = { id: 'oats', name: 'Oatmeal', servingLabel: '48 g', servingWeightGrams: 48, nutrients, statedCalories: 178, source: 'manual' as const };
const entry: NutritionEntryInput = {
  ...food, id: 'log-oats', foodId: 'oats', eventDate: '2026-09-22', mealGroupId: 'breakfast', mealLabel: 'Breakfast',
  servings: 1, amountMode: 'weight', consumedAmount: 48, consumedUnit: 'g', source: 'saved_meal',
  savedMealId: 'meal', savedMealName: 'Fiber breakfast', savedMealInstanceId: 'breakfast-today',
};
const empty: TrackerState = { trackers: [], checkIns: [] };
const item = { ...food, id: 'component-oats', foodId: 'oats', servings: 1, amountMode: 'weight' as const, consumedAmount: 48, consumedUnit: 'g' as const };

describe('complete nutrition saves', () => {
  test('invalid later components leave both the log and library untouched, then retry saves once', () => {
    let state = empty;
    const original = JSON.stringify(state);
    expect(() => {
      const batch = prepareNutritionLogBatch({ entries: [entry, { ...entry, id: 'log-second', consumedAmount: 0 }], foods: [food] });
      state = applyNutritionLogBatch(state, batch);
    }).toThrow(/weight/i);
    expect(JSON.stringify(state)).toBe(original);
    state = applyNutritionLogBatch(state, prepareNutritionLogBatch({ entries: [entry, { ...entry, id: 'log-second' }], foods: [food] }));
    expect(state.nutritionEntries).toHaveLength(2);
    expect(state.savedFoods).toHaveLength(1);
    expect(state.nutritionEntries?.every((value) => value.savedMealInstanceId === 'breakfast-today')).toBe(true);
  });

  test('invalid calendar dates and library values fail before any update', () => {
    expect(() => prepareNutritionLogBatch({ entries: [{ ...entry, eventDate: '2026-02-31' }], foods: [] })).toThrow(/date/i);
    expect(() => prepareNutritionLogBatch({ entries: [entry], foods: [{ ...food, statedCalories: -1 }] })).toThrow(/calories/i);
    expect(() => prepareNutritionLogBatch({ entries: [], foods: [food] })).toThrow(/at least one food/i);
  });

  test('a batch preserves intervening records, timestamps, group identity, and exact stated calories', () => {
    const first = applyNutritionLogBatch(empty, prepareNutritionLogBatch({ entries: [entry], foods: [food] }));
    const recordedAt = first.nutritionEntries![0].recordedAt;
    const createdAt = first.savedFoods![0].createdAt;
    const prepared = prepareNutritionLogBatch({ entries: [{ ...entry, consumedAmount: 96, servings: 2 }], foods: [{ ...food, name: 'Updated oats' }] });
    const intervening = applyNutritionLogBatch(first, prepareNutritionLogBatch({ entries: [{ ...entry, id: 'unrelated' }], foods: [{ ...food, id: 'other-food' }] }));
    const updated = applyNutritionLogBatch(intervening, prepared);
    expect(updated.nutritionEntries).toHaveLength(2);
    expect(updated.savedFoods).toHaveLength(2);
    expect(updated.nutritionEntries?.find((value) => value.id === entry.id)).toMatchObject({ recordedAt, servings: 2, statedCalories: 178, savedMealInstanceId: 'breakfast-today' });
    expect(updated.savedFoods?.find((value) => value.id === food.id)?.createdAt).toBe(createdAt);
    expect(first.nutritionEntries![0].servings).toBe(1);
    expect(first.savedFoods![0].name).toBe('Oatmeal');
  });

  test('prepared snapshots do not share mutable nutrients with form inputs', () => {
    const input = { ...entry, nutrients: { ...nutrients } };
    const prepared = prepareNutritionLogBatch({ entries: [input], foods: [] });
    input.nutrients.carbsGrams = 100;
    expect(prepared.entries[0].nutrients.carbsGrams).toBe(34);
    expect(applyNutritionLogBatch(empty, prepared).nutritionEntries).toHaveLength(1);
  });

  test('reapplying the same prepared save cannot create duplicates', () => {
    const prepared = prepareNutritionLogBatch({ entries: [entry], foods: [food] });
    const once = applyNutritionLogBatch(empty, prepared);
    const twice = applyNutritionLogBatch(once, prepared);
    expect(twice.nutritionEntries).toEqual(once.nutritionEntries);
    expect(twice.savedFoods).toEqual(once.savedFoods);
    expect(() => prepareNutritionLogBatch({ entries: [entry, entry], foods: [] })).toThrow(/twice/i);
  });

  test('blank names, empty templates and invalid weights fail during synchronous preparation', () => {
    expect(() => prepareSavedMeal({ name: '   ', items: [item] })).toThrow(/name/i);
    expect(() => prepareSavedMeal({ name: 'Breakfast', items: [] })).toThrow(/at least one/i);
    expect(() => prepareSavedMeal({ name: 'Breakfast', items: [{ ...item, consumedAmount: 0 }] })).toThrow(/weight/i);
  });

  test('template edits preserve identity and creation date while leaving prior snapshots intact', () => {
    const initial = prepareSavedMeal({ name: 'Breakfast', items: [item] }, 'template');
    const prepared = prepareSavedMeal({ name: 'Fiber breakfast', items: [{ ...item, servings: 2, consumedAmount: 96 }] }, initial.id);
    const other = prepareSavedMeal({ name: 'Dinner', items: [item] }, 'other');
    const meals = applyPreparedSavedMeal([initial, other], prepared);
    expect(meals).toHaveLength(2);
    expect(meals.find((meal) => meal.id === initial.id)).toMatchObject({ name: 'Fiber breakfast', createdAt: initial.createdAt });
    expect(savedMealTotals(initial.items).calories).toBe(178);
    expect(savedMealTotals(meals.find((meal) => meal.id === initial.id)!.items).calories).toBe(356);
  });
});
