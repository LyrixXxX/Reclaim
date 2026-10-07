import { AppPreferences, AppSection, HealthModule, TrackerState } from '@/models/tracker';
import { defaultDashboard, normalizeDashboard } from './dashboard';

export const DEFAULT_PREFERENCES: AppPreferences = {
  dashboard: defaultDashboard(),
  visibleSections: { goals: true, health: true, cpap: true, weight: true, nutrition: true, activity: false },
  visibleHealthModules: { bloodPressure: true, medications: true, labs: true },
  includeRouteCaloriesInNutrition: false,
};

export function hiddenHabitsDestination(sections: AppPreferences['visibleSections']) {
  if (sections.health) return '/health' as const;
  if (sections.cpap) return '/cpap' as const;
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
      visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, ...(state.preferences?.visibleSections ?? {}) },
      visibleHealthModules: { ...DEFAULT_PREFERENCES.visibleHealthModules, ...(state.preferences?.visibleHealthModules ?? {}) },
      includeRouteCaloriesInNutrition: state.preferences?.includeRouteCaloriesInNutrition ?? false,
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
