import { createSeedState } from '@/data/seed';
import { DashboardWidget, Medication, TrackerState } from '@/models/tracker';
import { createReclaimBackup, parseReclaimBackup } from './backup';
import { DASHBOARD_WIDGETS, dashboardWidgetAllowed, defaultDashboard, homeSecondaryWidgets, moveDashboardWidget, normalizeDashboard, saveDashboardLayout } from './dashboard';
import { dashboardContent, dashboardDate } from './dashboard-content';
import { DEFAULT_PREFERENCES, migratePreferences, setHealthModuleVisible, setSectionVisible } from './preferences';

const empty: TrackerState = { trackers: [], checkIns: [] };
const now = new Date(2026, 8, 22, 10, 30);
const widget = (id: DashboardWidget['id']): DashboardWidget => ({ id, visible: true, expanded: true });

describe('customizable dashboard', () => {
  test('Steps summary does not include saved route details', () => {
    const state: TrackerState = { ...empty, activityRoutes: [{ id: 'route-1', kind: 'walk', startedAt: now.toISOString(), endedAt: now.toISOString(), pausedMs: 0, distanceMeters: 2500, points: [] }] };
    const content = dashboardContent(state, widget('activity'), now, { status: 'available', count: 1234 });
    expect(content.value).toBe('1,234 steps');
    expect(content.rows).toEqual([]);
  });
  test('a saved nutrition target appears on Home without pretending food was logged', () => {
    const state: TrackerState = { ...empty, nutritionGoals: [{ id: 'goal', effectiveDate: '2026-09-22', recordedAt: now.toISOString(), carbsGrams: 200, proteinGrams: 100, fatGrams: 50, fiberGrams: 25 }] };
    const content = dashboardContent(state, widget('nutrition'), now);
    expect(content.value).toBe('1,650 kcal target');
    expect(content.caption).toContain('no food logged');
    expect(content.rows).toHaveLength(4);
  });
  test('Home shows only the extra Weight card while retaining other widget choices', () => {
    const layout = defaultDashboard();
    const preferences = { ...DEFAULT_PREFERENCES, dashboard: layout };
    expect(homeSecondaryWidgets(preferences).map((item) => item.id)).toEqual(['weight']);
    expect(preferences.dashboard).toEqual(layout);
    expect(homeSecondaryWidgets({ ...preferences, dashboard: layout.map((item) => item.id === 'weight' ? { ...item, visible: false } : item) })).toEqual([]);
    expect(homeSecondaryWidgets({ ...preferences, visibleSections: { ...preferences.visibleSections, weight: false } })).toEqual([]);
  });
  test('legacy state gains defaults without replacing data', () => {
    const seed = createSeedState();
    const result = migratePreferences(seed);
    expect(result.trackers).toBe(seed.trackers);
    expect(result.taperSteps).toBe(seed.taperSteps);
    expect(result.preferences?.dashboard).toEqual(defaultDashboard());
  });
  test('keeps layout order, selection and density across migration and backup', () => {
    const layout = moveDashboardWidget(defaultDashboard(), 'weight', 0).map((item) => item.id === 'labs' ? { ...item, visible: true, expanded: false, selectedIds: ['glucose'] } : item);
    const saved = saveDashboardLayout(createSeedState(), DEFAULT_PREFERENCES, layout);
    const restored = migratePreferences(parseReclaimBackup(JSON.stringify(createReclaimBackup(saved))).state);
    expect(restored.preferences?.dashboard).toEqual(layout);
  });
  test('invalid and duplicate IDs cannot duplicate widgets; missing widgets stay hidden', () => {
    const rows = normalizeDashboard([{ id: 'labs', visible: true }, { id: 'nutrition', visible: true, selectedIds: ['a', 'a', 3] }, { id: 'nutrition' }, { id: 'unknown' }, null]);
    expect(rows).toHaveLength(DASHBOARD_WIDGETS.length);
    expect(rows[0]).toEqual({ id: 'nutrition', visible: true, expanded: true, selectedIds: ['a'] });
    expect(rows.slice(1).every((item) => !item.visible)).toBe(true);
  });
  test('retired Quick Actions disappears from older layouts without changing remaining order', () => {
    const legacy = [{ id: 'weight' as const, visible: true, expanded: false }, { id: 'quickActions' as const, visible: true, expanded: true }, { id: 'cpap' as const, visible: true, expanded: true }, { id: 'nutrition' as const, visible: true, expanded: true }];
    expect(normalizeDashboard(legacy).slice(0, 2))
      .toEqual([{ id: 'weight', visible: true, expanded: false }, { id: 'nutrition', visible: true, expanded: true }]);
    const saved = { ...createSeedState(), preferences: { ...DEFAULT_PREFERENCES, dashboard: legacy } };
    const restored = migratePreferences(parseReclaimBackup(JSON.stringify(createReclaimBackup(saved))).state);
    expect(restored.preferences?.dashboard?.slice(0, 2)).toEqual([{ id: 'weight', visible: true, expanded: false }, { id: 'nutrition', visible: true, expanded: true }]);
    expect(restored.trackers).toEqual(saved.trackers);
  });
  test('dragging and arrow moves clamp at list boundaries without mutating a draft', () => {
    const original = defaultDashboard();
    const before = JSON.stringify(original);
    const first = moveDashboardWidget(original, 'habits', -99);
    expect(first[0].id).toBe('habits');
    expect(moveDashboardWidget(first, 'habits', 99).at(-1)?.id).toBe('habits');
    expect(JSON.stringify(original)).toBe(before);
  });
  test('canceling a draft or preparing defaults does not change saved preferences', () => {
    const saved = saveDashboardLayout(empty, DEFAULT_PREFERENCES, defaultDashboard());
    const before = JSON.stringify(saved);
    moveDashboardWidget(normalizeDashboard(saved.preferences?.dashboard), 'weight', 0);
    defaultDashboard();
    expect(JSON.stringify(saved)).toBe(before);
  });
  test('hiding every widget keeps all records', () => {
    const seed = createSeedState();
    const saved = saveDashboardLayout(seed, DEFAULT_PREFERENCES, defaultDashboard().map((item) => ({ ...item, visible: false })));
    expect(saved.trackers).toBe(seed.trackers);
    expect(saved.taperSteps).toBe(seed.taperSteps);
    expect(saved.preferences?.dashboard?.some((item) => item.visible)).toBe(false);
  });
  test('hidden sections suppress related widgets without losing layout settings', () => {
    const hidden = setSectionVisible(migratePreferences(empty), 'health', false);
    for (const id of ['labs', 'medications', 'bloodPressure'] as const) expect(dashboardWidgetAllowed(id, hidden.preferences!)).toBe(false);
    expect(hidden.preferences?.dashboard).toEqual(defaultDashboard());
    const restored = setSectionVisible(hidden, 'health', true);
    expect(dashboardWidgetAllowed('medications', restored.preferences!)).toBe(false);
  });
  test('hidden health modules and Habits stay hidden independently', () => {
    const state = setHealthModuleVisible(setSectionVisible(migratePreferences(empty), 'goals', false), 'labs', false);
    expect(dashboardWidgetAllowed('labs', state.preferences!)).toBe(false);
    expect(dashboardWidgetAllowed('habits', state.preferences!)).toBe(false);
    expect(dashboardWidgetAllowed('medications', state.preferences!)).toBe(false);
  });
  test('does not show an empty quick-action widget when all modules are hidden', () => {
    const preferences = { visibleSections: { goals: false, health: true, cpap: false, weight: false, nutrition: false, activity: false }, visibleHealthModules: { labs: false, bloodPressure: false, medications: false } };
    expect(dashboardWidgetAllowed('quickActions', preferences)).toBe(false);
  });
});

