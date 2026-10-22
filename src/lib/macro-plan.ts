import { macroCalories } from './nutrition';
import { requestPrivateAiRelay } from './nutrition-ai';

export type MacroPlanAnswers = {
  age: string; height: string; heightUnit: 'cm' | 'ft-in'; heightFeet: string; heightInches: string; weight: string; weightUnit: 'kg' | 'lb';
  activity: '' | 'low' | 'moderate' | 'high'; goal: '' | 'maintain' | 'lose' | 'gain';
  estimationBasis: '' | 'female' | 'male'; trainingFocus: '' | 'general' | 'strength';
  calorieSource: 'estimated' | 'user'; ownCalories: string;
  lossPace: 'gentle' | 'moderate' | 'faster'; lossPriority: 'fat-loss' | 'balanced' | 'performance';
  pregnantOrBreastfeeding: boolean; medicalDietaryNeeds: boolean; eligibleConfirmed: boolean;
};
export type MacroCalculation = { version: 2 | 3; restingCalories: number; maintenanceCalories: number; targetCalories: number; calorieSource: 'estimated' | 'user'; activityFactor: number; goalAdjustment: number; proteinFactor: number; proteinTargetGrams: number; proteinReferenceKg: number; trainingFocus: 'general' | 'strength'; lossPace?: 'gentle' | 'moderate' | 'faster'; lossPriority?: 'fat-loss' | 'balanced' | 'performance' };
export type MacroPlan = { carbsGrams: number; proteinGrams: number; fatGrams: number; fiberGrams: number; rationale: string; estimatedCalories: number; calculation: MacroCalculation };

// Conservative product guardrails, not a determination that an individual plan is safe.
export const LOSS_PACE = { gentle: { weeklyLb: 0.5, deficit: 250 }, moderate: { weeklyLb: 1, deficit: 500 }, faster: { weeklyLb: 1.5, deficit: 750 } } as const;
export const MACRO_LIMITS = { minCalories: 1500, maxCalories: 5000, maxDeficitFraction: 0.25, maxWeeklyWeightFraction: 0.01, minCarbsGrams: 100, fatFraction: 0.25 } as const;

export function previewMacroCalculation(input: ReturnType<typeof validateMacroAnswers>) {
  const resting = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + (input.estimationBasis === 'male' ? 5 : -161);
  const activityFactor = { low: 1.2, moderate: 1.375, high: 1.55 }[input.activity as 'low' | 'moderate' | 'high'];
  const maintenanceCalories = Math.round(resting * activityFactor / 10) * 10;
  const deficit = input.goal === 'lose' ? LOSS_PACE[input.lossPace].deficit : 0;
  const goalAdjustment = input.goal === 'lose' ? -deficit : input.goal === 'gain' ? 250 : 0;
  const targetCalories = input.calorieSource === 'user' ? input.ownCalories! : maintenanceCalories + goalAdjustment;
  const proteinReferenceKg = Math.min(input.weightKg, 30 * (input.heightCm / 100) ** 2);
  const proteinFactor = input.goal !== 'lose' ? input.trainingFocus === 'strength' ? 1.6 : 1.2 : input.trainingFocus === 'strength' ? input.lossPriority === 'fat-loss' ? 1.8 : 2 : 1.6;
  const proteinTargetGrams = Math.round(proteinReferenceKg * proteinFactor);
  if (input.goal === 'lose' && input.calorieSource === 'estimated') {
    if (deficit > maintenanceCalories * MACRO_LIMITS.maxDeficitFraction || LOSS_PACE[input.lossPace].weeklyLb > input.weightKg / 0.45359237 * MACRO_LIMITS.maxWeeklyWeightFraction) throw new Error('This pace is too fast for the estimated maintenance or body weight. Choose a slower pace or use manual targets.');
  }
  if (targetCalories < MACRO_LIMITS.minCalories || targetCalories > MACRO_LIMITS.maxCalories) throw new Error('This target falls outside the supported calorie range. Choose a slower pace or use manual targets and professional guidance.');
  if (input.calorieSource === 'user' && maintenanceCalories - targetCalories > maintenanceCalories * MACRO_LIMITS.maxDeficitFraction) throw new Error('Your entered target is much lower than estimated maintenance. Reclaim cannot validate it as a general-wellness starting point.');
  if (targetCalories < proteinTargetGrams * 4 + targetCalories * MACRO_LIMITS.fatFraction + MACRO_LIMITS.minCarbsGrams * 4) throw new Error('This target cannot fit the protein, fat, and carbohydrate starting minimums. Choose a slower pace or use manual targets.');
  return { restingCalories: Math.round(resting / 10) * 10, maintenanceCalories, targetCalories, goalAdjustment, proteinTargetGrams };
}

