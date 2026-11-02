import { nutrientDefinition, toCanonicalNutrientAmount } from './nutrient-catalog';

export type SupplementLabelResult = {
  name: string | null;
  servingLabel: string | null;
  servingUnits: number | null;
  unitName: string | null;
  nutrients: { id: string; amount: number; unit: string }[];
  warnings: string[];
};

export function validateSupplementLabelResult(value: unknown): SupplementLabelResult {
  if (!value || typeof value !== 'object') throw new Error('The scanned label could not be read. Enter it manually.');
  const draft = value as Partial<SupplementLabelResult>;
  const nullableText = (text: unknown, max: number) => text === null || typeof text === 'string' && text.length <= max;
  if (!nullableText(draft.name, 100) || !nullableText(draft.servingLabel, 100)
    || !(draft.servingUnits === null || Number.isInteger(draft.servingUnits) && draft.servingUnits! > 0 && draft.servingUnits! <= 100)
    || !nullableText(draft.unitName, 30) || !Array.isArray(draft.warnings) || draft.warnings.some((warning) => typeof warning !== 'string' || warning.length > 300)
    || !Array.isArray(draft.nutrients) || draft.nutrients.length > 30
    || new Set(draft.nutrients.map((item) => item.id)).size !== draft.nutrients.length
    || draft.nutrients.some((item) => !nutrientDefinition(item.id) || !Number.isFinite(item.amount) || item.amount <= 0 || item.amount > 1_000_000 || !['g', 'mg', 'mcg', 'IU'].includes(item.unit))) {
    throw new Error('The scanned label needs manual review. No supplement was saved.');
  }
  return draft as SupplementLabelResult;
}

export function perUnitNutrients(label: SupplementLabelResult) {
  if (!label.servingUnits) return [];
  return label.nutrients.map((item) => ({
    nutrientId: item.id,
    amount: toCanonicalNutrientAmount(item.id, item.amount, item.unit) / label.servingUnits!,
    unit: nutrientDefinition(item.id)!.unit,
  }));
}
