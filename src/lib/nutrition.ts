import { FOOD_EXTRA_NUTRIENT_IDS } from '@/lib/nutrient-catalog';
import {
  NutritionEntry,
  NutritionGoalProfile,
  NutritionMealGroup,
  NutritionNutrients,
  SavedFood,
  SavedMeal,
  SavedMealItem,
  TrackerState,
} from '@/models/tracker';

export type NutritionRange = '7D' | '30D' | 'MONTHS' | 'YEARS';
export type NutritionMetric = 'calories' | 'carbs' | 'protein' | 'fat' | 'fiber';

export type NutritionEntryInput = Omit<NutritionEntry, 'id' | 'recordedAt' | 'updatedAt'> & {
  id?: string;
};

export type SavedFoodInput = Omit<SavedFood, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type SavedMealInput = Omit<SavedMeal, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type AiNutritionItem = {
  name: string;
  brand?: string;
  servingLabel: string;
  servingWeightGrams?: number;
  nutrients: NutritionNutrients;
  statedCalories?: number;
  confidence: 'high' | 'medium' | 'low';
  assumptions: string[];
};

export type AiNutritionResult = {
  schemaVersion: 1;
  items: AiNutritionItem[];
  warnings: string[];
};

export const DEFAULT_MEAL_GROUPS: NutritionMealGroup[] = [
  { id: 'meal-breakfast', name: 'Breakfast', sortOrder: 0, builtIn: true, archived: false },
  { id: 'meal-lunch', name: 'Lunch', sortOrder: 1, builtIn: true, archived: false },
  { id: 'meal-dinner', name: 'Dinner', sortOrder: 2, builtIn: true, archived: false },
  { id: 'meal-snacks', name: 'Snacks', sortOrder: 3, builtIn: true, archived: false },
];

export function nutritionId(prefix = 'nutrition') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyNutrients(): NutritionNutrients {
  return { carbsGrams: 0, proteinGrams: 0, fatGrams: 0, fiberGrams: 0 };
}

export function macroCalories(nutrients: NutritionNutrients) {
  return round((nutrients.carbsGrams * 4) + (nutrients.proteinGrams * 4) + (nutrients.fatGrams * 9), 1);
}

export function nutritionCalorieTarget(goal: NutritionGoalProfile) {
  return goal.calorieTarget ?? macroCalories(goal);
}

export function hasMacroTargets(goal: NutritionGoalProfile) {
  return goal.macroTargetsEnabled !== false;
}

export function parseExplicitNutritionSummary(text: string): AiNutritionItem | undefined {
  const calories = explicitNutritionValue(text, ['calories?', 'kcal', 'cals?'], '(?:kcal|calories?|cals?)?');
  const protein = explicitNutritionValue(text, ['protein'], 'g(?:rams?)?');
  const carbs = explicitNutritionValue(text, ['carbs?', 'carbohydrates?'], 'g(?:rams?)?');
  // Keep a supplied saturated-fat amount from being mistaken for total fat.
  const totalFatText = text.replace(/\b(?:saturated|sat\.?)\s+fat\b/gi, 'saturatedfat');
  const fat = explicitNutritionValue(totalFatText, ['total\\s+fat', 'fat'], 'g(?:rams?)?');
  const fiber = explicitNutritionValue(text, ['fiber', 'fibre'], 'g(?:rams?)?');
  if ([calories, protein, carbs, fat, fiber].some((value) => value === undefined)) return undefined;

  const title = explicitNutritionTitle(text);
  if (!title) return undefined;
  const cholesterol = explicitFoodDetail(text, ['cholesterol'], 'mg');
  const sodium = explicitFoodDetail(text, ['sodium'], 'mg');
  const saturatedFat = explicitFoodDetail(text, ['saturated\\s+fat', 'sat\\.?\\s+fat', 'saturates?'], 'g');
  return {
    name: title,
    servingLabel: '1 complete meal',
    nutrients: {
      carbsGrams: carbs!,
      proteinGrams: protein!,
      fatGrams: fat!,
      fiberGrams: fiber!,
      extraNutrients: {
        fiber: fiber!,
        ...(cholesterol === undefined ? {} : { cholesterol }),
        ...(sodium === undefined ? {} : { sodium }),
        ...(saturatedFat === undefined ? {} : { saturated_fat: saturatedFat }),
      },
    },
    statedCalories: calories,
    confidence: 'high',
    assumptions: ['Used the meal totals you supplied exactly as entered; no foods were separated and calories were not recalculated.'],
  };
}

