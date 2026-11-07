import { ActivityRoute, GoodHabitLog, Tracker } from '@/models/tracker';
import { activeWalkMinutes, checklistOn, exerciseModeOn, exerciseRegimenOn, goalOn, habitDate, habitProgress, habitStreak, periodStart, routeMinutesOn, shortGoalName, isRetiredHabit, retireHabits } from './good-habit-templates';

const tracker: Tracker = { id: 'walk', name: 'Walk more', icon: '🚶', color: '#00ff00', mode: 'habit', habitTemplate: 'walk', startedAt: '2026-10-10T08:00:00', habitGoalHistory: [{ effectiveDate: '2026-10-10', value: 30 }] };
const route: ActivityRoute = { id: 'route', kind: 'walk', startedAt: '2026-10-12T08:00:00', endedAt: '2026-10-12T08:35:00', pausedMs: 300000, distanceMeters: 2000, points: [] };
const log: GoodHabitLog = { id: 'manual', trackerId: 'walk', eventDate: '2026-10-12', amount: 10, recordedAt: '2026-10-12T12:00:00Z' };

test('saved Walk active time and manual time add without altering routes', () => {
  expect(activeWalkMinutes(route)).toBe(30);
  expect(routeMinutesOn([route, { ...route, id: 'old', startedAt: '2026-10-09T08:00:00', endedAt: '2026-10-09T08:35:00' }], tracker, '2026-10-12')).toBe(30);
  expect(habitProgress(tracker, [log], [route], new Date(2026, 9, 12, 12))).toMatchObject({ amount: 40, goal: 30, percent: 100 });
  expect(habitProgress(tracker, [log], [{ ...route, endedAt: '2026-10-12T08:25:00' }], new Date(2026, 9, 12, 12)).amount).toBe(30);
});

test('Walk more uses moving time from walks, hikes, and runs plus phone minutes once', () => {
  const routes: ActivityRoute[] = [route, { ...route, id: 'hike', kind: 'hike', movingMs: 600000 }, { ...route, id: 'run', kind: 'run', movingMs: 300000 }];
  expect(routeMinutesOn(routes, tracker, '2026-10-12')).toBe(45);
  expect(habitProgress(tracker, [log], routes, new Date(2026, 9, 12, 12), 5).amount).toBe(60);
  expect(habitProgress(tracker, [log], routes, new Date(2026, 9, 12, 12), 5).percent).toBe(100);
});

test('phone walking minutes contribute to consecutive Walk more days', () => {
  const yesterday = new Date(2026, 9, 11, 12);
  const today = new Date(2026, 9, 12, 12);
  expect(habitStreak(tracker, [], [], today, { '2026-10-11': 30, '2026-10-12': 30 })).toBe(2);
  expect(habitStreak(tracker, [], [], yesterday, { '2026-10-11': 30 })).toBe(1);
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

test('exercise minutes ignore old sessions without duration and preserve dated mode and regimen', () => {
  const exercise: Tracker = { ...tracker, id: 'exercise', habitTemplate: 'exercise', habitGoalHistory: [{ effectiveDate: '2026-10-10', value: 60 }], exerciseGoalModes: [{ effectiveDate: '2026-10-12', mode: 'minutes' }], exerciseRegimenHistory: [{ effectiveDate: '2026-10-10', rows: [{ id: 'push', label: 'Push', days: [0, 2] }] }] };
  const sessions: GoodHabitLog[] = [{ ...log, trackerId: 'exercise', amount: 1 }, { ...log, id: 'old', trackerId: 'exercise', amount: 1, eventDate: '2026-10-11' }, { ...log, id: 'new', trackerId: 'exercise', amount: 1, durationMinutes: 35 }];
  expect(exerciseModeOn(exercise, '2026-10-11')).toBe('times');
  expect(exerciseModeOn(exercise, '2026-10-12')).toBe('minutes');
  expect(exerciseRegimenOn(exercise, '2026-10-12')[0].label).toBe('Push');
  expect(habitProgress(exercise, sessions, [], new Date(2026, 9, 12, 12)).amount).toBe(35);
});

test('retired habits are archived with their reminders off', () => {
  const exercise = { id: 'e', name: 'Exercise', mode: 'habit', habitTemplate: 'exercise', habitReminderTime: '09:00', habitNotificationId: 'n' } as never;
  const water = { id: 'w', name: 'Water', mode: 'habit', habitTemplate: 'water' } as never;
  const [retired, kept] = retireHabits([exercise, water]);
  expect(retired).toMatchObject({ id: 'e', archived: true, habitReminderTime: undefined, habitNotificationId: undefined });
  expect(kept).toBe(water);
  expect(isRetiredHabit('exercise')).toBe(true);
  expect(isRetiredHabit('water')).toBe(false);
});

test('built-in habits get a short name, and renamed ones keep theirs', () => {
  expect(shortGoalName('Build a sleep routine')).toBe('Sleep');
  expect(shortGoalName('Bedtime by 10')).toBe('Bedtime by 10');
});
