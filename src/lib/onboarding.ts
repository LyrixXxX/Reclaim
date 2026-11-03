import { DASHBOARD_WIDGETS } from './dashboard';
import { setDailyStepGoal } from './activity-step-history';
import { macroCalories, upsertNutritionGoal } from './nutrition';
import { localDateKey } from './progress';
import { upsertWeightEntry } from './weight';
import { generateTrackerId, trackerFromDraft, TrackerDraft } from './tracker-management';
import { GOOD_HABIT_TEMPLATES } from './good-habit-templates';
import { AppPreferences, DashboardWidgetId, NavigationSection, OnboardingArea, OnboardingQuit, Tracker, TrackerState } from '@/models/tracker';
import { colors } from '@/theme';

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
  { id: 'habits', label: 'Habits', description: 'Build good habits, or quit and cut back on ones you don’t want.' },
  { id: 'nutrition', label: 'Nutrition', description: 'Log food, macros, and fiber.' },
  { id: 'supplements', label: 'Supplements', description: 'Schedule vitamins and supplements and track doses.' },
  { id: 'weight', label: 'Weight', description: 'Follow weigh-ins and long-term trends.' },
  { id: 'workouts', label: 'Workouts', description: 'Log strength sessions, build routines, and review progress.' },
  { id: 'activity', label: 'Steps', description: 'Count daily steps and follow your step goal and trends.' },
  { id: 'routes', label: 'Routes', description: 'Record walks, hikes, and runs with GPS maps.' },
];

/** Common things people quit, offered as one-tap picks during setup. */
export const QUIT_SUGGESTIONS: Omit<OnboardingQuit, 'id' | 'startDate' | 'weeklyCost'>[] = [
  { name: 'Nicotine', icon: '↘', color: colors.nicotine },
  { name: 'Vaping', icon: '☁', color: '#9FB4C7' },
  { name: 'Alcohol', icon: '◔', color: '#E59A9A' },
  { name: 'Marijuana', icon: '◇', color: colors.marijuana },
  { name: 'Caffeine', icon: '⌁', color: colors.caffeine },
  { name: 'Kratom', icon: '✦', color: '#E7C26E' },
  { name: 'Sugar', icon: '◌', color: '#F2A7D0' },
  { name: 'Porn', icon: '○', color: colors.porn },
  { name: 'Gambling', icon: '◆', color: '#C9B27A' },
  { name: 'Doomscrolling', icon: '▢', color: '#8FA3FF' },
];

/** Good habits offered during setup, each with a gentle default goal you can change later. */
export const BUILD_SUGGESTIONS: { id: NonNullable<Tracker['habitTemplate']>; label: string; goal: string }[] = [
  { id: 'water', label: 'Drink more water', goal: 'Starts at 64 fl oz a day' },
  { id: 'walk', label: 'Walk more', goal: 'Starts at 30 minutes a day' },
  { id: 'sleep', label: 'Sleep routine', goal: 'Wind down, get ready, lights out' },
  { id: 'exercise', label: 'Exercise', goal: 'Starts at 3 workouts a week' },
  { id: 'reading', label: 'Read', goal: 'Starts at 15 minutes a day' },
  { id: 'mindfulness', label: 'Mindfulness', goal: 'Starts at 10 minutes a day' },
  { id: 'produce', label: 'Fruits & vegetables', goal: 'Starts at 5 servings a day' },
  { id: 'dental', label: 'Dental care', goal: 'Brush morning and night, floss' },
];
const BUILD_GOALS: Partial<Record<NonNullable<Tracker['habitTemplate']>, string>> = { walk: '30', exercise: '3', reading: '15', mindfulness: '10', produce: '5' };

const AREA_SECTION: Partial<Record<OnboardingArea, NavigationSection>> = { habits: 'goals', activity: 'activity', routes: 'routes', weight: 'weight', nutrition: 'nutrition', workouts: 'workouts', supplements: 'supplements' };
const DEFAULT_NAVIGATION: NavigationSection[] = ['activity', 'routes', 'goals', 'weight', 'nutrition', 'workouts', 'supplements'];

/** Bottom tabs in the order the user picked their areas, then everything else. */
export function navigationOrderFromPicks(picks: readonly unknown[]): NavigationSection[] {
  const picked = [...new Set(picks.flatMap((item) => AREA_SECTION[item as OnboardingArea] ?? []))];
  return [...picked, ...DEFAULT_NAVIGATION.filter((item) => !picked.includes(item))];
}

export function trackersFromSetup(draft: OnboardingSetupDraft | undefined, now = new Date()): Tracker[] {
  const today = localDateKey(now);
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const quits = (draft?.quits ?? []).filter((item) => item.name.trim()).map((quit) => {
    const cost = quit.weeklyCost?.trim();
    const valid = !!cost && /^\d+(?:\.\d{1,2})?$/.test(cost) && Number(cost) > 0;
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(quit.startDate) && quit.startDate <= today ? quit.startDate : today;
    const trackerDraft: TrackerDraft = { name: quit.name.trim(), mode: 'abstinence', startDate, startTime: startDate === today ? clock : undefined, icon: quit.icon, color: quit.color,
      savingsExpenses: valid ? [{ id: `expense-${quit.id}`, label: quit.name.trim(), amount: cost!, everyCount: '1', everyUnit: 'week', effectiveDate: startDate }] : undefined };
    return trackerFromDraft(trackerDraft, generateTrackerId());
  });
  const builds = (draft?.builds ?? []).map((template) => {
    if (template === 'water') return trackerFromDraft({ name: 'Water', mode: 'habit', habitTemplate: 'water', startDate: today, icon: '💧', color: colors.habitsNav, waterGoalOz: '64', waterQuickAddOz: '8' }, generateTrackerId());
    const config = GOOD_HABIT_TEMPLATES.find((item) => item.id === template)!;
    return trackerFromDraft({ name: config.title, mode: 'habit', habitTemplate: config.id, startDate: today, icon: config.icon, color: colors.habitsNav, habitGoalValue: BUILD_GOALS[template],
      habitChecklistItems: (config.suggestions ?? []).map((label, index) => ({ id: `step-${index}`, label })), exerciseGoalMode: 'times', exerciseRegimenRows: [], producePresets: [0.5, 1] }, generateTrackerId());
  });
  return [...quits, ...builds];
}

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

/** Valid areas in the order they were picked, without duplicates. */
export function pickedAreas(value: unknown): OnboardingArea[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set(ONBOARDING_AREAS.map(({ id }) => id));
  return [...new Set(value.filter((item): item is OnboardingArea => valid.has(item)))];
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
  const setupTrackers = has('habits') ? trackersFromSetup(draft, now) : [];
  const { onboardingSetupDraft: _draft, ...withoutDraft } = state;
  return {
    ...withoutDraft,
    onboardingStatus: 'complete',
    trackers: [...state.trackers, ...setupTrackers],
    onboardingSelections: selections,
    weightEntries,
    nutritionGoals,
    stepGoals,
    preferences: { ...state.preferences, visibleSections, visibleHealthModules, dashboard, navigationOrder: navigationOrderFromPicks(state.onboardingSelections ?? []) },
  };
}

export async function persistCompletedOnboarding(state: TrackerState, save: (snapshot: string) => Promise<void>) {
  const complete = completeOnboarding(state);
  await save(JSON.stringify(complete));
  return complete;
}
