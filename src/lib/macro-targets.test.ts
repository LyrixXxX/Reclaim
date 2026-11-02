import { NutritionGoalProfile } from '@/models/tracker';
import { calculateMacroSplit, carbsForTarget, macroTargetRatio, suggestedMacroUpdate, weightPounds } from './macro-targets';
import { hasMacroTargets, nutritionCalorieTarget, upsertNutritionGoal } from './nutrition';

const goal: NutritionGoalProfile = {
  id: 'g', effectiveDate: '2026-10-30', recordedAt: '2026-10-30T12:00:00Z',
  calorieTarget: 2400, carbsGrams: 215, proteinGrams: 160, fatGrams: 100, fiberGrams: 0,
  fitnessGoal: 'fat-loss', macroMethod: 'calculated', macroTargetsEnabled: true,
  calculation: { sourceWeightLb: 200, referenceWeightLb: 190, heightCm: 175 },
};

describe('calorie-first macro targets', () => {
  test('preserves legacy macro-derived goals and saves a calories-only dated goal', () => {
    const legacy = { ...goal, calorieTarget: undefined, macroMethod: undefined, macroTargetsEnabled: undefined, calculation: undefined };
    expect(nutritionCalorieTarget(legacy)).toBe(2400);
    expect(hasMacroTargets(legacy)).toBe(true);
    const saved = upsertNutritionGoal([legacy], { effectiveDate: '2026-10-31', calorieTarget: 2100, macroTargetsEnabled: false, macroMethod: 'manual', carbsGrams: 0, proteinGrams: 0, fatGrams: 0, fiberGrams: 0 });
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(legacy);
    expect(nutritionCalorieTarget(saved[1])).toBe(2100);
    expect(hasMacroTargets(saved[1])).toBe(false);
  });
  test('converts kg and applies a height-based protein reference cap', () => {
    expect(weightPounds(90.718474, 'kg')).toBeCloseTo(200, 3);
    const split = calculateMacroSplit({ calorieTarget: 2400, weightLb: 294, heightCm: 178, goal: 'fat-loss' });
    expect(split.referenceWeightLb).toBeCloseTo(209.5, 0);
    expect(split.proteinGrams).toBe(Math.round(split.referenceWeightLb * 1.1));
    expect(split.fatGrams).toBe(Math.round(294 * .3));
    expect(split.carbsGrams).toBe(Math.round((2400 - split.proteinGrams * 4 - split.fatGrams * 9) / 4));
    expect(Math.abs(split.macroCalories - 2400)).toBeLessThanOrEqual(2);
    expect(calculateMacroSplit({ calorieTarget: 2400, weightLb: 200, heightCm: 178, goal: 'muscle-gain' }).proteinGrams).toBe(180);
    expect(calculateMacroSplit({ calorieTarget: 2400, weightLb: 200, heightCm: 178, goal: 'maintenance' }).proteinGrams).toBe(160);
  });
  test('rejects an impossible split instead of inventing negative carbs', () => {
    expect(() => calculateMacroSplit({ calorieTarget: 800, weightLb: 400, heightCm: 170, goal: 'fat-loss' })).toThrow(/no carbohydrate target/i);
    expect(() => carbsForTarget(1000, 300, 60)).toThrow(/no carbohydrate target/i);
  });
  test('rounds displayed percentages to exactly 100 with carbs absorbing the remainder', () => {
    const ratio = macroTargetRatio('201', '183', '77')!;
    expect(ratio.protein + ratio.carbs + ratio.fat).toBe(100);
    expect(ratio.carbs).toBe(100 - ratio.protein - ratio.fat);
    expect(macroTargetRatio('', '20', '10')).toBeNull();
    const twoMacros = macroTargetRatio('0', '101', '22')!;
    expect(twoMacros.carbs).toBeGreaterThanOrEqual(0);
    expect(twoMacros.protein + twoMacros.carbs + twoMacros.fat).toBe(100);
  });
  test('offers a weight update only for active calculated loss/gain profiles at 2%', () => {
    const entry = { date: '2026-10-31', weight: 204, unit: 'lb' as const };
    expect(suggestedMacroUpdate(goal, entry, '2026-10-31')).toBe(true);
    expect(suggestedMacroUpdate(goal, { ...entry, weight: 203 }, '2026-10-31')).toBe(false);
    expect(suggestedMacroUpdate(goal, entry, '2026-10-31', 204)).toBe(false);
    expect(suggestedMacroUpdate(goal, { ...entry, date: '2026-10-20' }, '2026-10-31')).toBe(false);
    expect(suggestedMacroUpdate({ ...goal, fitnessGoal: 'maintenance' }, entry, '2026-10-31')).toBe(false);
    expect(suggestedMacroUpdate({ ...goal, macroMethod: 'manual' }, entry, '2026-10-31')).toBe(false);
  });
});
