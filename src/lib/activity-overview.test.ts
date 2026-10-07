import { activityToday, activityWeek } from './activity-overview';

test('Monday–Sunday week leaves future and missing days empty and averages recorded days only', () => {
  const week = activityWeek([
    { date: '2026-09-28', count: 1000, incomplete: false },
    { date: '2026-09-30', count: 3000, incomplete: true },
  ], [{ effectiveDate: '2026-09-28', count: 2000 }], new Date(2026, 9, 1, 12));
  expect(week.slots.map((slot) => slot.count)).toEqual([1000, undefined, 3000, undefined, undefined, undefined, undefined]);
  expect(week.average).toBe(2000);
  expect([week.goalsReached, week.goalDays]).toEqual([1, 2]);
});

test('today totals saved routes without assuming missing calories are zero', () => {
  const route = { id: 'r1', kind: 'walk' as const, startedAt: '2026-10-01T12:00:00', endedAt: '2026-10-01T12:30:00', pausedMs: 0, distanceMeters: 1609.344, points: [] };
  expect(activityToday([route], new Date(2026, 9, 1, 12)).estimatedCalories).toBeNull();
  expect(activityToday([{ ...route, estimatedCalories: 70 }], new Date(2026, 9, 1, 12))).toMatchObject({ distanceMeters: 1609.344, activeMs: 1800000, estimatedCalories: 70 });
});

test('Sunday and year rollover use the correct calendar week', () => {
  const sunday = activityWeek([{ date: '2027-01-03', count: 700, incomplete: false }], [], new Date(2027, 0, 3, 12));
  expect(sunday.slots[0].date).toBe('2026-12-28');
  expect(sunday.slots[6]).toMatchObject({ date: '2027-01-03', count: 700 });
  expect(activityWeek([], [], new Date(2027, 0, 4, 12)).average).toBeNull();
});
