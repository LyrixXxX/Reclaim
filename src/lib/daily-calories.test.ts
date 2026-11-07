import type { ActivityRoute, WorkoutSession } from '@/models/tracker';

import { estimatedRouteCalories } from './activity';
import { dailyCalories, migrateRouteCalories } from './daily-calories';
import { stepCalories, stepsOutsideRoutes } from './step-calories';
import { TYPICAL_STRIDE_METERS } from './stride';

const DATE = '2026-11-06';
const MILE = 1609.344;
const route = (extra: Partial<ActivityRoute> = {}): ActivityRoute => ({ id: 'hike', kind: 'hike', startedAt: '2026-11-06T10:00:00', endedAt: '2026-11-06T12:00:00', pausedMs: 0, distanceMeters: 3 * MILE, points: [], ...extra });
const weightEntries = [{ id: 'w', date: DATE, recordedAt: `${DATE}T08:00:00`, weight: 90, unit: 'kg' as const }];
const climbing = Array.from({ length: 12 }, (_, index) => ({ latitude: 36 + index * 0.001, longitude: -85, timestamp: index * 60_000, altitudeMeters: 300 + index * 10, altitudeAccuracyMeters: 3 }));

test('slowing down does not add calories, and climbing does', () => {
  const fast = estimatedRouteCalories(3 * MILE, 3_600_000, 90, 'hike');
  expect(estimatedRouteCalories(3 * MILE, 7_200_000, 90, 'hike')).toBe(fast);
  expect(fast).toBe(225);
  expect(estimatedRouteCalories(3 * MILE, 3_600_000, 90, 'hike', 300)).toBe(468);
});

test('steps taken on a route are not counted again as walking', () => {
  const day = dailyCalories({ activityRoutes: [route({ estimatedCalories: 400, routeSteps: 6000, routeStepStatus: 'available' })], weightEntries }, DATE, 10_000);
  expect(day.walking.steps).toBe(4000);
  expect(day.walking.kcal).toBe(stepCalories(4000, weightEntries, DATE, TYPICAL_STRIDE_METERS)!.kcal);
  expect(day.activity).toBe(400 + day.walking.kcal!);
});

test('a route without a reliable step count falls back to its distance', () => {
  expect(stepsOutsideRoutes(10_000, [route({ routeStepStatus: 'unavailable' })], DATE, MILE / 2000)).toBe(4000);
  expect(stepsOutsideRoutes(1000, [route({ routeSteps: 6000, routeStepStatus: 'available' })], DATE, MILE / 2000)).toBe(0);
});

test('a route on another day does not reduce today', () => {
  expect(stepsOutsideRoutes(10_000, [route({ startedAt: '2026-11-05T10:00:00', routeSteps: 6000, routeStepStatus: 'available' })], DATE, MILE / 2000)).toBe(10_000);
});

test('steps on the route being recorded count toward that route', () => {
  const recording = { startedAt: '2026-11-06T14:00:00', routeSteps: 500, points: [], kind: 'walk' as const, pausedMs: 0 };
  expect(dailyCalories({ weightEntries }, DATE, 2000, recording).walking.steps).toBe(1500);
});

test('workout time overlapping a route counts once', () => {
  const workoutSessions = [{ id: 's', name: 'Lift', startedAt: '2026-11-06T10:00:00', endedAt: '2026-11-06T12:00:00', pausedMs: 0, exercises: [], calories: { source: 'estimated', type: 'gross', kcal: 300, activeKcal: 200 } }] as unknown as WorkoutSession[];
  const day = dailyCalories({ activityRoutes: [route({ estimatedCalories: 400 })], workoutSessions, weightEntries }, DATE, undefined);
  expect(day.activity).toBe(200);
  expect(day.routeTotal + day.workouts).toBe(200);
});

test('resting calories count only the part of today so far, and past days count in full', () => {
  const profile = { heightCm: 180, birthYear: 1990, formulaSex: 'male' as const };
  const noon = Date.parse(`${DATE}T12:00:00`);
  const today = dailyCalories({ weightEntries, weightTdeeProfile: profile }, DATE, undefined, null, noon);
  const past = dailyCalories({ weightEntries, weightTdeeProfile: profile }, DATE, undefined, null, noon + 2 * 86_400_000);
  expect(past.resting).toBe(1850);
  expect(today.resting).toBe(925);
});

test('resting calories wait for a profile, and digestion follows what was eaten', () => {
  const nutritionEntries = [{ id: 'e', eventDate: DATE, name: 'Lunch', servings: 1, statedCalories: 800, nutrients: { proteinGrams: 0, carbsGrams: 0, fatGrams: 0 } }] as never;
  const day = dailyCalories({ weightEntries, nutritionEntries }, DATE, undefined);
  expect(day.resting).toBeNull();
  expect(day.digestion).toBe(Math.round(day.eaten * 0.1));
  expect(day.burned).toBe(day.digestion);
});

test('saved hikes are recalculated once from distance and climb, and runs are left alone', () => {
  const [hike, run, noWeight] = migrateRouteCalories([
    route({ estimatedCalories: 806, estimateWeightKg: 90, movingMs: 6_000_000, points: climbing }),
    route({ id: 'run', kind: 'run', estimatedCalories: 500, estimateWeightKg: 90 }),
    route({ id: 'old', estimatedCalories: 300 }),
  ]);
  expect(hike.estimatedCalories).toBeLessThan(806);
  expect(hike.calorieModel).toBe(2);
  expect(run.estimatedCalories).toBe(500);
  expect(noWeight.estimatedCalories).toBe(300);
  expect(migrateRouteCalories([hike])[0]).toBe(hike);
});

test('a saved route with no recorded weight uses the weigh-in from that time', () => {
  const [updated] = migrateRouteCalories([route({ estimatedCalories: 806 })], weightEntries);
  expect(updated.estimatedCalories).toBe(225);
});
