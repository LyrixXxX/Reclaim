import { ActivityRoute, GoodHabitLog, Tracker } from '@/models/tracker';
import { activeWalkMinutes, checklistOn, goalOn, habitDate, habitProgress, habitStreak, periodStart, routeMinutesOn } from './good-habit-templates';

const tracker: Tracker = { id: 'walk', name: 'Walk more', icon: '🚶', color: '#00ff00', mode: 'habit', habitTemplate: 'walk', startedAt: '2026-10-10T08:00:00', habitGoalHistory: [{ effectiveDate: '2026-10-10', value: 30 }] };
const route: ActivityRoute = { id: 'route', kind: 'walk', startedAt: '2026-10-12T08:00:00', endedAt: '2026-10-12T08:35:00', pausedMs: 300000, distanceMeters: 2000, points: [] };
const log: GoodHabitLog = { id: 'manual', trackerId: 'walk', eventDate: '2026-10-12', amount: 10, recordedAt: '2026-10-12T12:00:00Z' };

test('saved Walk active time and manual time add without altering routes', () => {
  expect(activeWalkMinutes(route)).toBe(30);
  expect(routeMinutesOn([route, { ...route, id: 'old', startedAt: '2026-10-09T08:00:00', endedAt: '2026-10-09T08:35:00' }], tracker, '2026-10-12')).toBe(30);
  expect(habitProgress(tracker, [log], [route], new Date(2026, 9, 12, 12))).toMatchObject({ amount: 40, goal: 30, percent: 100 });
  expect(habitProgress(tracker, [log], [{ ...route, endedAt: '2026-10-12T08:25:00' }], new Date(2026, 9, 12, 12)).amount).toBe(30);
});

test('sleep dates cross midnight until six and weekly goals start Monday', () => {
  expect(habitDate('sleep', new Date(2026, 9, 12, 5, 59))).toBe('2026-10-11');
  expect(habitDate('sleep', new Date(2026, 9, 12, 6, 0))).toBe('2026-10-12');
  expect(periodStart('2026-10-11', 'week')).toBe('2026-10-05');
});

test('dated goals and checklists preserve older dates', () => {
  const changed: Tracker = { ...tracker, habitGoalHistory: [{ effectiveDate: '2026-10-10', value: 30 }, { effectiveDate: '2026-10-12', value: 45 }], habitChecklistHistory: [{ effectiveDate: '2026-10-10', items: [{ id: 'a', label: 'Old' }] }, { effectiveDate: '2026-10-12', items: [{ id: 'b', label: 'New' }] }] };
  expect(goalOn(changed, '2026-10-11')).toBe(30);
  expect(goalOn(changed, '2026-10-12')).toBe(45);
  expect(checklistOn(changed, '2026-10-11')[0].label).toBe('Old');
});

test('weekly exercise counts sessions without breaking an unfinished current week', () => {
  const exercise: Tracker = { ...tracker, id: 'exercise', habitTemplate: 'exercise', startedAt: '2026-09-28T09:00:00', habitGoalHistory: [{ effectiveDate: '2026-09-28', value: 2 }] };
  const sessions: GoodHabitLog[] = [
    { ...log, id: 'first', trackerId: 'exercise', eventDate: '2026-10-05', amount: 1 },
    { ...log, id: 'second', trackerId: 'exercise', eventDate: '2026-10-11', amount: 1 },
  ];
  expect(habitProgress(exercise, sessions, [], new Date(2026, 9, 12, 12)).amount).toBe(0);
  expect(habitStreak(exercise, sessions, [], new Date(2026, 9, 12, 12))).toBe(1);
});