describe('dashboard summaries', () => {
  test('missing readings are not represented as zero readings', () => {
    for (const id of ['nutrition', 'cpap', 'weight', 'bloodPressure'] as const) expect(dashboardContent(empty, widget(id), now).value).toBe('No data yet');
  });
  test('nutrition counts the local current date and keeps supplied calories', () => {
    const entry = { id: 'food', name: 'Meal', eventDate: '2026-09-22', mealGroupId: 'lunch', mealLabel: 'Lunch', servingLabel: 'meal', servings: 1, nutrients: { carbsGrams: 34, proteinGrams: 72, fatGrams: 37, fiberGrams: 22 }, statedCalories: 678, source: 'manual' as const, recordedAt: now.toISOString(), updatedAt: now.toISOString() };
    const state = { ...empty, nutritionEntries: [entry, { ...entry, id: 'yesterday', eventDate: '2026-09-21' }] };
    expect(dashboardContent(state, widget('nutrition'), now).value).toBe('678 kcal');
    expect(dashboardContent(state, widget('nutrition'), now).caption).toBe('Today · 1 food entry');
    expect(dashboardContent({ ...state, nutritionEntries: [entry, { ...entry, id: 'second' }] }, widget('nutrition'), now).caption).toBe('Today · 2 food entries');
    expect(dashboardContent(state, widget('nutrition'), now).rows[1].value).toBe('72 g');
    expect(dashboardContent(state, widget('nutrition'), new Date(2026, 8, 23)).value).toBe('No data yet');
  });
  test('colors calorie totals only when a goal is set, switching after the target is exceeded', () => {
    const entry = { id: 'food', name: 'Meal', eventDate: '2026-09-22', mealGroupId: 'lunch', mealLabel: 'Lunch', servingLabel: 'meal', servings: 1, nutrients: { carbsGrams: 34, proteinGrams: 72, fatGrams: 37, fiberGrams: 22 }, statedCalories: 678, source: 'manual' as const, recordedAt: now.toISOString(), updatedAt: now.toISOString() };
    const goal = { id: 'goal', effectiveDate: '2026-09-01', carbsGrams: 50, proteinGrams: 100, fatGrams: 50, fiberGrams: 25, recordedAt: now.toISOString() };
    const state = { ...empty, nutritionEntries: [entry], nutritionGoals: [goal] };
    expect(dashboardContent(state, widget('nutrition'), now).calorieStatus).toBe('within');
    expect(dashboardContent({ ...state, nutritionEntries: [entry, { ...entry, id: 'second' }] }, widget('nutrition'), now).calorieStatus).toBe('over');
    expect(dashboardContent({ ...state, nutritionGoals: [] }, widget('nutrition'), now).calorieStatus).toBeUndefined();
  });
  test('weight keeps the latest date visible and never combines units', () => {
    const state: TrackerState = { ...empty, weightEntries: [{ id: 'a', date: '2026-09-15', weight: 100, unit: 'kg', recordedAt: '' }, { id: 'b', date: '2026-09-20', weight: 220, unit: 'lb', recordedAt: '' }] };
    const content = dashboardContent(state, widget('weight'), now);
    expect(content.value).toBe('220 lb');
    expect(content.caption).toContain('Sep 20, 2026');
    expect(content.rows[0]).toEqual({ label: 'Average of latest 1 entries', value: '220 lb' });
    expect(content.trend).toHaveLength(1);
  });
  test('lab selections remain distinct from their names and show latest dates and units', () => {
    const state: TrackerState = { ...empty, labTrackers: [{ id: 'a', name: 'Glucose', createdAt: '' }, { id: 'b', name: 'Glucose', createdAt: '' }], labResults: [{ id: 'r', labTrackerId: 'b', panelDate: '2026-08-27', marker: 'Glucose', value: 86, unit: 'mg/dL', recordedAt: '' }] };
    const content = dashboardContent(state, { ...widget('labs'), selectedIds: ['b'] }, now);
    expect(content.rows).toEqual([{ label: 'Glucose · Aug 27, 2026', value: '86 mg/dL' }]);
    expect(dashboardContent(state, { ...widget('labs'), selectedIds: [] }, now).rows).toEqual([]);
  });
  test('approximate zero-dose habits keep approximate wording', () => {
    const content = dashboardContent(createSeedState(), { ...widget('habits'), selectedIds: ['caffeine'] }, now);
    expect(content.rows[0].value).toContain('Quit approximately Jul 25, 2026');
    expect(content.rows[0].value).not.toMatch(/\d+h|\d+m/);
  });
  test('habit streak summaries respect a recorded lapse', () => {
    const state: TrackerState = { ...empty, trackers: [{ id: 'a', name: 'Example', icon: '', color: '', mode: 'abstinence', startedAt: '2026-07-20T00:00:00' }], historicalEntries: [{ id: 'lapse', trackerId: 'a', eventDate: '2026-09-21', outcome: 'lapse', recordedAt: '' }] };
    expect(dashboardContent(state, widget('habits'), now).rows[0].value).toBe('0d 10h 30m · current streak');
  });
  test('explains the three-row habit preview without hiding the selected total', () => {
    const state: TrackerState = { ...empty, trackers: Array.from({ length: 5 }, (_, index) => ({ id: String(index), name: 'Habit', icon: '', color: '', mode: 'abstinence' as const })) };
    const content = dashboardContent(state, widget('habits'), now);
    expect(content.value).toBe('5 selected habits');
    expect(content.caption).toBe('Showing 3 of 5 · open Habits to view all.');
    expect(content.rows).toHaveLength(3);
    expect(dashboardContent({ ...state, trackers: state.trackers.slice(0, 1) }, widget('habits'), now).value).toBe('1 selected habit');
  });
  test('medications exclude logged slots and nonmatching weekdays, using AM/PM', () => {
    const medication: Medication = { id: 'med', name: 'Example', remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '', schedule: { type: 'daily', times: ['09:00', '18:00'] } };
    const state: TrackerState = { ...empty, medications: [medication, { ...medication, id: 'weekly', schedule: { type: 'weekly', weekdays: [1], times: ['08:00'] } }], medicationEvents: [{ id: 'taken', medicationId: 'med', scheduledFor: '2026-09-22T09:00', occurredAt: now.toISOString(), outcome: 'taken' }] };
    const content = dashboardContent(state, widget('medications'), now);
    expect(content.value).toBe('1 taken · 0 skipped');
    expect(content.rows).toEqual([{ label: 'Example', value: '6:00 PM' }]);
  });
  test('formats calendar dates without shifting into the previous day', () => {
    expect(dashboardDate('2026-09-22')).toBe('Sep 22, 2026');
  });
  test('a missing or future abstinence start is not presented as an active timed streak', () => {
    const state: TrackerState = { ...empty, trackers: [{ id: 'a', name: 'Example', icon: '', color: '', mode: 'abstinence' }] };
    expect(dashboardContent(state, widget('habits'), now).rows[0].value).toBe('No start date');
    state.trackers[0].startedAt = '2026-10-01T00:00:00';
    expect(dashboardContent(state, widget('habits'), now).rows[0].value).toBe('Starts Oct 1, 2026');
  });
});
