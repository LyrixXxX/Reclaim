import { activeRouteDurationMs, activityDurationMs, averagePaceMinPerMile, estimatedRouteCalories, latestRouteWeightKg, pointDistanceMeters, routeCaloriesForDate, routeDistanceMeters, validActivityPoint } from './activity';
import { createFreshState, completeOnboarding } from './onboarding';
import { migratePreferences } from './preferences';
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
  test('subtracts pauses from duration', () => {
    expect(activityDurationMs({ startedAt: '2026-09-25T10:00:00Z', endedAt: '2026-09-25T11:00:00Z', pausedMs: 600_000 })).toBe(3_000_000);
  });
  test('uses active time for pace and a weight-based exercise estimate', () => {
    expect(activeRouteDurationMs({ startedAt: '2026-09-25T10:00:00Z', pausedAt: '2026-09-25T10:30:00Z', pausedMs: 300_000 }, Date.parse('2026-09-25T11:00:00Z'))).toBe(1_500_000);
    expect(averagePaceMinPerMile(1609.344, 1_200_000)).toBeCloseTo(20);
    expect(averagePaceMinPerMile(10, 1_200_000)).toBeNull();
    expect(estimatedRouteCalories(1609.344, 1_200_000, 90)).toBe(75);
    expect(estimatedRouteCalories(1609.344, 1_200_000, 90, 'hike')).toBe(150);
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
  });
  test('keeps existing Activity hidden and includes routes in backups', () => {
    const existing = migratePreferences({ trackers: [], checkIns: [] });
    expect(existing.preferences?.visibleSections.activity).toBe(false);
    const fresh = completeOnboarding({ ...createFreshState(), onboardingSelections: ['activity'] });
    expect(fresh.preferences?.visibleSections.activity).toBe(true);
    expect(fresh.preferences?.dashboard?.filter((widget) => widget.visible).map((widget) => widget.id)).toEqual(['activity']);
    const route = { id: 'route-1', kind: 'hike' as const, startedAt: '2026-09-25T10:00:00Z', endedAt: '2026-09-25T11:00:00Z', pausedMs: 0, distanceMeters: 11, points: [origin, near] };
    expect(parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...fresh, activityRoutes: [route] }))).state.activityRoutes).toEqual([route]);
  });
});
