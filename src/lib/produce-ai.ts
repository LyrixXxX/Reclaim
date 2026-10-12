import { NutritionEntry } from '@/models/tracker';
import { requestPrivateAiRelay } from './nutrition-ai';

export type ProduceSuggestion = { nutritionEntryId: string; servings: number; category: 'fruit' | 'vegetable'; explanation: string };

export async function suggestProduce(entries: NutritionEntry[]): Promise<ProduceSuggestion[]> {
  if (!entries.length) return [];
  const response = await requestPrivateAiRelay('/v1/suggest-produce', {
    method: 'POST',
    body: JSON.stringify({ entries: entries.slice(0, 20).map((entry) => ({ id: entry.id, name: entry.name, servingLabel: entry.servingLabel, servings: entry.servings, consumedAmount: entry.consumedAmount, consumedUnit: entry.consumedUnit })) }),
  });
  const parsed = await response.json() as { suggestions?: ProduceSuggestion[] };
  if (!Array.isArray(parsed.suggestions)) throw new Error('The relay returned no usable produce suggestions.');
  return parsed.suggestions.filter((item) => entries.some((entry) => entry.id === item.nutritionEntryId) && Number.isFinite(item.servings) && item.servings > 0 && item.servings <= 20 && (item.category === 'fruit' || item.category === 'vegetable'));
}
