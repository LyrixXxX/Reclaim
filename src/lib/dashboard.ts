import { AppPreferences, DashboardWidget, DashboardWidgetId, TrackerState } from '@/models/tracker';

export const DASHBOARD_WIDGETS: { id: DashboardWidgetId; title: string; description: string }[] = [
  { id: 'nutrition', title: 'Nutrition', description: 'Today’s calories, macros, and fiber.' },
  { id: 'weight', title: 'Weight', description: 'Latest weigh-in and recent recorded trend.' },
  { id: 'habits', title: 'Habits', description: 'Your selected active habits.' },
  { id: 'activity', title: 'Activity', description: 'Daily steps and saved routes.' },
];

export function defaultDashboard(): DashboardWidget[] {
  return DASHBOARD_WIDGETS.map(({ id }) => ({ id, visible: !['labs', 'habits'].includes(id), expanded: true }));
}

/** Additive migration: keep user order/choices, discard unknown IDs and duplicates. */
export function normalizeDashboard(value: unknown): DashboardWidget[] {
  if (!Array.isArray(value)) return defaultDashboard();
  const rows: DashboardWidget[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || !DASHBOARD_WIDGETS.some((widget) => widget.id === item.id) || rows.some((widget) => widget.id === item.id)) continue;
    rows.push({ id: item.id, visible: item.visible === true, expanded: item.expanded !== false,
      ...(Array.isArray(item.selectedIds) ? { selectedIds: [...new Set<string>(item.selectedIds.filter((id: unknown): id is string => typeof id === 'string'))] } : {}) });
  }
  return [...rows, ...defaultDashboard().filter((item) => !rows.some((row) => row.id === item.id)).map((item) => ({ ...item, visible: false }))];
}

export function moveDashboardWidget(widgets: DashboardWidget[], id: DashboardWidgetId, target: number) {
  const from = widgets.findIndex((widget) => widget.id === id);
  if (from < 0 || !Number.isFinite(target)) return widgets;
  const result = [...widgets];
  const [item] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(widgets.length - 1, Math.round(target))), 0, item);
  return result;
}

export function dashboardWidgetAllowed(id: DashboardWidgetId, preferences: AppPreferences) {
  const { visibleSections: sections } = preferences;
  if (id === 'quickActions' || id === 'cpap' || id === 'bloodPressure' || id === 'labs' || id === 'medications') return false;
  if (id === 'habits') return sections.goals;
  return sections[id];
}

/** The goal tiles already summarize other sections; the lower Home area shows Weight only. */
export function homeSecondaryWidgets(preferences: AppPreferences): DashboardWidget[] {
  return normalizeDashboard(preferences.dashboard).filter((widget) =>
    widget.id === 'weight' && widget.visible && dashboardWidgetAllowed(widget.id, preferences));
}

export function saveDashboardLayout(state: TrackerState, preferences: AppPreferences, widgets: DashboardWidget[]): TrackerState {
  return { ...state, preferences: { ...preferences, dashboard: normalizeDashboard(widgets) } };
}
