import { AppPreferences, AppSection, HealthModule, NavigationSection, TrackerState } from '@/models/tracker';
import { defaultDashboard, normalizeDashboard } from './dashboard';
import { templateConfig } from './good-habit-templates';
import { assignGoalColors, ColoredGoal, normalizeHomeGoalColors } from './home-goal-colors';
import { HomeCardId, normalizeHiddenHomeCards, normalizeHomeCardOrder } from './home-cards';

export const DEFAULT_PREFERENCES: AppPreferences = {
  dashboard: defaultDashboard(),
  hiddenHomeHabitIds: [],
  homeGoalColors: {},
  showQuittingTaperingOnHome: true,
  showTrainingOverviewOnHome: true,
  homeCardOrder: normalizeHomeCardOrder(undefined),
  hiddenHomeCards: [],
  navigationOrder: ['activity', 'routes', 'goals', 'weight', 'nutrition', 'workouts', 'supplements'],
  visibleSections: { goals: true, health: false, cpap: false, weight: true, nutrition: true, activity: false, routes: false, workouts: false, supplements: true },
  visibleHealthModules: { bloodPressure: false, medications: false, labs: false },
  includeRouteCaloriesInNutrition: false,
  includeWorkoutCaloriesInNutrition: false,
  includeSupplementNutrientsInNutrition: false,
};

export function normalizeNavigationOrder(order: unknown): NavigationSection[] {
  const defaults = DEFAULT_PREFERENCES.navigationOrder!;
  const saved = Array.isArray(order) ? order.filter((item): item is NavigationSection => defaults.includes(item) && typeof item === 'string') : [];
  return [...new Set([...saved, ...defaults])];
}

export function moveNavigationSection(order: NavigationSection[], from: number, to: number): NavigationSection[] {
  const normalized = normalizeNavigationOrder(order);
  if (from < 0 || from >= normalized.length || to < 0 || to >= normalized.length || from === to) return normalized;
  const next = [...normalized];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function hiddenHabitsDestination(sections: AppPreferences['visibleSections']) {
  if (sections.weight) return '/weight' as const;
  if (sections.nutrition) return '/nutrition' as const;
  if (sections.activity) return '/activity' as const;
  if (sections.routes) return '/routes' as const;
  return '/settings' as const;
}

function normalizeStartHere(value: unknown): AppPreferences['startHere'] {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as { done?: unknown; collapsed?: unknown; dismissed?: unknown };
  const done = Array.isArray(raw.done) ? [...new Set(raw.done.filter((id): id is string => typeof id === 'string'))] : undefined;
  return { done, collapsed: raw.collapsed === true || undefined, dismissed: raw.dismissed === true || undefined };
}

export function migratePreferences(state: TrackerState): TrackerState {
  const savedSections = state.preferences?.visibleSections;
  return {
    ...state,
    preferences: {
      dashboard: normalizeDashboard(state.preferences?.dashboard),
      hiddenHomeHabitIds: Array.isArray(state.preferences?.hiddenHomeHabitIds) ? state.preferences.hiddenHomeHabitIds.filter((id): id is string => typeof id === 'string') : [],
      homeGoalColors: normalizeHomeGoalColors(state.preferences?.homeGoalColors),
      showQuittingTaperingOnHome: state.preferences?.showQuittingTaperingOnHome !== false,
      showTrainingOverviewOnHome: state.preferences?.showTrainingOverviewOnHome !== false,
      homeCardOrder: normalizeHomeCardOrder(state.preferences?.homeCardOrder),
      hiddenHomeCards: normalizeHiddenHomeCards(state.preferences?.hiddenHomeCards),
      navigationOrder: normalizeNavigationOrder(state.preferences?.navigationOrder),
      // Old Activity included routes; copy its visibility only when no separate Routes choice exists.
      visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, ...(savedSections ?? {}), routes: savedSections?.routes ?? savedSections?.activity ?? false, health: false, cpap: false },
      visibleHealthModules: { bloodPressure: false, medications: false, labs: false },
      includeRouteCaloriesInNutrition: state.preferences?.includeRouteCaloriesInNutrition ?? false,
      includeWorkoutCaloriesInNutrition: state.preferences?.includeWorkoutCaloriesInNutrition ?? false,
      includeSupplementNutrientsInNutrition: state.preferences?.includeSupplementNutrientsInNutrition ?? false,
      featuredTrackerId: typeof state.preferences?.featuredTrackerId === 'string' ? state.preferences.featuredTrackerId : undefined,
      swipeHintSeen: state.preferences?.swipeHintSeen === true || undefined,
      startHere: normalizeStartHere(state.preferences?.startHere),
      dismissedNotices: Array.isArray(state.preferences?.dismissedNotices) ? state.preferences.dismissedNotices.filter((id): id is string => typeof id === 'string').slice(-100) : undefined,
      seenBadges: Array.isArray(state.preferences?.seenBadges) ? state.preferences.seenBadges.filter((id): id is string => typeof id === 'string') : undefined,
    },
  };
}

