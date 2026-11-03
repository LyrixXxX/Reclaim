import { AppPreferences, AppSection, HealthModule, NavigationSection, TrackerState } from '@/models/tracker';
import { defaultDashboard, normalizeDashboard } from './dashboard';
import { normalizeHomeGoalColors } from './home-goal-colors';

export const DEFAULT_PREFERENCES: AppPreferences = {
  dashboard: defaultDashboard(),
  hiddenHomeHabitIds: [],
  homeGoalColors: {},
  showQuittingTaperingOnHome: true,
  showTrainingOverviewOnHome: true,
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
      navigationOrder: normalizeNavigationOrder(state.preferences?.navigationOrder),
      // Old Activity included routes; copy its visibility only when no separate Routes choice exists.
      visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, ...(savedSections ?? {}), routes: savedSections?.routes ?? savedSections?.activity ?? false, health: false, cpap: false },
      visibleHealthModules: { bloodPressure: false, medications: false, labs: false },
      includeRouteCaloriesInNutrition: state.preferences?.includeRouteCaloriesInNutrition ?? false,
      includeWorkoutCaloriesInNutrition: state.preferences?.includeWorkoutCaloriesInNutrition ?? false,
      includeSupplementNutrientsInNutrition: state.preferences?.includeSupplementNutrientsInNutrition ?? false,
      featuredTrackerId: typeof state.preferences?.featuredTrackerId === 'string' ? state.preferences.featuredTrackerId : undefined,
      swipeHintSeen: state.preferences?.swipeHintSeen === true || undefined,
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

export function setQuittingTaperingOnHome(state: TrackerState, visible: boolean): TrackerState {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  return { ...state, preferences: { ...preferences, showQuittingTaperingOnHome: visible } };
}

export function trainingOverviewVisibleOnHome(preferences: AppPreferences): boolean {
  return preferences.visibleSections.workouts === true && preferences.showTrainingOverviewOnHome !== false;
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
