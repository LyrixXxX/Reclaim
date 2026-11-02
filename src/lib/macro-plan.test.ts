import { createLocalMacroPlan, macroEnergyRatio, macroPlannerSafetyConfirmed, previewMacroCalculation, validateMacroAnswers, validateMacroPlan, withEstimationBasis } from './macro-plan';

const answers = { age: '35', height: '', heightFeet: '5', heightInches: '10', heightUnit: 'ft-in' as const, weight: '180', weightUnit: 'lb' as const, activity: 'moderate' as const, goal: 'maintain' as const, estimationBasis: 'male' as const, trainingFocus: 'strength' as const, calorieSource: 'estimated' as const, ownCalories: '', lossPace: 'moderate' as const, lossPriority: 'balanced' as const, pregnantOrBreastfeeding: false, medicalDietaryNeeds: false, eligibleConfirmed: true };

test('validates adult inputs and converts lb and inches', () => {
  expect(validateMacroAnswers(answers)).toMatchObject({ age: 35, heightCm: 177.8, weightKg: 81.6466266 });
  expect(validateMacroAnswers({ ...answers, height: '177.8', heightUnit: 'cm', weight: '81.6466266', weightUnit: 'kg' }).weightKg).toBeCloseTo(81.6466266);
  expect(() => validateMacroAnswers({ ...answers, heightInches: '12' })).toThrow(/feet and inches/i);
  expect(validateMacroAnswers({ ...answers, calorieSource: 'user', ownCalories: '2400' }).ownCalories).toBe(2400);
  expect(() => validateMacroAnswers({ ...answers, calorieSource: 'user', ownCalories: '999' })).toThrow(/calorie target/i);
});

test('rejects underage, medical needs, and an unchosen estimation basis', () => {
  expect(() => validateMacroAnswers({ ...answers, age: '17' })).toThrow(/adults/i);
  expect(() => validateMacroAnswers({ ...answers, medicalDietaryNeeds: true })).toThrow(/not suitable/i);
  expect(() => validateMacroAnswers({ ...answers, pregnantOrBreastfeeding: true })).toThrow(/not suitable/i);
  expect(() => validateMacroAnswers({ ...answers, estimationBasis: '' })).toThrow(/complete/i);
  expect(() => validateMacroAnswers({ ...answers, trainingFocus: '' })).toThrow(/complete/i);
  expect(() => validateMacroAnswers({ ...answers, eligibleConfirmed: false })).toThrow(/confirm/i);
});

test('male selection clears a previous pregnancy answer while female retains it', () => {
  const female = withEstimationBasis({ ...answers, estimationBasis: 'female', pregnantOrBreastfeeding: true }, 'female');
  expect(female.pregnantOrBreastfeeding).toBe(true);
  expect(() => validateMacroAnswers(female)).toThrow(/not suitable/i);
  const male = withEstimationBasis(female, 'male');
  expect(male.pregnantOrBreastfeeding).toBe(false);
  expect(male.estimationBasis).toBe('male');
  expect(withEstimationBasis(male, 'female').pregnantOrBreastfeeding).toBe(false);
});

test('calculate action requires confirmation and no safety exclusions', () => {
  expect(macroPlannerSafetyConfirmed(answers)).toBe(true);
  expect(macroPlannerSafetyConfirmed({ ...answers, eligibleConfirmed: false })).toBe(false);
  expect(macroPlannerSafetyConfirmed({ ...answers, pregnantOrBreastfeeding: true })).toBe(false);
  expect(macroPlannerSafetyConfirmed({ ...answers, medicalDietaryNeeds: true })).toBe(false);
  expect(macroPlannerSafetyConfirmed({ ...answers, pregnantOrBreastfeeding: true, medicalDietaryNeeds: true })).toBe(false);
});

test('validates AI macro arithmetic and rejects malformed output', () => {
  const plan = { carbsGrams: 250, proteinGrams: 150, fatGrams: 80, fiberGrams: 30, rationale: 'A moderate starting point.', estimatedCalories: 2320, calculation: { version: 2 as const, restingCalories: 1800, maintenanceCalories: 2570, targetCalories: 2320, calorieSource: 'estimated' as const, activityFactor: 1.375, goalAdjustment: -250, proteinFactor: 1.8, proteinTargetGrams: 150, proteinReferenceKg: 82, trainingFocus: 'strength' as const } };
  expect(validateMacroPlan(plan).carbsGrams).toBe(250);
  expect(() => validateMacroPlan({ ...plan, fatGrams: -5 })).toThrow(/could not be validated/i);
  expect(() => validateMacroPlan({ ...plan, estimatedCalories: 3000 })).toThrow(/inconsistent/i);
  expect(() => validateMacroPlan({ ...plan, proteinGrams: 100, carbsGrams: 300 })).toThrow(/guardrails/i);
  expect(validateMacroPlan({ ...plan, proteinGrams: 100, carbsGrams: 300 }, true).proteinGrams).toBe(100);
});

test('loss pace changes the estimate while maintain and gain ignore the pace', () => {
  const input = { ...answers, weight: '294', goal: 'lose' as const };
  const gentle = previewMacroCalculation(validateMacroAnswers({ ...input, lossPace: 'gentle' }));
  const moderate = previewMacroCalculation(validateMacroAnswers(input));
  const faster = previewMacroCalculation(validateMacroAnswers({ ...input, lossPace: 'faster' }));
  expect(gentle.targetCalories - moderate.targetCalories).toBe(250);
  expect(moderate.targetCalories - faster.targetCalories).toBe(250);
  expect(moderate.goalAdjustment).toBe(-500);
  expect(previewMacroCalculation(validateMacroAnswers({ ...answers, lossPace: 'faster' })).goalAdjustment).toBe(0);
  expect(previewMacroCalculation(validateMacroAnswers({ ...answers, goal: 'gain', lossPace: 'faster' })).goalAdjustment).toBe(250);
});

