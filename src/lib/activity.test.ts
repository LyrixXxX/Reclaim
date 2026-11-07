import { activeRouteDurationMs, activityDurationMs, averagePaceMinPerMile, estimatedRouteCalories, latestRouteWeightKg, pointDistanceMeters, routeCaloriesForDate, routeDistanceMeters, routeMovingDurationMs, validActivityPoint, movedEnoughToUpdate } from './activity';
import { createFreshState, completeOnboarding } from './onboarding';
import { DEFAULT_PREFERENCES, migratePreferences } from './preferences';
import { createReclaimBackup, parseReclaimBackup } from './backup';

describe('Activity route data', () => {
  const origin = { latitude: 41.88, longitude: -87.63, timestamp: 1_000, accuracy: 5, segment: 0 };
  const near = { latitude: 41.8801, longitude: -87.63, timestamp: 6_000, accuracy: 5, segment: 0 };
  test('measures real movement, ignores paused gaps and rejects GPS jumps', () => {
    expect(pointDistanceMeters(origin, near)).toBeGreaterThan(10);
    expect(validActivityPoint(near, origin)).toBe(true);
    expect(validActivityPoint({ ...near, latitude: 42 }, origin)).toBe(false);
    expect(validActivityPoint({ ...near, accuracy: 250 }, origin)).toBe(false);
    expect(routeDistanceMeters([origin, near, { ...near, latitude: 42, segment: 1 }])).toBeCloseTo(pointDistanceMeters(origin, near));
  });
  test('filters stationary drift without losing ordinary movement or joining paused segments', () => {
    const wobble = { ...origin, latitude: origin.latitude + 0.00004, timestamp: 6_000 };
    const walking = { ...origin, latitude: origin.latitude + 0.00012, timestamp: 11_000 };
    expect(validActivityPoint(wobble, origin)).toBe(false);
    expect(validActivityPoint(walking, origin)).toBe(true);
    expect(validActivityPoint({ ...walking, accuracy: 80 }, origin)).toBe(false);
    expect(validActivityPoint({ ...walking, accuracy: 40 }, origin)).toBe(false);
    expect(validActivityPoint({ ...origin, accuracy: 40 })).toBe(false);
    expect(validActivityPoint({ ...walking, segment: 1 }, origin)).toBe(true);
    expect(routeDistanceMeters([origin, walking, { ...walking, segment: 1, latitude: 42 }])).toBeCloseTo(pointDistanceMeters(origin, walking));
  });
  test('subtracts pauses from duration', () => {
    expect(activityDurationMs({ startedAt: '2026-09-25T10:00:00Z', endedAt: '2026-09-25T11:00:00Z', pausedMs: 600_000 })).toBe(3_000_000);
    const oldRoute = { id: 'old', kind: 'hike' as const, startedAt: '2026-09-25T10:00:00Z', endedAt: '2026-09-25T11:00:00Z', pausedMs: 0, distanceMeters: 1000, points: [] };
    expect(routeMovingDurationMs(oldRoute)).toBeNull();
    expect(routeMovingDurationMs({ ...oldRoute, movingMs: 1_200_000 })).toBe(1_200_000);
  });
  test('uses active time for pace and a weight-based exercise estimate', () => {
    expect(activeRouteDurationMs({ startedAt: '2026-09-25T10:00:00Z', pausedAt: '2026-09-25T10:30:00Z', pausedMs: 300_000 }, Date.parse('2026-09-25T11:00:00Z'))).toBe(1_500_000);
    expect(averagePaceMinPerMile(1609.344, 1_200_000)).toBeCloseTo(20);
    expect(averagePaceMinPerMile(10, 1_200_000)).toBeNull();
    expect(estimatedRouteCalories(1609.344, 1_200_000, 90)).toBe(75);
    expect(estimatedRouteCalories(1609.344, 1_200_000, 90, 'hike')).toBe(75);
    expect(estimatedRouteCalories(1609.344, 1_200_000, 90, 'hike', 100)).toBe(156);
    expect(estimatedRouteCalories(1609.344, 720_000, 90, 'run')).toBeGreaterThan(estimatedRouteCalories(1609.344, 1_200_000, 90)!);
    expect(estimatedRouteCalories(1609.344, 1_200_000)).toBeNull();
  });
  test('uses the latest applicable weight and never changes saved route estimates', () => {
    expect(latestRouteWeightKg([{ date: '2026-09-01', weight: 220, unit: 'lb' }, { date: '2026-09-26', weight: 90, unit: 'kg' }], '2026-09-25')).toBeCloseTo(99.7903, 3);
    const route = { id: 'route-new', kind: 'route' as const, startedAt: '2026-09-25T18:00:00Z', endedAt: '2026-09-25T19:00:00Z', pausedMs: 0, distanceMeters: 1609.344, points: [origin, near], estimateWeightKg: 90, estimatedCalories: 75, name: 'Evening loop', notes: 'Felt good.' };
    expect(routeCaloriesForDate([route], '2026-09-25', false)).toBe(0);
    expect(routeCaloriesForDate([route], '2026-09-25', true)).toBe(75);
    expect(routeCaloriesForDate([route], '2026-09-24', true)).toBe(0);
    const backup = createReclaimBackup({ ...createFreshState(), activityRoutes: [route] });
    expect(parseReclaimBackup(JSON.stringify(backup)).state.activityRoutes).toEqual([route]);
    expect(parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...createFreshState(), activityRoutes: [{ ...route, kind: 'run' }] }))).state.activityRoutes?.[0].kind).toBe('run');
    const timed = { ...route, movingMs: 2_400_000, stoppedMs: 1_200_000, unclassifiedMs: 0, manualPauseIntervals: [], stationaryIntervals: [{ startedAt: '2026-09-25T18:20:00Z', endedAt: '2026-09-25T18:40:00Z' }], autoPauseIntervals: [] };
    expect(parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...createFreshState(), activityRoutes: [timed] }))).state.activityRoutes).toEqual([timed]);
  });
  test('keeps existing Activity hidden and includes routes in backups', () => {
    const existing = migratePreferences({ trackers: [], checkIns: [] });
    expect(existing.preferences?.visibleSections.activity).toBe(false);
    expect(existing.preferences?.visibleSections.routes).toBe(false);
    const fresh = completeOnboarding({ ...createFreshState(), onboardingSelections: ['activity'] });
    expect(fresh.preferences?.visibleSections.activity).toBe(true);
    expect(fresh.preferences?.visibleSections.routes).toBe(false);
    expect(fresh.preferences?.dashboard?.filter((widget) => widget.visible).map((widget) => widget.id)).toEqual(['activity']);
    const route = { id: 'route-1', kind: 'hike' as const, startedAt: '2026-09-25T10:00:00Z', endedAt: '2026-09-25T11:00:00Z', pausedMs: 0, distanceMeters: 11, points: [origin, near] };
    expect(parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...fresh, activityRoutes: [route] }))).state.activityRoutes).toEqual([route]);
  });
  test('routes-only setup does not enable steps or create a step goal', () => {
    const routes = completeOnboarding({ ...createFreshState(), onboardingSelections: ['routes'] });
    expect(routes.preferences?.visibleSections.activity).toBe(false);
    expect(routes.preferences?.visibleSections.routes).toBe(true);
    expect(routes.stepGoals).toBeUndefined();
    expect(routes.preferences?.dashboard?.find((widget) => widget.id === 'activity')?.visible).toBe(false);
  });
  test('existing combined Activity visibility migrates to both tabs once', () => {
    const old = { ...createFreshState(), preferences: { ...DEFAULT_PREFERENCES, visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, activity: true, routes: undefined } } };
    const migrated = migratePreferences(old);
    expect(migrated.preferences?.visibleSections).toMatchObject({ activity: true, routes: true });
    expect(migratePreferences({ ...migrated, preferences: { ...migrated.preferences!, visibleSections: { ...migrated.preferences!.visibleSections, routes: false } } }).preferences?.visibleSections.routes).toBe(false);
  });
});

test('GPS drift does not move the map, but a real move does', () => {
  expect(movedEnoughToUpdate(null, [-85, 36])).toBe(true);
  expect(movedEnoughToUpdate([-85, 36], [-85, 36.00002])).toBe(false);
  expect(movedEnoughToUpdate([-85, 36], [-85, 36.0002])).toBe(true);
});
