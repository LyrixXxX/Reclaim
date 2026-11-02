import { NUTRIENT_CATALOG } from './nutrient-catalog';

export type SupplementChoice = { id: string; name: string; nutrientIds: string[] };

const nutrientChoices: SupplementChoice[] = NUTRIENT_CATALOG
  .filter((item) => item.category === 'Vitamins' || item.category === 'Minerals')
  .map((item) => ({ id: item.id, name: item.name, nutrientIds: [item.id] }));

export const SUPPLEMENT_CHOICES: SupplementChoice[] = [
  ...nutrientChoices,
  { id: 'd3-k2', name: 'Vitamin D3 + K2', nutrientIds: ['vitamin_d', 'vitamin_k'] },
  { id: 'fish-oil', name: 'Fish oil / Omega-3', nutrientIds: ['omega_3', 'epa', 'dha'] },
  { id: 'creatine', name: 'Creatine', nutrientIds: [] },
  { id: 'protein-powder', name: 'Protein powder', nutrientIds: [] },
  { id: 'multivitamin', name: 'Multivitamin', nutrientIds: [] },
  { id: 'probiotic', name: 'Probiotic', nutrientIds: [] },
  { id: 'electrolytes', name: 'Electrolytes', nutrientIds: [] },
  { id: 'collagen', name: 'Collagen', nutrientIds: [] },
].sort((a, b) => a.name.localeCompare(b.name));

const POPULAR_IDS = ['vitamin_d', 'vitamin_c', 'vitamin_b12', 'magnesium', 'calcium', 'zinc', 'd3-k2', 'creatine', 'fish-oil', 'protein-powder', 'multivitamin'];

export function searchSupplements(query: string) {
  const term = query.trim().toLowerCase();
  return term ? SUPPLEMENT_CHOICES.filter((item) => item.name.toLowerCase().includes(term)) : POPULAR_IDS.flatMap((id) => SUPPLEMENT_CHOICES.filter((item) => item.id === id));
}