export function validateMacroAnswers(value: MacroPlanAnswers) {
  const age = Number(value.age);
  const heightCm = value.heightUnit === 'ft-in'
    ? (Number(value.heightFeet) * 12 + Number(value.heightInches)) * 2.54
    : Number(value.height);
  const weightKg = Number(value.weight) * (value.weightUnit === 'lb' ? 0.45359237 : 1);
  if (!Number.isInteger(age) || age < 18 || age > 100) throw new Error('AI macro plans are for adults ages 18–100. You can enter targets manually.');
  if (value.heightUnit === 'ft-in' && (!/^\d+$/.test(value.heightFeet) || !/^\d+$/.test(value.heightInches) || Number(value.heightInches) > 11)) throw new Error('Enter height in feet and inches (0–11).');
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 230) throw new Error('Enter a valid height.');
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) throw new Error('Enter a valid current weight.');
  if (value.pregnantOrBreastfeeding || value.medicalDietaryNeeds) throw new Error('This general-wellness planner is not suitable for pregnancy, breastfeeding, or medical dietary needs. Please use manual targets and consult a qualified professional.');
  if (!value.eligibleConfirmed) throw new Error('Confirm that this adult general-wellness planner is suitable for you, or use manual targets.');
  if (!['low', 'moderate', 'high'].includes(value.activity) || !['maintain', 'lose', 'gain'].includes(value.goal) || !['female', 'male'].includes(value.estimationBasis) || !['general', 'strength'].includes(value.trainingFocus)) throw new Error('Complete the activity, goal, training, and estimation-basis choices.');
  if (value.goal === 'lose' && (!['gentle', 'moderate', 'faster'].includes(value.lossPace) || !['fat-loss', 'balanced', 'performance'].includes(value.lossPriority))) throw new Error('Choose a weight-loss pace and priority.');
  const ownCalories = value.calorieSource === 'user' ? Number(value.ownCalories) : undefined;
  if (value.calorieSource === 'user' && (!/^\d+$/.test(value.ownCalories) || ownCalories === undefined || !Number.isFinite(ownCalories) || ownCalories < 1200 || ownCalories > 5000)) throw new Error('Enter a daily calorie target from 1,200 to 5,000, or use an estimate.');
  return { age, heightCm, weightKg, activity: value.activity, goal: value.goal, estimationBasis: value.estimationBasis, trainingFocus: value.trainingFocus, calorieSource: value.calorieSource, ownCalories, lossPace: value.lossPace, lossPriority: value.lossPriority };
}

export function validateMacroPlan(value: unknown, acceptUserEdits = false): MacroPlan {
  const plan = value as Partial<MacroPlan> | null;
  if (!plan || typeof plan !== 'object' || !['carbsGrams', 'proteinGrams', 'fatGrams', 'fiberGrams'].every((key) => {
    const number = plan[key as keyof MacroPlan]; return typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1000;
  }) || typeof plan.rationale !== 'string' || !plan.rationale.trim() || plan.rationale.length > 800 || typeof plan.estimatedCalories !== 'number' || !Number.isFinite(plan.estimatedCalories)) throw new Error('The suggested plan could not be validated. Try again or enter targets manually.');
  const result = plan as MacroPlan;
  const calories = macroCalories(result);
  const context = result.calculation;
  if (!context || ![2, 3].includes(context.version) || !['estimated', 'user'].includes(context.calorieSource) || !['general', 'strength'].includes(context.trainingFocus) || ![context.restingCalories, context.maintenanceCalories, context.targetCalories, context.activityFactor, context.proteinFactor, context.proteinTargetGrams, context.proteinReferenceKg].every((number) => typeof number === 'number' && Number.isFinite(number) && number >= 0) || ![-750, -500, -250, 0, 250].includes(context.goalAdjustment) || context.version === 3 && (!['gentle', 'moderate', 'faster'].includes(context.lossPace ?? '') || !['fat-loss', 'balanced', 'performance'].includes(context.lossPriority ?? ''))) throw new Error('The suggested plan is missing its calculation details. Try again after the AI service is updated.');
  if (calories < (context.version === 3 ? MACRO_LIMITS.minCalories : 1200) || calories > 5000 || Math.abs(calories - result.estimatedCalories) > 50) throw new Error('The suggested plan is inconsistent or below the supported calorie range. Try again or enter targets manually.');
  if (!acceptUserEdits && (Math.abs(result.estimatedCalories - context.targetCalories) > 1 || Math.abs(result.proteinGrams - context.proteinTargetGrams) > 5 || 9 * result.fatGrams / context.targetCalories < 0.25 || 9 * result.fatGrams / context.targetCalories > 0.35 || result.carbsGrams < 100)) throw new Error('The suggested plan did not meet its calculation guardrails. Try again or enter targets manually.');
  return result;
}

export async function requestMacroPlan(answers: MacroPlanAnswers) {
  const input = validateMacroAnswers(answers);
  previewMacroCalculation(input);
  const response = await requestPrivateAiRelay('/v1/plan-macros', { method: 'POST', body: JSON.stringify(input) });
  const plan = validateMacroPlan(await response.json());
  if (plan.calculation.version !== 3 || plan.calculation.lossPace !== answers.lossPace || plan.calculation.lossPriority !== answers.lossPriority) throw new Error('The AI service has not been updated for weight-loss pace yet. Use manual targets or try again later.');
  return plan;
}
