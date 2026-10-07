import { prepareNutritionLogBatch } from './nutrition';
import { requireNutritionMeal } from './nutrition-meal-selection';

const groups = ['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((name, sortOrder) => ({ id: name.toLowerCase(), name, sortOrder, builtIn: true, archived: false }));

test('never defaults to breakfast when no meal was selected', () => {
  expect(() => requireNutritionMeal(groups)).toThrow(/select a meal/i);
  expect(() => requireNutritionMeal(groups, 'missing')).toThrow();
  expect(() => requireNutritionMeal([], 'breakfast')).toThrow();
});

test.each(groups)('explicitly selects $name without changing the group list', (group) => {
  expect(requireNutritionMeal(groups, group.id)).toBe(group);
  expect(groups[0].id).toBe('breakfast');
});

test('the selected meal applies to every component while preserving the chosen date and nutrition', () => {
  const group = requireNutritionMeal(groups, 'dinner');
  const batch = prepareNutritionLogBatch({ foods: [], entries: ['Wrap', 'Yogurt'].map((name, index) => ({
    id: `entry-${index}`, name, eventDate: '2026-09-22', mealGroupId: group.id, mealLabel: group.name,
    servingLabel: '1 portion', servings: 1, source: 'manual',
    nutrients: { carbsGrams: 34, proteinGrams: 72, fatGrams: 37, fiberGrams: 22 }, statedCalories: 678,
  })) });
  expect(batch.entries).toHaveLength(2);
  for (const entry of batch.entries) expect(entry).toMatchObject({ mealGroupId: 'dinner', mealLabel: 'Dinner', eventDate: '2026-09-22', statedCalories: 678 });
});
