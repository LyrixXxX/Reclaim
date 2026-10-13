import { DASHBOARD_WIDGETS } from './dashboard';
import { AppPreferences, DashboardWidgetId, OnboardingArea, TrackerState } from '@/models/tracker';

export const ONBOARDING_AREAS: { id: OnboardingArea; label: string; description: string }[] = [
  { id: 'habits', label: 'Habits', description: 'Track habits you are quitting, reducing, or building.' },
  { id: 'nutrition', label: 'Nutrition', description: 'Log food, macros, and fiber.' },
  { id: 'weight', label: 'Weight', description: 'Follow weigh-ins and long-term trends.' },
  { id: 'activity', label: 'Activity + Map', description: 'See daily steps and record walks, hikes, or runs.' },
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

export function completeOnboarding(state: TrackerState): TrackerState {
  const selections = normalizeOnboardingSelections(state.onboardingSelections);
  const has = (area: OnboardingArea) => selections.includes(area);
  const visibleSections: AppPreferences['visibleSections'] = {
    goals: has('habits'), health: false, cpap: false, weight: has('weight'), nutrition: has('nutrition'), activity: has('activity'),
  };
  const visibleHealthModules: AppPreferences['visibleHealthModules'] = {
    bloodPressure: false, medications: false, labs: false,
  };
  const selectedWidgets = selections.map((id): DashboardWidgetId => id === 'habits' ? 'habits' : id);
  const widgetOrder: DashboardWidgetId[] = [
    ...selectedWidgets,
    ...DASHBOARD_WIDGETS.map(({ id }) => id).filter((id) => !selectedWidgets.includes(id)),
  ];
  const dashboard = widgetOrder.map((id) => ({ id, visible: selectedWidgets.includes(id), expanded: false }));
  return {
    ...state,
    onboardingStatus: 'complete',
    onboardingSelections: selections,
    preferences: { ...state.preferences, visibleSections, visibleHealthModules, dashboard },
  };
}

export async function persistCompletedOnboarding(state: TrackerState, save: (snapshot: string) => Promise<void>) {
  const complete = completeOnboarding(state);
  await save(JSON.stringify(complete));
  return complete;
}
