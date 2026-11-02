import { CustomNutrient } from '@/models/tracker';

export type NutrientDefinition = { id: string; name: string; unit: string; category: string; aliases?: string[] };

export const NUTRIENT_CATALOG: NutrientDefinition[] = [
  { id: 'calories', name: 'Calories', unit: 'kcal', category: 'Energy' },
  { id: 'protein', name: 'Protein', unit: 'g', category: 'Macros' },
  { id: 'carbs', name: 'Carbohydrates', unit: 'g', category: 'Macros', aliases: ['carbs'] },
  { id: 'fat', name: 'Fat', unit: 'g', category: 'Macros' },
  { id: 'fiber', name: 'Fiber', unit: 'g', category: 'Other', aliases: ['fibre', 'dietary fiber'] },
  { id: 'sugars', name: 'Total sugars', unit: 'g', category: 'Other', aliases: ['sugar'] },
  { id: 'added_sugars', name: 'Added sugars', unit: 'g', category: 'Other' },
  { id: 'saturated_fat', name: 'Saturated fat', unit: 'g', category: 'Other' },
  { id: 'trans_fat', name: 'Trans fat', unit: 'g', category: 'Other' },
  { id: 'cholesterol', name: 'Cholesterol', unit: 'mg', category: 'Other' },
  { id: 'sodium', name: 'Sodium', unit: 'mg', category: 'Minerals' },
  { id: 'potassium', name: 'Potassium', unit: 'mg', category: 'Minerals' },
  { id: 'calcium', name: 'Calcium', unit: 'mg', category: 'Minerals' },
  { id: 'magnesium', name: 'Magnesium', unit: 'mg', category: 'Minerals' },
  { id: 'iron', name: 'Iron', unit: 'mg', category: 'Minerals' },
  { id: 'zinc', name: 'Zinc', unit: 'mg', category: 'Minerals' },
  { id: 'selenium', name: 'Selenium', unit: 'mcg', category: 'Minerals' },
  { id: 'iodine', name: 'Iodine', unit: 'mcg', category: 'Minerals' },
  { id: 'vitamin_a', name: 'Vitamin A', unit: 'mcg', category: 'Vitamins' },
  { id: 'vitamin_c', name: 'Vitamin C', unit: 'mg', category: 'Vitamins', aliases: ['ascorbic acid'] },
  { id: 'vitamin_d', name: 'Vitamin D', unit: 'mcg', category: 'Vitamins', aliases: ['vitamin d3', 'cholecalciferol', 'd3'] },
  { id: 'vitamin_e', name: 'Vitamin E', unit: 'mg', category: 'Vitamins' },
  { id: 'vitamin_k', name: 'Vitamin K', unit: 'mcg', category: 'Vitamins', aliases: ['k2'] },
  { id: 'thiamin', name: 'Thiamin (B1)', unit: 'mg', category: 'Vitamins', aliases: ['vitamin b1', 'thiamine'] },
  { id: 'riboflavin', name: 'Riboflavin (B2)', unit: 'mg', category: 'Vitamins', aliases: ['vitamin b2'] },
  { id: 'niacin', name: 'Niacin (B3)', unit: 'mg', category: 'Vitamins', aliases: ['vitamin b3'] },
  { id: 'vitamin_b6', name: 'Vitamin B6', unit: 'mg', category: 'Vitamins', aliases: ['pyridoxine'] },
  { id: 'folate', name: 'Folate (B9)', unit: 'mcg', category: 'Vitamins', aliases: ['folate', 'vitamin b9', 'folic acid'] },
  { id: 'vitamin_b12', name: 'Vitamin B12', unit: 'mcg', category: 'Vitamins', aliases: ['cobalamin', 'b12'] },
  { id: 'choline', name: 'Choline', unit: 'mg', category: 'Other' },
  { id: 'caffeine', name: 'Caffeine', unit: 'mg', category: 'Other' },
  { id: 'omega_3', name: 'Omega-3', unit: 'mg', category: 'Fats', aliases: ['omega 3', 'fish oil omega 3'] },
  { id: 'epa', name: 'EPA', unit: 'mg', category: 'Fats', aliases: ['eicosapentaenoic acid'] },
  { id: 'dha', name: 'DHA', unit: 'mg', category: 'Fats', aliases: ['docosahexaenoic acid'] },
];

export const POPULAR_NUTRIENT_IDS = ['fiber', 'sodium', 'potassium', 'calcium', 'magnesium', 'iron', 'vitamin_c', 'vitamin_d', 'vitamin_b12', 'omega_3'];
export const FOOD_EXTRA_NUTRIENT_IDS = ['cholesterol', 'sodium', 'saturated_fat'] as const;

export function nutrientDefinition(id: string, custom: CustomNutrient[] = []) {
  return NUTRIENT_CATALOG.find((item) => item.id === id) ?? custom.find((item) => item.id === id);
}

const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
export function exactNutrientMatch(query: string, custom: CustomNutrient[] = []) {
  const term = normalize(query);
  return term ? [...NUTRIENT_CATALOG, ...custom].find((item) => [item.name, ...(('aliases' in item && Array.isArray(item.aliases)) ? item.aliases : [])].some((name) => normalize(name) === term)) : undefined;
}
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = old; }
  }
  return row[b.length];
}

export function searchNutrients(query: string, custom: CustomNutrient[] = []) {
  const term = normalize(query);
  const all = [...NUTRIENT_CATALOG, ...custom];
  if (!term) return all.filter((item) => POPULAR_NUTRIENT_IDS.includes(item.id)).map((item) => ({ item, uncertain: false }));
  return all.flatMap((item) => {
    const names = [item.name, ...(('aliases' in item && Array.isArray(item.aliases)) ? item.aliases : [])].map(normalize);
    const exact = names.some((name) => name === term || name.includes(term));
    const score = Math.min(...names.map((name) => distance(term, name)));
    const fuzzy = !exact && term.length >= 3 && score <= (term.length >= 6 ? 2 : 1);
    return exact || fuzzy ? [{ item, uncertain: fuzzy, score: exact ? 0 : score }] : [];
  }).sort((a, b) => a.score - b.score).slice(0, 12).map(({ item, uncertain }) => ({ item, uncertain }));
}

export function toCanonicalNutrientAmount(id: string, amount: number, unit: string, custom: CustomNutrient[] = []) {
  const definition = nutrientDefinition(id, custom);
  if (!definition || !Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid nutrient amount.');
  const from = unit.toLowerCase().replace('μ', 'µ');
  const target = definition.unit.toLowerCase();
  if (from === target) return amount;
  if (id === 'vitamin_d' && from === 'iu' && target === 'mcg') return amount / 40;
  const grams: Record<string, number> = { g: 1, mg: 0.001, mcg: 0.000001, 'µg': 0.000001 };
  if (grams[from] && grams[target]) return amount * grams[from] / grams[target];
  throw new Error(`Cannot convert ${unit} to ${definition.unit} for ${definition.name}.`);
}
