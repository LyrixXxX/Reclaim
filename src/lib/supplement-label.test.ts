import { perUnitNutrients, validateSupplementLabelResult } from './supplement-label';
import { searchSupplements } from './supplement-catalog';

test('catalog supplies matches without making up amounts', () => {
  expect(searchSupplements('vitamin d')[0]).toMatchObject({ nutrientIds: ['vitamin_d'] });
  expect(searchSupplements('creatine')[0]).toMatchObject({ nutrientIds: [] });
});

test('label amounts are converted from printed serving to one unit', () => {
  const result = validateSupplementLabelResult({ name: 'D3', servingLabel: '2 capsules', servingUnits: 2, unitName: 'capsule', nutrients: [{ id: 'vitamin_d', amount: 2000, unit: 'IU' }, { id: 'magnesium', amount: 100, unit: 'mg' }], warnings: [] });
  expect(perUnitNutrients(result)).toEqual([{ nutrientId: 'vitamin_d', amount: 25, unit: 'mcg' }, { nutrientId: 'magnesium', amount: 50, unit: 'mg' }]);
});

test('unknown serving count never invents a per-unit amount', () => {
  const result = validateSupplementLabelResult({ name: null, servingLabel: '1 scoop', servingUnits: null, unitName: 'scoop', nutrients: [{ id: 'magnesium', amount: 100, unit: 'mg' }], warnings: [] });
  expect(perUnitNutrients(result)).toEqual([]);
});

test('unsupported label units are not silently credited', () => {
  const result = validateSupplementLabelResult({ name: null, servingLabel: '1 capsule', servingUnits: 1, unitName: 'capsule', nutrients: [{ id: 'vitamin_a', amount: 1000, unit: 'IU' }], warnings: [] });
  expect(() => perUnitNutrients(result)).toThrow();
});

test('rejects duplicate or invalid nutrient amounts', () => {
  const base = { name: null, servingLabel: null, servingUnits: 1, unitName: 'tablet', warnings: [] };
  expect(() => validateSupplementLabelResult({ ...base, nutrients: [{ id: 'vitamin_d', amount: 0, unit: 'mcg' }] })).toThrow();
  expect(() => validateSupplementLabelResult({ ...base, nutrients: [{ id: 'vitamin_d', amount: 2, unit: 'mcg' }, { id: 'vitamin_d', amount: 3, unit: 'mcg' }] })).toThrow();
});
