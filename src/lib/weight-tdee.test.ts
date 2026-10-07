import { ActivityRoute, NutritionEntry, WeightTdeeProfile } from '@/models/tracker';
import { createFreshState } from './onboarding';
import { createReclaimBackup, parseReclaimBackup } from './backup';
import { estimateDailyTdee, feetInchesFromCm, heightCmFromFeetInches, previousDayCalories, previousLocalDate, validTdeeProfile } from './weight-tdee';

const profile: WeightTdeeProfile = { heightCm: 180, birthDate: '1990-06-15', formulaSex: 'male' };
const food: NutritionEntry = {
  id: 'food', eventDate: '2026-10-03', recordedAt: '', updatedAt: '', mealGroupId: 'meal', mealLabel: 'Dinner',
  name: 'Meal', servingLabel: '1 meal', servings: 1,
  nutrients: { carbsGrams: 0, proteinGrams: 0, fatGrams: 0, fiberGrams: 0 }, statedCalories: 2100, source: 'manual',
};
const route: ActivityRoute = {
  id: 'route', kind: 'walk', startedAt: '2026-10-03T14:00:00', endedAt: '2026-10-03T15:00:00',
  pausedMs: 0, distanceMeters: 3000, points: [], estimatedCalories: 300,
};

test('accepts feet and inches while preserving centimeter-backed profiles', () => {
  expect(heightCmFromFeetInches(5, 11)).toBe(180.3);
  expect(heightCmFromFeetInches(6, 12)).toBeNull();
  expect(heightCmFromFeetInches(5.5, 0)).toBeNull();
  const shown = feetInchesFromCm(180);
  expect(shown).toEqual({ feet: 5, inches: 10.9 });
  expect(heightCmFromFeetInches(shown.feet, shown.inches)).toBeCloseTo(180, 0);
});

test('uses the preceding local calendar day and leaves unlogged food blank', () => {
  expect(previousLocalDate('2026-03-09')).toBe('2026-03-08');
  expect(previousLocalDate('2026-01-01')).toBe('2025-12-31');
  expect(previousDayCalories([food], '2026-10-04')).toBe(2100);
  expect(previousDayCalories([food], '2026-10-05')).toBeNull();
  expect(previousDayCalories([food], 'bad date')).toBeNull();
});

test('estimates BMR and daily expenditure with net route and non-route step calories', () => {
  const input = { profile, weighInDate: '2026-10-04', weight: 100, unit: 'kg' as const,
    steps: [{ date: '2026-10-03', count: 10000, incomplete: false }], routes: [route] };
  const result = estimateDailyTdee(input)!;
  expect(result.activityDate).toBe('2026-10-03');
  expect(result.bmr).toBe(1950);
  expect(result.routeCalories).toBe(300);
  expect(result.remainingSteps).toBeGreaterThan(0);
  expect(result.remainingSteps).toBeLessThan(10000);
  expect(result.stepCalories).toBeGreaterThan(0);
  expect(result.total).toBe(result.bmr + result.ordinaryActivity + result.stepCalories + result.routeCalories + result.foodDigestion);
  expect(result.stepStatus).toBe('recorded');
  expect(estimateDailyTdee({ ...input, weight: 100 / 0.45359237, unit: 'lb' })?.total).toBe(result.total);
});

test('route movement is not counted again as steps; missing and partial days stay explicit', () => {
  const input = { profile, weighInDate: '2026-10-04', weight: 100, unit: 'kg' as const, routes: [route] };
  expect(estimateDailyTdee({ ...input, steps: [{ date: '2026-10-03', count: 1000, incomplete: false }] })).toMatchObject({ stepCalories: 0, routeCalories: 300, remainingSteps: 0 });
  expect(estimateDailyTdee({ ...input, steps: [] })).toMatchObject({ stepStatus: 'missing', stepCalories: 0, routeCalories: 300 });
  expect(estimateDailyTdee({ ...input, steps: [{ date: '2026-10-03', count: 5000, incomplete: true }] })?.stepStatus).toBe('partial');
});

test('profile validation and backup preserve the optional estimate setup', () => {
  expect(validTdeeProfile(profile)).toBe(true);
  expect(validTdeeProfile({ ...profile, birthDate: '2026-02-30' })).toBe(false);
  expect(estimateDailyTdee({ profile: { ...profile, heightCm: 0 }, weighInDate: '2026-10-04', weight: 100, unit: 'kg', steps: [], routes: [] })).toBeNull();
  const state = { ...createFreshState(), weightTdeeProfile: profile };
  expect(parseReclaimBackup(JSON.stringify(createReclaimBackup(state))).state.weightTdeeProfile).toEqual(profile);
  expect(() => parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...state, weightTdeeProfile: { ...profile, heightCm: 0 } })))).toThrow(/Weight estimate profile/);
});