/** Keep individually supplied food totals separate; never silently use only the first line. */
export function parseExplicitNutritionSummaries(text: string): AiNutritionItem[] | undefined {
  const lines = text.split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    const items = lines.map((line) => parseExplicitNutritionSummary(line.replace(/^(?:[-*•]|\d+[.)])\s*/, '')));
    if (items.every((item): item is AiNutritionItem => item !== undefined)) return items as AiNutritionItem[];
    // A title and its totals may span lines, but a partially parsed list must
    // be analyzed as a whole rather than losing the unparsed foods.
    if (items.some(Boolean)) return undefined;
  }
  const calorieMentions = text.match(/\b(?:calories?|kcal|cals?)\s*[:=]?\s*[~≈]?\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:kcal|calories?|cals?)\b/gi);
  if ((calorieMentions?.length ?? 0) > 1) return undefined;
  const item = parseExplicitNutritionSummary(text);
  return item ? [item] : undefined;
}

export function scaleNutrients(nutrients: NutritionNutrients, servings: number): NutritionNutrients {
  return {
    carbsGrams: round(nutrients.carbsGrams * servings, 2),
    proteinGrams: round(nutrients.proteinGrams * servings, 2),
    fatGrams: round(nutrients.fatGrams * servings, 2),
    fiberGrams: round(nutrients.fiberGrams * servings, 2),
    extraNutrients: nutrients.extraNutrients ? Object.fromEntries(Object.entries(nutrients.extraNutrients).map(([id, amount]) => [id, round(amount * servings, 4)])) : undefined,
  };
}