export function setHomeHabitVisible(state: TrackerState, id: string, visible: boolean): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const hidden = new Set(preferences.hiddenHomeHabitIds ?? []);
  if (visible) hidden.delete(id); else hidden.add(id);
  return { ...state, preferences: { ...preferences, hiddenHomeHabitIds: [...hidden] } };
}

export function setHomeGoalColors(state: TrackerState, selected: Record<string, string>): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, homeGoalColors: normalizeHomeGoalColors(selected) } };
}

/** Everything that can hold a Home color, including sections and habits that are hidden for now. */
export function homeColorGoals(state: Pick<TrackerState, 'trackers' | 'stepGoals' | 'nutritionGoals'>): ColoredGoal[] {
  return [
    ...(state.stepGoals?.length ? [{ id: 'steps', kind: 'steps' }] : []),
    ...(state.nutritionGoals?.length ? [{ id: 'nutrition', kind: 'nutrition' }] : []),
    ...state.trackers.filter((item) => !item.archived && (item.habitTemplate === 'water' || templateConfig(item.habitTemplate))).map((item) => ({ id: item.id, kind: item.habitTemplate ?? 'habit' })),
  ];
}

/** Returns the same state when every goal already has its own color, so calling it often is cheap. */
export function assignHomeGoalColors(state: TrackerState): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const saved = preferences.homeGoalColors ?? {};
  const assigned = assignGoalColors(homeColorGoals(state), saved);
  const changed = Object.keys(assigned).some((id) => assigned[id] !== saved[id]);
  return changed ? { ...state, preferences: { ...preferences, homeGoalColors: assigned } } : state;
}

export function setQuittingTaperingOnHome(state: TrackerState, visible: boolean): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, showQuittingTaperingOnHome: visible } };
}

export function trainingOverviewVisibleOnHome(preferences: AppPreferences): boolean {
  return preferences.visibleSections.workouts === true && preferences.showTrainingOverviewOnHome !== false;
}

export function setHomeCards(state: TrackerState, order: readonly HomeCardId[], hidden: readonly HomeCardId[]): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, homeCardOrder: normalizeHomeCardOrder(order), hiddenHomeCards: normalizeHiddenHomeCards(hidden) } };
}

export function setTrainingOverviewOnHome(state: TrackerState, visible: boolean): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, showTrainingOverviewOnHome: visible } };
}

export function setNavigationOrder(state: TrackerState, order: NavigationSection[]): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, navigationOrder: normalizeNavigationOrder(order) } };
}

export function setSectionVisible(state: TrackerState, section: AppSection, visible: boolean): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, visibleSections: { ...preferences.visibleSections, [section]: visible } } };
}

export function setHealthModuleVisible(state: TrackerState, module: HealthModule, visible: boolean): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, visibleHealthModules: { ...preferences.visibleHealthModules, [module]: visible } } };
}

export function setRouteCaloriesInNutrition(state: TrackerState, enabled: boolean): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, includeRouteCaloriesInNutrition: enabled } };
}
