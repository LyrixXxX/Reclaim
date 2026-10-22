import { AppPreferences, AppSection, HealthModule, NavigationSection, TrackerState } from '@/models/tracker';
import { defaultDashboard, normalizeDashboard } from './dashboard';

export const DEFAULT_PREFERENCES: AppPreferences = {
  dashboard: defaultDashboard(),
  navigationOrder: ['activity', 'routes', 'goals', 'weight', 'nutrition', 'workouts'],
  visibleSections: { goals: true, health: false, cpap: false, weight: true, nutrition: true, activity: false, routes: false, workouts: false },
  visibleHealthModules: { bloodPressure: false, medications: false, labs: false },
  includeRouteCaloriesInNutrition: false,
  includeWorkoutCaloriesInNutrition: false,
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
      navigationOrder: normalizeNavigationOrder(state.preferences?.navigationOrder),
      // Old Activity included routes; copy its visibility only when no separate Routes choice exists.
      visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, ...(savedSections ?? {}), routes: savedSections?.routes ?? savedSections?.activity ?? false, health: false, cpap: false },
      visibleHealthModules: { bloodPressure: false, medications: false, labs: false },
      includeRouteCaloriesInNutrition: state.preferences?.includeRouteCaloriesInNutrition ?? false,
      includeWorkoutCaloriesInNutrition: state.preferences?.includeWorkoutCaloriesInNutrition ?? false,
    },
  };
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
