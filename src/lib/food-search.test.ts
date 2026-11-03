import { NutritionEntry, NutritionMealGroup, SavedFood, SavedMeal } from '@/models/tracker';
import { foodMatchRank, recentFoodChoices, searchFoodChoices, suggestedMealGroupId } from './food-search';

const nutrients = { carbsGrams: 27, proteinGrams: 1, fatGrams: 0, fiberGrams: 3 };
const entry = (id: string, name: string, recordedAt: string, extra: Partial<NutritionEntry> = {}): NutritionEntry => ({ id, eventDate: recordedAt.slice(0, 10), recordedAt, updatedAt: recordedAt, mealGroupId: 'meal-breakfast', mealLabel: 'Breakfast', name, servingLabel: '1 medium', servings: 1, nutrients, source: 'manual', ...extra });
const food = (id: string, name: string): SavedFood => ({ id, name, servingLabel: '1 cup', nutrients, source: 'manual', createdAt: '2026-11-01', updatedAt: '2026-11-01' });
const groups: NutritionMealGroup[] = ['breakfast', 'lunch', 'dinner', 'snacks'].map((name, index) => ({ id: `meal-${name}`, name, sortOrder: index, builtIn: true, archived: false }));

describe('food search', () => {
  test('ranks name starts above word starts and loose matches', () => {
    expect(foodMatchRank('Banana', 'ban')).toBe(0);
    expect(foodMatchRank('Greek yogurt', 'yog')).toBe(1);
    expect(foodMatchRank('Grilled chicken rice bowl', 'chick bowl')).toBe(2);
    expect(foodMatchRank('Oats', 'rice')).toBe(-1);
  });

  test('recent foods are distinct and newest first, keeping the last amount', () => {
    const recents = recentFoodChoices([
      entry('a', 'Banana', '2026-11-01T08:00:00Z'),
      entry('b', 'Banana', '2026-11-02T08:00:00Z', { servings: 2 }),
      entry('c', 'Oats', '2026-11-03T08:00:00Z'),
    ]);
    expect(recents.map((item) => item.name)).toEqual(['Oats', 'Banana']);
    expect(recents[1].servings).toBe(2);
    expect(recents[1].calories).toBe(112);
  });

  test('search mixes recents, saved foods and meals without duplicating a saved food', () => {
    const recents = recentFoodChoices([entry('a', 'Rice bowl', '2026-11-02T12:00:00Z', { foodId: 'f1' }), entry('b', 'Brown rice', '2026-11-02T12:00:00Z')]);
    const meals: SavedMeal[] = [{ id: 'm1', name: 'Rice night', items: [], createdAt: '2026-11-01', updatedAt: '2026-11-01' } as SavedMeal];
    const results = searchFoodChoices('rice', [food('f1', 'Rice bowl')], meals, recents);
    expect(results.map((item) => `${item.kind}:${item.name}`)).toEqual(['food:Rice bowl', 'meal:Rice night', 'recent:Brown rice']);
  });

  test('suggests the meal for the time of day', () => {
    const at = (hour: number, minute = 0) => new Date(2026, 10, 3, hour, minute);
    expect(suggestedMealGroupId(groups, at(7))).toBe('meal-breakfast');
    expect(suggestedMealGroupId(groups, at(12))).toBe('meal-lunch');
    expect(suggestedMealGroupId(groups, at(16))).toBe('meal-snacks');
    expect(suggestedMealGroupId(groups, at(19))).toBe('meal-dinner');
    expect(suggestedMealGroupId(groups, at(23))).toBe('meal-snacks');
  });
});
