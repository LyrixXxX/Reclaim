import { NutritionEntry, NutrientSelection, TrackerState } from '@/models/tracker';
import { FOOD_EXTRA_NUTRIENT_IDS, nutrientDefinition } from './nutrient-catalog';

export function effectiveNutrientSelections(state: TrackerState): NutrientSelection[] {
  if (state.nutrientSelections) return state.nutrientSelections;
  const fiberGoal = [...(state.nutritionGoals ?? [])].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.fiberGrams;
  return fiberGoal && fiberGoal > 0 ? [{ nutrientId: 'fiber', state: 'goal', goalType: 'minimum', goalAmount: fiberGoal, order: 0 }] : [];
}

export function foodNutrientValues(entry: NutritionEntry): Record<string, number> {
  const { nutrients, servings } = entry;
  const values: Record<string, number> = { carbs: nutrients.carbsGrams * servings, protein: nutrients.proteinGrams * servings, fat: nutrients.fatGrams * servings };
  if (nutrients.fiberGrams > 0 || nutrients.extraNutrients?.fiber !== undefined) values.fiber = nutrients.fiberGrams * servings;
  for (const id of FOOD_EXTRA_NUTRIENT_IDS) {
    const amount = nutrients.extraNutrients?.[id];
    if (amount !== undefined) values[id] = amount * servings;
  }
  return values;
}

export function nutrientTotalsForDate(entries: NutritionEntry[], date: string) {
  const food: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.eventDate !== date) continue;
    for (const [id, amount] of Object.entries(foodNutrientValues(entry))) {
      if (Number.isFinite(amount) && amount >= 0) food[id] = (food[id] ?? 0) + amount;
    }
  }
  return food;
}

export function validateNutrientSelection(selection: NutrientSelection, state: TrackerState) {
  if (!nutrientDefinition(selection.nutrientId, state.customNutrients)) throw new Error('Choose a known nutrient.');
  if (selection.state === 'goal' && (!Number.isFinite(selection.goalAmount) || selection.goalAmount! <= 0)) throw new Error('Enter a goal above zero.');
  if (selection.state === 'goal' && !['minimum', 'maximum', 'target'].includes(selection.goalType ?? '')) throw new Error('Choose a goal type.');
}