test('rejects a fast pace for a smaller adult but allows a slower one', () => {
  const input = { ...answers, goal: 'lose' as const, weight: '155', activity: 'low' as const, estimationBasis: 'female' as const };
  expect(() => previewMacroCalculation(validateMacroAnswers({ ...input, lossPace: 'faster' }))).toThrow(/slower pace/i);
  expect(() => previewMacroCalculation(validateMacroAnswers({ ...input, lossPace: 'gentle' }))).not.toThrow();
});

test('strength priority preserves higher protein without scaling to all excess body weight', () => {
  const input = { ...answers, goal: 'lose' as const, weight: '294', lossPace: 'faster' as const };
  const balanced = previewMacroCalculation(validateMacroAnswers(input));
  const fatLoss = previewMacroCalculation(validateMacroAnswers({ ...input, lossPriority: 'fat-loss' }));
  expect(balanced.proteinTargetGrams).toBeGreaterThan(fatLoss.proteinTargetGrams);
  expect(balanced.proteinTargetGrams).toBeLessThan(220);
  expect(balanced.targetCalories).toBeGreaterThanOrEqual(1500);
  expect(previewMacroCalculation(validateMacroAnswers({ ...input, calorieSource: 'user', ownCalories: '2400' })).targetCalories).toBe(2400);
});

test('rejects calorie targets that cannot fit macro starting minimums', () => {
  const input = { ...answers, goal: 'lose' as const, age: '20', heightFeet: '7', heightInches: '6', weight: '600', activity: 'low' as const, calorieSource: 'user' as const, ownCalories: '1500' };
  expect(() => previewMacroCalculation(validateMacroAnswers(input))).toThrow(/minimums|much lower/i);
});

test('local plans match the estimated calories closely without a relay request', () => {
  for (const goal of ['maintain', 'lose', 'gain'] as const) {
    const input = { ...answers, weight: '294', goal };
    const plan = createLocalMacroPlan(input);
    expect(Math.abs(plan.estimatedCalories - plan.calculation.targetCalories)).toBeLessThanOrEqual(4);
    expect(plan.proteinGrams).toBe(plan.calculation.proteinTargetGrams);
    expect(plan.fatGrams * 9 / plan.estimatedCalories).toBeGreaterThanOrEqual(0.25);
    expect(plan.fatGrams * 9 / plan.estimatedCalories).toBeLessThanOrEqual(0.35);
  }
  const own = createLocalMacroPlan({ ...answers, weight: '294', goal: 'lose', calorieSource: 'user', ownCalories: '2400' });
  expect(own.calculation.targetCalories).toBe(2400);
  expect(createLocalMacroPlan({ ...answers, height: '177.8', heightUnit: 'cm', weight: '81.6466266', weightUnit: 'kg' }).calculation.targetCalories).toBe(createLocalMacroPlan(answers).calculation.targetCalories);
});

test('local plans retain adult and pace safeguards', () => {
  expect(() => createLocalMacroPlan({ ...answers, age: '17' })).toThrow(/adults/i);
  expect(() => createLocalMacroPlan({ ...answers, medicalDietaryNeeds: true })).toThrow(/not suitable/i);
  expect(() => createLocalMacroPlan({ ...answers, pregnantOrBreastfeeding: true })).toThrow(/not suitable/i);
  expect(() => createLocalMacroPlan({ ...answers, goal: 'lose', weight: '155', activity: 'low', estimationBasis: 'female', lossPace: 'faster' })).toThrow(/slower pace/i);
});

test('local loss paces and advanced focus change the suggestion without changing inputs', () => {
  const input = { ...answers, weight: '294', goal: 'lose' as const };
  const gentle = createLocalMacroPlan({ ...input, lossPace: 'gentle' });
  const moderate = createLocalMacroPlan({ ...input, lossPace: 'moderate' });
  const faster = createLocalMacroPlan({ ...input, lossPace: 'faster' });
  expect(gentle.calculation.targetCalories).toBeGreaterThan(moderate.calculation.targetCalories);
  expect(moderate.calculation.targetCalories).toBeGreaterThan(faster.calculation.targetCalories);
  const strength = createLocalMacroPlan({ ...input, trainingFocus: 'strength', lossPriority: 'performance' });
  const general = createLocalMacroPlan({ ...input, trainingFocus: 'general' });
  expect(strength.proteinGrams).toBeGreaterThan(general.proteinGrams);
  expect(input.lossPace).toBe('moderate');
});

test('energy ratios use 4/4/9 and display a complete 100 percent', () => {
  expect(macroEnergyRatio('210', '210', '80')).toEqual({ calories: 2400, carbs: 35, protein: 35, fat: 30 });
  const rounded = macroEnergyRatio('201', '183', '77')!;
  expect(rounded.carbs + rounded.protein + rounded.fat).toBe(100);
  expect(macroEnergyRatio('', '20', '10')).toBeNull();
  expect(macroEnergyRatio('0', '0', '0')).toBeNull();
  expect(macroEnergyRatio('bad', '20', '10')).toBeNull();
});
