import { NutritionGoalProfile, WeightEntry } from '@/models/tracker';
import { macroCalories, nutritionCalorieTarget } from './nutrition';

export type FitnessGoal = NonNullable<NutritionGoalProfile['fitnessGoal']>;
const POUNDS_PER_KG = 2.2046226218;

export function weightPounds(weight: number, unit: 'lb' | 'kg') {
  return unit === 'kg' ? weight * POUNDS_PER_KG : weight;
}

export function referenceWeightPounds(actualWeightLb: number, heightCm: number) {
  if (!Number.isFinite(actualWeightLb) || actualWeightLb <= 0 || !Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) throw new Error('Enter a valid weight and height to calculate a split.');
  return Math.min(actualWeightLb, 30 * (heightCm / 100) ** 2 * POUNDS_PER_KG);
}

export function carbsForTarget(calorieTarget: number, proteinGrams: number, fatGrams: number) {
  if (![calorieTarget, proteinGrams, fatGrams].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Enter valid calorie, protein, and fat amounts.');
  const remaining = calorieTarget - proteinGrams * 4 - fatGrams * 9;
  if (remaining < 0) throw new Error('Protein and fat use more than the calorie target. Increase calories or lower those amounts; no carbohydrate target can fit.');
  return Math.round(remaining / 4);
}

export function macroTargetRatio(carbs: string, protein: string, fat: string) {
  const fields = [carbs, protein, fat];
  if (fields.some((field) => !/^\d+(?:\.\d+)?$/.test(field.trim()))) return null;
  const grams = fields.map(Number);
  if (grams.some((value) => !Number.isFinite(value) || value < 0 || value > 1000)) return null;
  const calories = grams[0] * 4 + grams[1] * 4 + grams[2] * 9;
  if (calories <= 0) return null;
  const proteinPercent = Math.round(grams[1] * 4 / calories * 100);
  const fatPercent = Math.min(Math.round(grams[2] * 9 / calories * 100), 100 - proteinPercent);
  return { calories, protein: proteinPercent, fat: fatPercent, carbs: 100 - proteinPercent - fatPercent };
}

export function calculateMacroSplit(input: { calorieTarget: number; weightLb: number; heightCm: number; goal: FitnessGoal }) {
  const { calorieTarget, weightLb, heightCm, goal } = input;
  if (!Number.isInteger(calorieTarget) || calorieTarget < 1 || calorieTarget > 10000) throw new Error('Enter a calorie target from 1 to 10,000 kcal.');
  const referenceWeightLb = referenceWeightPounds(weightLb, heightCm);
  const factor = goal === 'fat-loss' ? 1.1 : goal === 'muscle-gain' ? 0.9 : 0.8;
  const proteinGrams = Math.round(referenceWeightLb * factor);
  const fatGrams = Math.round(Math.max(calorieTarget * 0.25 / 9, weightLb * 0.3));
  const carbsGrams = carbsForTarget(calorieTarget, proteinGrams, fatGrams);
  return { proteinGrams, fatGrams, carbsGrams, referenceWeightLb: Math.round(referenceWeightLb * 10) / 10,
    macroCalories: macroCalories({ proteinGrams, fatGrams, carbsGrams, fiberGrams: 0 }) };
}

export function suggestedMacroUpdate(goal: NutritionGoalProfile | undefined, entry: Pick<WeightEntry, 'weight' | 'unit' | 'date'>, today: string, dismissedWeightLb?: number) {
  if (!goal || goal.macroMethod !== 'calculated' || !goal.calculation || goal.fitnessGoal === 'maintenance' || !goal.fitnessGoal || entry.date !== today) return false;
  const weightLb = weightPounds(entry.weight, entry.unit);
  if (!Number.isFinite(weightLb) || weightLb <= 0 || nutritionCalorieTarget(goal) <= 0) return false;
  const baseline = dismissedWeightLb ?? goal.calculation.sourceWeightLb;
  return Math.abs(weightLb - baseline) / baseline >= 0.02;
}
