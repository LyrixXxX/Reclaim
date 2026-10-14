import { AppPreferences, AppSection, HealthModule, TrackerState } from '@/models/tracker';
import { defaultDashboard, normalizeDashboard } from './dashboard';

export const DEFAULT_PREFERENCES: AppPreferences = {
  dashboard: defaultDashboard(),
  visibleSections: { goals: true, health: false, cpap: false, weight: true, nutrition: true, activity: false, workouts: false },
  visibleHealthModules: { bloodPressure: false, medications: false, labs: false },
  includeRouteCaloriesInNutrition: false,
  includeWorkoutCaloriesInNutrition: false,
};

export function hiddenHabitsDestination(sections: AppPreferences['visibleSections']) {
  if (sections.weight) return '/weight' as const;
  if (sections.nutrition) return '/nutrition' as const;
  if (sections.activity) return '/activity' as const;
  return '/settings' as const;
}

export function migratePreferences(state: TrackerState): TrackerState {
  return {
    ...state,
    preferences: {
      dashboard: normalizeDashboard(state.preferences?.dashboard),
      visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, ...(state.preferences?.visibleSections ?? {}), health: false, cpap: false },
      visibleHealthModules: { bloodPressure: false, medications: false, labs: false },
      includeRouteCaloriesInNutrition: state.preferences?.includeRouteCaloriesInNutrition ?? false,
      includeWorkoutCaloriesInNutrition: state.preferences?.includeWorkoutCaloriesInNutrition ?? false,
    },
  };
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
