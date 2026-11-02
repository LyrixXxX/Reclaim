import { Medication, NutritionEntry, TrackerState } from '@/models/tracker';
import { exactNutrientMatch, searchNutrients, toCanonicalNutrientAmount } from './nutrient-catalog';
import { migrateNutritionState, validateAiNutritionResult } from './nutrition';
import { effectiveNutrientSelections, nutrientTotalsForDate } from './nutrient-totals';
import { markSupplementDoseSkipped, recordSupplementDose, validateSupplementDraft } from './supplements';
import { createReclaimBackup, parseReclaimBackup } from './backup';

const supplement: Medication = {
  id: 'd', kind: 'supplement', name: 'D3 + magnesium', schedule: { type: 'as_needed', times: [] },
  remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-10-22T12:00:00Z',
  dosagePerUnit: 1, dosageUnit: 'capsule', defaultUnitsTaken: 1,
  nutrientProfile: [{ nutrientId: 'vitamin_d', amount: 2000, unit: 'IU' }, { nutrientId: 'magnesium', amount: 100, unit: 'mg' }],
};

test('catalog aliases, typo suggestions, and vitamin D unit conversion', () => {
  expect(searchNutrients('cholecalciferol')[0].item.id).toBe('vitamin_d');
  expect(exactNutrientMatch('Vitamin D3')?.id).toBe('vitamin_d');
  expect(searchNutrients('folte').some(({ item, uncertain }) => item.id === 'folate' && uncertain)).toBe(true);
  expect(toCanonicalNutrientAmount('vitamin_d', 2000, 'IU')).toBe(50);
  expect(toCanonicalNutrientAmount('magnesium', 1, 'g')).toBe(1000);
  expect(() => toCanonicalNutrientAmount('magnesium', 500, 'compound')).toThrow();
});

test('new supplements need dosage, but legacy edits remain valid', () => {
  expect(validateSupplementDraft({ name: 'D3', serving: '', notes: '', scheduleType: 'as_needed' })).toMatch(/positive amount/);
  expect(validateSupplementDraft({ id: 'legacy', name: 'D3', serving: '', notes: '', scheduleType: 'as_needed' })).toBeUndefined();
  expect(validateSupplementDraft({ id: 'legacy', name: 'D3', serving: '', notes: '', scheduleType: 'as_needed', nutrientProfile: [{ nutrientId: 'vitamin_d', amount: 2000, unit: 'IU' }] })).toMatch(/amount per unit/);
});

test('taken snapshots preserve formula, while Nutrition remains food-only', () => {
  const date = new Date(2026, 9, 22, 9);
  const first = recordSupplementDose([], supplement, 'one', 'taken', undefined, date, 2);
  expect(first[0].nutrientSnapshot).toEqual({ vitamin_d: 100, magnesium: 200 });
  const second = recordSupplementDose(first, { ...supplement, nutrientProfile: [{ nutrientId: 'magnesium', amount: 50, unit: 'mg' }] }, 'two', 'taken', undefined, date, 1);
  const skipped = recordSupplementDose(second, supplement, 'skip', 'skipped', undefined, date);
  expect(skipped[0].nutrientSnapshot).toBeUndefined();
  const food: NutritionEntry[] = [{ id: 'food-1', eventDate: '2026-10-22', recordedAt: '2026-10-22T12:00:00Z', updatedAt: '2026-10-22T12:00:00Z', mealGroupId: 'meal-lunch', mealLabel: 'Lunch', name: 'Food', servingLabel: '1 serving', servings: 2, source: 'manual', nutrients: { carbsGrams: 5, proteinGrams: 3, fatGrams: 1, fiberGrams: 0, extraNutrients: { magnesium: 10, sodium: 100, saturated_fat: 1, cholesterol: 20 } } }];
  expect(nutrientTotalsForDate(food, '2026-10-22')).toMatchObject({ sodium: 200, saturated_fat: 2, cholesterol: 40 });
  expect(nutrientTotalsForDate(food, '2026-10-22').magnesium).toBeUndefined();
  expect(nutrientTotalsForDate(food, '2026-10-22').fiber).toBeUndefined();
  const corrected = markSupplementDoseSkipped(skipped, new Set([supplement.id]), 'one', '2026-10-23T12:00:00Z');
  expect(corrected.find((event) => event.id === 'one')?.nutrientSnapshot).toBeUndefined();
  expect(nutrientTotalsForDate(food, '2026-10-22').sodium).toBe(200);
  expect(nutrientTotalsForDate(food, '2026-10-21').sodium).toBeUndefined();
});

test('migrates an existing fiber goal without changing older food', () => {
  const old = { trackers: [], checkIns: [], nutritionGoals: [{ id: 'goal', effectiveDate: '2026-10-01', recordedAt: '2026-10-01T00:00:00Z', carbsGrams: 200, proteinGrams: 100, fatGrams: 60, fiberGrams: 30 }] } as TrackerState;
  const next = migrateNutritionState(old);
  expect(next.nutritionGoals).toEqual(old.nutritionGoals);
  expect(effectiveNutrientSelections(next)).toMatchObject([{ nutrientId: 'fiber', state: 'goal', goalAmount: 30 }]);
});

test('backup preserves selected nutrients, supplement profiles, and dose snapshots', () => {
  const dose = recordSupplementDose([], supplement, 'event', 'taken', undefined, new Date(2026, 9, 22, 9), 2)[0];
  const state: TrackerState = { trackers: [], checkIns: [], medications: [supplement], medicationEvents: [dose], customNutrients: [{ id: 'custom-1', name: 'My nutrient', unit: 'mg' }], nutrientSelections: [{ nutrientId: 'vitamin_d', state: 'goal', goalType: 'minimum', goalAmount: 50, order: 0 }], preferences: { visibleSections: { goals: true, health: false, cpap: false, weight: true, nutrition: true, activity: false }, visibleHealthModules: { bloodPressure: false, medications: false, labs: false }, includeSupplementNutrientsInNutrition: true } };
  const restored = parseReclaimBackup(JSON.stringify(createReclaimBackup(state))).state;
  expect(restored.medicationEvents?.[0].nutrientSnapshot?.vitamin_d).toBe(100);
  expect(restored.medications?.[0].nutrientProfile?.[0].amount).toBe(2000);
  expect(restored.customNutrients).toEqual(state.customNutrients);
  expect(restored.nutrientSelections).toEqual(state.nutrientSelections);
});

test('AI label extras stay explicit and absent values stay unknown', () => {
  const response = validateAiNutritionResult({ schemaVersion: 1, warnings: [], items: [{ name: 'Food', servingLabel: '1 serving', nutrients: { carbsGrams: 4, proteinGrams: 2, fatGrams: 1, fiberGrams: 0, additionalNutrients: [{ id: 'sodium', amount: 120 }, { id: 'magnesium', amount: 30 }] }, confidence: 'high', assumptions: [] }] });
  expect(response.items[0].nutrients.extraNutrients).toEqual({ sodium: 120 });
  expect(response.items[0].nutrients.extraNutrients?.magnesium).toBeUndefined();
});