export function extractServingWeightGrams(servingLabel: string) {
  const grams = [...servingLabel.matchAll(/(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (grams.length) return grams.at(-1);
  const ounces = servingLabel.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/i);
  if (!ounces) return undefined;
  const value = Number(ounces[1]);
  return Number.isFinite(value) && value > 0 ? round(value * 28.349523125, 3) : undefined;
}

export function servingsForWeight(amount: number, unit: 'g' | 'oz', servingWeightGrams: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a weight greater than zero.');
  if (!Number.isFinite(servingWeightGrams) || servingWeightGrams <= 0) throw new Error('Enter the label weight for one serving.');
  const consumedGrams = unit === 'oz' ? amount * 28.349523125 : amount;
  return round(consumedGrams / servingWeightGrams, 6);
}

export function addNutrients(items: NutritionNutrients[]): NutritionNutrients {
  return items.reduce((total, item) => ({
    carbsGrams: round(total.carbsGrams + item.carbsGrams, 2),
    proteinGrams: round(total.proteinGrams + item.proteinGrams, 2),
    fatGrams: round(total.fatGrams + item.fatGrams, 2),
    fiberGrams: round(total.fiberGrams + item.fiberGrams, 2),
    extraNutrients: Object.entries(item.extraNutrients ?? {}).reduce<Record<string, number>>((values, [id, amount]) => ({ ...values, [id]: round((values[id] ?? 0) + amount, 4) }), { ...total.extraNutrients }),
  }), emptyNutrients());
}

export function nutritionTotals(entries: NutritionEntry[], date?: string) {
  const matching = date ? entries.filter((entry) => entry.eventDate === date) : entries;
  const nutrients = addNutrients(matching.map((entry) => scaleNutrients(entry.nutrients, entry.servings)));
  const calories = round(matching.reduce((sum, entry) => sum + nutritionEntryCalories(entry), 0), 1);
  return { ...nutrients, calories, entryCount: matching.length };
}

export function nutritionEntryCalories(entry: Pick<NutritionEntry, 'nutrients' | 'servings' | 'statedCalories'>) {
  return entry.statedCalories === undefined
    ? macroCalories(scaleNutrients(entry.nutrients, entry.servings))
    : round(entry.statedCalories * entry.servings, 1);
}

export function goalForDate(goals: NutritionGoalProfile[], date: string) {
  const ordered = [...goals].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return ordered
    .filter((goal) => goal.effectiveDate <= date)
    .at(-1) ?? ordered[0];
}

export function upsertNutritionGoal(goals: NutritionGoalProfile[], input: Omit<NutritionGoalProfile, 'id' | 'recordedAt'>, id = nutritionId('goal')) {
  validateDate(input.effectiveDate);
  validateNutrients(input);
  if (input.calorieTarget !== undefined && (!Number.isFinite(input.calorieTarget) || input.calorieTarget <= 0 || input.calorieTarget > 10000)) throw new Error('Enter a calorie target from 1 to 10,000 kcal.');
  const existing = goals.find((goal) => goal.effectiveDate === input.effectiveDate);
  const next: NutritionGoalProfile = { ...input, id: existing?.id ?? id, recordedAt: new Date().toISOString() };
  return [...goals.filter((goal) => goal.id !== next.id), next].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function removeNutritionGoal(goals: NutritionGoalProfile[], id: string, confirmed: boolean) {
  return confirmed ? goals.filter((goal) => goal.id !== id) : goals;
}

export function upsertNutritionEntry(entries: NutritionEntry[], input: NutritionEntryInput, id = nutritionId('entry')) {
  validateNutritionEntry(input);
  const existing = input.id ? entries.find((entry) => entry.id === input.id) : undefined;
  const now = new Date().toISOString();
  const next: NutritionEntry = {
    ...input,
    id: existing?.id ?? id,
    recordedAt: existing?.recordedAt ?? now,
    updatedAt: now,
  };
  return [...entries.filter((entry) => entry.id !== next.id), next]
    .sort((a, b) => `${a.eventDate}${a.eatenAt ?? ''}`.localeCompare(`${b.eventDate}${b.eatenAt ?? ''}`));
}

export function removeNutritionEntry(entries: NutritionEntry[], id: string, confirmed: boolean) {
  return confirmed ? entries.filter((entry) => entry.id !== id) : entries;
}

export type NutritionLogBatch = { entries: NutritionEntryInput[]; foods: SavedFoodInput[] };
export type PreparedNutritionLogBatch = { entries: NutritionEntry[]; foods: SavedFood[] };

/** Complete validation before scheduling a React update or copying source photos. */
export function prepareNutritionLogBatch(batch: NutritionLogBatch): PreparedNutritionLogBatch {
  if (!batch.entries.length) throw new Error('Add at least one food before saving.');
  const entries = batch.entries.map((input) => upsertNutritionEntry([], {
    ...input, nutrients: { ...input.nutrients },
  }, input.id ?? nutritionId('entry'))[0]);
  const foods = batch.foods.map((input) => upsertSavedFood([], {
    ...input, nutrients: { ...input.nutrients },
  }, input.id ?? nutritionId('food'))[0]);
  if (new Set(entries.map((item) => item.id)).size !== entries.length
    || new Set(foods.map((item) => item.id)).size !== foods.length) {
    throw new Error('A food appears twice in this save. Please reopen the form.');
  }
  return { entries, foods };
}

/** Merge against the latest state in one update; never validate or mutate inside it. */
export function applyNutritionLogBatch(state: TrackerState, batch: PreparedNutritionLogBatch): TrackerState {
  const entries = new Map((state.nutritionEntries ?? []).map((item) => [item.id, item]));
  const foods = new Map((state.savedFoods ?? []).map((item) => [item.id, item]));
  for (const item of batch.entries) {
    entries.set(item.id, { ...item, recordedAt: entries.get(item.id)?.recordedAt ?? item.recordedAt });
  }
  for (const item of batch.foods) {
    foods.set(item.id, { ...item, createdAt: foods.get(item.id)?.createdAt ?? item.createdAt });
  }
  return {
    ...state,
    nutritionEntries: [...entries.values()].sort((a, b) => `${a.eventDate}${a.eatenAt ?? ''}`.localeCompare(`${b.eventDate}${b.eatenAt ?? ''}`)),
    savedFoods: [...foods.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Replace one logged meal instance without touching its reusable template. */
export function replaceLoggedMeal(state: TrackerState, instanceId: string, batch: PreparedNutritionLogBatch): TrackerState {
  const previous = (state.nutritionEntries ?? []).filter((entry) => entry.savedMealInstanceId === instanceId);
  if (!previous.length) throw new Error('This logged meal is no longer available.');
  if (batch.entries.some((entry) => entry.savedMealInstanceId !== instanceId)) throw new Error('Meal items must stay in the same group.');
  const originalById = new Map(previous.map((entry) => [entry.id, entry]));
  const preserved = { ...batch, entries: batch.entries.map((entry) => ({ ...entry, recordedAt: originalById.get(entry.id)?.recordedAt ?? entry.recordedAt })) };
  const retained = (state.nutritionEntries ?? []).filter((entry) => entry.savedMealInstanceId !== instanceId);
  return applyNutritionLogBatch({ ...state, nutritionEntries: retained }, preserved);
}

/** Save a reusable meal and its optional log in one state transition. */
export function applyMealBuilderSave(state: TrackerState, meal: SavedMeal, batch?: PreparedNutritionLogBatch, standaloneFoods: SavedFood[] = []): TrackerState {
  const logged = batch ? applyNutritionLogBatch(state, batch) : state;
  const foods = new Map((logged.savedFoods ?? []).map((food) => [food.id, food]));
  for (const food of standaloneFoods) foods.set(food.id, { ...food, createdAt: foods.get(food.id)?.createdAt ?? food.createdAt });
  return { ...logged, savedFoods: [...foods.values()].sort((a, b) => a.name.localeCompare(b.name)), savedMeals: applyPreparedSavedMeal(logged.savedMeals ?? [], meal) };
}

export function upsertSavedFood(foods: SavedFood[], input: SavedFoodInput, id = nutritionId('food')) {
  validateFood(input);
  const existing = input.id ? foods.find((food) => food.id === input.id) : undefined;
  const now = new Date().toISOString();
  const next: SavedFood = {
    ...input,
    id: existing?.id ?? id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return [...foods.filter((food) => food.id !== next.id), next]
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function removeSavedFood(foods: SavedFood[], id: string, confirmed: boolean) {
  return confirmed ? foods.filter((food) => food.id !== id) : foods;
}

export function upsertSavedMeal(meals: SavedMeal[], input: SavedMealInput, id = nutritionId('meal')) {
  return applyPreparedSavedMeal(meals, prepareSavedMeal(input, input.id ?? id));
}

export function prepareSavedMeal(input: SavedMealInput, id = input.id ?? nutritionId('meal')): SavedMeal {
  const name = input.name.trim();
  if (!name) throw new Error('Enter a saved meal name.');
  if (!input.items.length) throw new Error('Choose at least one food for this saved meal.');
  input.items.forEach(validateSavedMealItem);
  const now = new Date().toISOString();
  return {
    ...input,
    id,
    name,
    note: input.note?.trim() || undefined,
    items: input.items.map((item) => ({ ...item, nutrients: { ...item.nutrients } })),
    createdAt: now,
    updatedAt: now,
  };
}

export function applyPreparedSavedMeal(meals: SavedMeal[], prepared: SavedMeal): SavedMeal[] {
  const existing = meals.find((meal) => meal.id === prepared.id);
  const next = { ...prepared, createdAt: existing?.createdAt ?? prepared.createdAt };
  return [...meals.filter((meal) => meal.id !== next.id), next].sort((a, b) => a.name.localeCompare(b.name));
}

export function removeSavedMeal(meals: SavedMeal[], id: string, confirmed: boolean) {
  return confirmed ? meals.filter((meal) => meal.id !== id) : meals;
}

export function savedMealTotals(items: SavedMealItem[]) {
  const entries = items.map((item) => ({ ...item, id: item.id, eventDate: '', recordedAt: '', updatedAt: '', mealGroupId: '', mealLabel: '', source: 'saved_meal' as const }));
  return nutritionTotals(entries);
}

export function upsertMealGroup(groups: NutritionMealGroup[], input: Pick<NutritionMealGroup, 'id' | 'name' | 'sortOrder' | 'builtIn' | 'archived'>) {
  const name = input.name.trim();
  if (!name) throw new Error('Enter a meal group name.');
  if (groups.some((group) => group.id !== input.id && group.name.toLowerCase() === name.toLowerCase())) throw new Error('A meal group with that name already exists.');
  return [...groups.filter((group) => group.id !== input.id), { ...input, name }].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The editor validates synchronously; a deferred state update must never crash on stale input. */
export function applyMealGroupEdit(state: TrackerState, input: NutritionMealGroup): TrackerState {
  try { return { ...state, nutritionMealGroups: upsertMealGroup(state.nutritionMealGroups ?? [], input) }; }
  catch { return state; }
}

/** Only unused custom groups can be deleted; archived groups retain historical logs. */
export function removeMealGroup(state: TrackerState, id: string): TrackerState {
  const group = (state.nutritionMealGroups ?? []).find((item) => item.id === id);
  if (!group || group.builtIn || (state.nutritionEntries ?? []).some((entry) => entry.mealGroupId === id)) return state;
  return { ...state, nutritionMealGroups: (state.nutritionMealGroups ?? []).filter((item) => item.id !== id) };
}

export function migrateNutritionState(state: TrackerState): TrackerState {
  const existingGroups = state.nutritionMealGroups ?? [];
  const mergedGroups = [
    ...DEFAULT_MEAL_GROUPS.map((fallback) => existingGroups.find((item) => item.id === fallback.id) ?? fallback),
    ...existingGroups.filter((item) => !DEFAULT_MEAL_GROUPS.some((fallback) => fallback.id === item.id)),
  ].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    ...state,
    nutritionGoals: state.nutritionGoals ?? [],
    nutrientSelections: state.nutrientSelections ?? (state.nutritionGoals?.some((goal) => goal.fiberGrams > 0) ? [{ nutrientId: 'fiber', state: 'goal', goalType: 'minimum', goalAmount: [...state.nutritionGoals].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).find((goal) => goal.fiberGrams > 0)!.fiberGrams, order: 0, legacyFiberGoal: true }] : []),
    customNutrients: state.customNutrients ?? [],
    nutritionMealGroups: mergedGroups,
    savedFoods: state.savedFoods ?? [],
    savedMeals: state.savedMeals ?? [],
    nutritionEntries: state.nutritionEntries ?? [],
  };
}

export type NutritionTrendPoint = {
  key: string;
  label: string;
  value: number | null;
  loggedDays: number;
};

export function nutritionTodaySoFar(entries: NutritionEntry[], metric: NutritionMetric, now = new Date()) {
  const key = localDateKey(now);
  const totals = nutritionTotals(entries, key);
  return { key, value: metricValue(totals, metric), entryCount: totals.entryCount };
}

export function nutritionTrendPoints(entries: NutritionEntry[], metric: NutritionMetric, range: NutritionRange, now = new Date()): NutritionTrendPoint[] {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  if (range === '7D' || range === '30D') {
    const count = range === '7D' ? 7 : 30;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(yesterday);
      date.setDate(yesterday.getDate() - (count - 1 - index));
      const key = localDateKey(date);
      const dayEntries = entries.filter((entry) => entry.eventDate === key);
      const totals = nutritionTotals(dayEntries);
      return { key, label: `${date.getMonth() + 1}/${date.getDate()}`, value: dayEntries.length ? metricValue(totals, metric) : null, loggedDays: dayEntries.length ? 1 : 0 };
    });
  }

  const byPeriod = new Map<string, Map<string, NutritionEntry[]>>();
  for (const entry of entries.filter((item) => item.eventDate <= localDateKey(yesterday))) {
    const period = range === 'MONTHS' ? entry.eventDate.slice(0, 7) : entry.eventDate.slice(0, 4);
    const days = byPeriod.get(period) ?? new Map<string, NutritionEntry[]>();
    days.set(entry.eventDate, [...(days.get(entry.eventDate) ?? []), entry]);
    byPeriod.set(period, days);
  }
  let periods = [...byPeriod.keys()].sort();
  if (range === 'MONTHS') periods = periods.slice(-12);
  return periods.map((key) => {
    const days = byPeriod.get(key)!;
    const values = [...days.values()].map((dayEntries) => metricValue(nutritionTotals(dayEntries), metric));
    const [year, month] = key.split('-').map(Number);
    const label = range === 'MONTHS'
      ? new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      : key;
    return { key, label, value: round(values.reduce((sum, value) => sum + value, 0) / values.length, 1), loggedDays: days.size };
  });
}

export function metricValue(total: ReturnType<typeof nutritionTotals>, metric: NutritionMetric) {
  if (metric === 'calories') return total.calories;
  if (metric === 'carbs') return total.carbsGrams;
  if (metric === 'protein') return total.proteinGrams;
  if (metric === 'fat') return total.fatGrams;
  return total.fiberGrams;
}

export function validateAiNutritionResult(value: unknown): AiNutritionResult {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.items) || !Array.isArray(value.warnings)) throw new Error('The AI response was incomplete. Try again or enter the food manually.');
  const items = value.items.map((item) => {
    if (!isObject(item) || typeof item.name !== 'string' || typeof item.servingLabel !== 'string' || !isObject(item.nutrients)) throw new Error('The AI response contained an invalid food item.');
    const nutrients = item.nutrients as Record<string, unknown>;
    const parsed: AiNutritionItem = {
      name: item.name.trim(),
      brand: typeof item.brand === 'string' ? item.brand.trim() : undefined,
      servingLabel: item.servingLabel.trim(),
      servingWeightGrams: item.servingWeightGrams === null || item.servingWeightGrams === undefined
        ? extractServingWeightGrams(item.servingLabel)
        : positiveNumeric(item.servingWeightGrams, 'serving weight'),
      nutrients: {
        carbsGrams: numeric(nutrients.carbsGrams),
        proteinGrams: numeric(nutrients.proteinGrams),
        fatGrams: numeric(nutrients.fatGrams),
        fiberGrams: numeric(nutrients.fiberGrams),
        extraNutrients: Array.isArray(nutrients.additionalNutrients) ? Object.fromEntries(nutrients.additionalNutrients.filter((entry: unknown) => isObject(entry) && FOOD_EXTRA_NUTRIENT_IDS.some((id) => id === entry.id) && typeof entry.amount === 'number' && Number.isFinite(entry.amount) && entry.amount >= 0).map((entry: { id: string; amount: number }) => [entry.id, entry.amount])) : isObject(nutrients.extraNutrients) ? Object.fromEntries(Object.entries(nutrients.extraNutrients).filter(([id, amount]) => FOOD_EXTRA_NUTRIENT_IDS.some((allowedId) => allowedId === id) && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0)) as Record<string, number> : undefined,
      },
      statedCalories: item.statedCalories === null || item.statedCalories === undefined ? undefined : numeric(item.statedCalories),
      confidence: item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low' ? item.confidence : 'low',
      assumptions: Array.isArray(item.assumptions) ? item.assumptions.filter((entry): entry is string => typeof entry === 'string') : [],
    };
    validateFood(parsed);
    return parsed;
  });
  if (!items.length) throw new Error('No food items were returned. Add more detail or enter the food manually.');
  return { schemaVersion: 1, items, warnings: value.warnings.filter((warning): warning is string => typeof warning === 'string') };
}

function validateNutritionEntry(input: NutritionEntryInput) {
  validateDate(input.eventDate);
  validateFood(input);
  if (!input.mealGroupId || !input.mealLabel) throw new Error('Choose a meal group.');
  if (!Number.isFinite(input.servings) || input.servings <= 0 || input.servings > 100) throw new Error('Servings must be greater than zero.');
  if (input.amountMode === 'weight') {
    if (!Number.isFinite(input.consumedAmount) || input.consumedAmount! <= 0) throw new Error('Consumed weight must be greater than zero.');
    if (input.consumedUnit !== 'g' && input.consumedUnit !== 'oz') throw new Error('Choose grams or ounces.');
    if (!Number.isFinite(input.servingWeightGrams) || input.servingWeightGrams! <= 0) throw new Error('Serving weight must be greater than zero.');
  }
}

function validateFood(input: Pick<SavedFoodInput, 'name' | 'servingLabel' | 'servingWeightGrams' | 'nutrients' | 'statedCalories'>) {
  if (!input.name.trim()) throw new Error('Enter a food name.');
  if (!input.servingLabel.trim()) throw new Error('Enter a serving description.');
  validateNutrients(input.nutrients);
  if (input.statedCalories !== undefined && (!Number.isFinite(input.statedCalories) || input.statedCalories < 0)) throw new Error('Calories cannot be negative.');
  if (input.servingWeightGrams !== undefined && (!Number.isFinite(input.servingWeightGrams) || input.servingWeightGrams <= 0)) throw new Error('Serving weight must be greater than zero.');
}

function validateSavedMealItem(item: SavedMealItem) {
  validateFood(item);
  if (!item.id.trim()) throw new Error('A saved meal item is missing its stable ID.');
  if (!Number.isFinite(item.servings) || item.servings <= 0) throw new Error(`${item.name} needs an amount greater than zero.`);
  if (item.amountMode === 'weight') {
    if (!Number.isFinite(item.consumedAmount) || item.consumedAmount! <= 0) throw new Error(`${item.name} needs a valid weight eaten.`);
    if (!Number.isFinite(item.servingWeightGrams) || item.servingWeightGrams! <= 0) throw new Error(`${item.name} needs a valid serving weight.`);
    if (item.consumedUnit !== 'g' && item.consumedUnit !== 'oz') throw new Error(`${item.name} needs a weight unit.`);
  }
}

function positiveNumeric(value: unknown, label: string) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`The AI response contained an invalid ${label}.`);
  return parsed;
}

function validateNutrients(nutrients: NutritionNutrients) {
  for (const value of [nutrients.carbsGrams, nutrients.proteinGrams, nutrients.fatGrams, nutrients.fiberGrams]) {
    if (!Number.isFinite(value) || value < 0 || value > 10000) throw new Error('Nutrition values must be valid non-negative numbers.');
  }
  if (nutrients.extraNutrients && Object.entries(nutrients.extraNutrients).some(([id, value]) => !id || !Number.isFinite(value) || value < 0 || value > 1000000)) throw new Error('Additional nutrient values must be valid non-negative numbers.');
}

function validateDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a valid date.');
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12);
  if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) throw new Error('Enter a valid date.');
}

