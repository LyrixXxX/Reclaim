import { DASHBOARD_WIDGETS } from './dashboard';
import { setDailyStepGoal } from './activity-step-history';
import { macroCalories, upsertNutritionGoal } from './nutrition';
import { localDateKey } from './progress';
import { upsertWeightEntry } from './weight';
import { AppPreferences, DashboardWidgetId, OnboardingArea, TrackerState } from '@/models/tracker';

export type OnboardingSetupDraft = NonNullable<TrackerState['onboardingSetupDraft']>;

export function parseFirstWeight(value: string) {
  const weight = Number(value.trim());
  if (!value.trim() || !Number.isFinite(weight) || weight <= 0) throw new Error('Enter a valid current weight greater than zero.');
  return weight;
}

export function parseFirstNutrition(draft: NonNullable<OnboardingSetupDraft['nutrition']>) {
  const calorieTarget = Number(draft.calories?.trim());
  if (!draft.calories?.trim() || !Number.isInteger(calorieTarget) || calorieTarget < 1 || calorieTarget > 10000) throw new Error('Enter a calorie target from 1 to 10,000 kcal.');
  const hasMacros = [draft.carbs, draft.protein, draft.fat].some((value) => value.trim());
  const fields = { carbsGrams: draft.carbs, proteinGrams: draft.protein, fatGrams: draft.fat, fiberGrams: draft.fiber };
  const nutrients = {} as Record<keyof typeof fields, number>;
  for (const [key, value] of Object.entries(fields) as [keyof typeof fields, string][]) {
    if (!value.trim() && (key === 'fiberGrams' || !hasMacros)) { nutrients[key] = 0; continue; }
    const amount = Number(value.trim());
    if (!value.trim() || !Number.isFinite(amount) || amount < 0 || amount > 10000) throw new Error(`Enter a valid ${key.replace('Grams', '')} target (0–10,000 g).`);
    nutrients[key] = amount;
  }
  if (hasMacros && macroCalories(nutrients) <= 0) throw new Error('Enter at least one macro target above zero, or leave all three blank to track calories only.');
  return { ...nutrients, calorieTarget, macroTargetsEnabled: hasMacros, macroMethod: 'manual' as const };
}

export function parseFirstStepGoal(value: string) {
  const count = Number(value.trim());
  if (!value.trim() || !Number.isInteger(count) || count < 1 || count > 100000) throw new Error('Enter a daily goal between 1 and 100,000 steps.');
  return count;
}

export function shouldEnableFirstStepTracking(state: TrackerState) {
  return state.onboardingSelections?.includes('activity') === true && state.onboardingSetupDraft?.activity?.skipped !== true && state.onboardingSetupDraft?.activity?.enableStepTracking === true;
}

export const ONBOARDING_AREAS: { id: OnboardingArea; label: string; description: string }[] = [
  { id: 'habits', label: 'Habits', description: 'Track habits you are quitting, reducing, or building.' },
  { id: 'nutrition', label: 'Nutrition', description: 'Log food, macros, and fiber.' },
  { id: 'supplements', label: 'Supplements', description: 'Schedule vitamins and supplements and track doses.' },
  { id: 'weight', label: 'Weight', description: 'Follow weigh-ins and long-term trends.' },
  { id: 'workouts', label: 'Workouts', description: 'Log strength sessions, build routines, and review progress.' },
  { id: 'activity', label: 'Steps', description: 'Count daily steps and follow your step goal and trends.' },
  { id: 'routes', label: 'Routes', description: 'Record walks, hikes, and runs with GPS maps.' },
];

export function createFreshState(): TrackerState {
  return { trackers: [], checkIns: [], onboardingStatus: 'pending', onboardingSelections: [] };
}

export function needsOnboarding(state: TrackerState) {
  return state.onboardingStatus === 'pending';
}

export function normalizeOnboardingSelections(value: unknown): OnboardingArea[] {
  if (!Array.isArray(value)) return [];
  return ONBOARDING_AREAS.map(({ id }) => id).filter((id) => value.includes(id));
}

export function completeOnboarding(state: TrackerState, now = new Date()): TrackerState {
  const selections = normalizeOnboardingSelections(state.onboardingSelections);
  const has = (area: OnboardingArea) => selections.includes(area);
  const visibleSections: AppPreferences['visibleSections'] = {
    goals: has('habits'), health: false, cpap: false, weight: has('weight'), nutrition: has('nutrition'), activity: has('activity'), routes: has('routes'), workouts: has('workouts'), supplements: has('supplements'),
  };
  const visibleHealthModules: AppPreferences['visibleHealthModules'] = {
    bloodPressure: false, medications: false, labs: false,
  };
  const selectedWidgets = selections.flatMap((id): DashboardWidgetId[] => id === 'workouts' || id === 'routes' || id === 'supplements' ? [] : [id === 'habits' ? 'habits' : id]);
  const widgetOrder: DashboardWidgetId[] = [
    ...selectedWidgets,
    ...DASHBOARD_WIDGETS.map(({ id }) => id).filter((id) => !selectedWidgets.includes(id)),
  ];
  const dashboard = widgetOrder.map((id) => ({ id, visible: selectedWidgets.includes(id), expanded: false }));
  const date = localDateKey(now);
  const draft = state.onboardingSetupDraft;
  const weightEntries = has('weight') && draft?.weight && !draft.weight.skipped && draft.weight.value.trim()
    ? upsertWeightEntry(state.weightEntries ?? [], { date, weight: parseFirstWeight(draft.weight.value), unit: draft.weight.unit })
    : state.weightEntries;
  const nutritionGoals = has('nutrition') && draft?.nutrition && !draft.nutrition.skipped && Object.values(draft.nutrition).some((value) => typeof value === 'string' && value.trim())
    ? upsertNutritionGoal(state.nutritionGoals ?? [], { effectiveDate: date, ...parseFirstNutrition(draft.nutrition) })
    : state.nutritionGoals;
  const stepGoals = has('activity') && draft?.activity && !draft.activity.skipped && draft.activity.stepGoal.trim()
    ? setDailyStepGoal(state.stepGoals ?? [], date, parseFirstStepGoal(draft.activity.stepGoal))
    : state.stepGoals;
  const { onboardingSetupDraft: _draft, ...withoutDraft } = state;
  return {
    ...withoutDraft,
    onboardingStatus: 'complete',
    onboardingSelections: selections,
    weightEntries,
    nutritionGoals,
    stepGoals,
    preferences: { ...state.preferences, visibleSections, visibleHealthModules, dashboard },
  };
}

export async function persistCompletedOnboarding(state: TrackerState, save: (snapshot: string) => Promise<void>) {
  const complete = completeOnboarding(state);
  await save(JSON.stringify(complete));
  return complete;
}