function numeric(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('The AI response contained an invalid nutrition value.');
  return parsed;
}

function explicitNutritionValue(text: string, labels: string[], trailingUnit: string) {
  const label = `(?:${labels.join('|')})`;
  const number = '(\\d[\\d,]*(?:\\.\\d+)?)';
  const estimate = '[~≈]?\\s*';
  const labelFirst = new RegExp(`\\b${label}\\b\\s*(?:[:=]|(?:is|was|were))?\\s*${estimate}${number}\\s*(?:${trailingUnit})?\\b`, 'i').exec(text);
  const valueFirst = new RegExp(`${estimate}${number}\\s*(?:${trailingUnit})?\\s*\\b${label}\\b`, 'i').exec(text);
  const raw = labelFirst?.[1] ?? valueFirst?.[1];
  if (raw === undefined) return undefined;
  const value = Number(raw.replaceAll(',', ''));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function explicitFoodDetail(text: string, labels: string[], canonicalUnit: 'g' | 'mg') {
  const label = `(?:${labels.join('|')})`;
  const number = '(\\d[\\d,]*(?:\\.\\d+)?)';
  const unit = '(mg|milligrams?|g|grams?)?';
  const labelFirst = new RegExp(`\\b${label}\\b\\s*(?:[:=]|(?:is|was|were))?\\s*[~≈]?\\s*${number}\\s*${unit}\\b`, 'i').exec(text);
  const valueFirst = new RegExp(`[~≈]?\\s*${number}\\s*${unit}\\s*\\b${label}\\b`, 'i').exec(text);
  const match = labelFirst ?? valueFirst;
  if (!match) return undefined;
  const amount = Number(match[1].replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const suppliedUnit = match[2]?.toLowerCase();
  const milligrams = suppliedUnit === 'mg' || suppliedUnit?.startsWith('milligram');
  const grams = suppliedUnit === 'g' || suppliedUnit?.startsWith('gram');
  return canonicalUnit === 'mg' && grams ? amount * 1000 : canonicalUnit === 'g' && milligrams ? amount / 1000 : amount;
}

function explicitNutritionTitle(text: string) {
  const summaryPhrase = /\b(?:the\s+)?(?:macros?|nutrition(?:\s+totals?)?)\s*(?::|were\b|are\b|was\b)/i.exec(text);
  let end = summaryPhrase?.index;
  if (end === undefined) {
    const markers = [
      /[~≈]?\s*\d[\d,]*(?:\.\d+)?\s*(?:kcal|calories?|cals?)\b/i,
      /\b(?:calories?|kcal|cals?|protein|carbs?|carbohydrates?|fat|fiber|fibre)\b\s*[:=]/i,
    ].map((pattern) => pattern.exec(text)?.index).filter((index): index is number => index !== undefined);
    end = markers.length ? Math.min(...markers) : undefined;
  }
  if (end === undefined) return '';
  return text.slice(0, end)
    .replace(/^\s*(?:(?:my\s+)?(?:last\s+)?meal\s+was|i\s+(?:ate|had)|meal\s*:|food\s*:)/i, '')
    .replace(/[\s|:;,–—-]+$/g, '')
    .trim();
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
