import { Tracker } from '@/models/tracker';
import { habitMilestones, templateMilestoneProgress } from './habit-milestones';
import { badgeUnlocks, badgesEarnedToday, closestBadge, earnedBadges, nextBadge, trackerBadges } from './trophy-case';

const water: Tracker = { id: 'water', name: 'Drink water', icon: 'water', color: '#fff', mode: 'habit', habitTemplate: 'water', startedAt: '2026-01-01T08:00:00', waterGoals: [{ effectiveDate: '2026-01-01', ounces: 64 }] };
const waterLog = (date: string, ounces = 64) => ({ id: date, trackerId: 'water', eventDate: date, ounces, recordedAt: `${date}T12:00:00Z` });
const day = (n: number) => `2026-01-${String(n).padStart(2, '0')}`;
const walk: Tracker = { id: 'walk', name: 'Walk more', icon: 'walk', color: '#fff', mode: 'habit', habitTemplate: 'walk', startedAt: '2026-01-01T08:00:00', habitGoalHistory: [{ effectiveDate: '2026-01-01', value: 30 }] };
const exercise: Tracker = { id: 'exercise', name: 'Exercise', icon: 'exercise', color: '#fff', mode: 'habit', habitTemplate: 'exercise', startedAt: '2026-01-05T08:00:00', habitGoalHistory: [{ effectiveDate: '2026-01-01', value: 2 }] };
const quit: Tracker = { id: 'quit', name: 'Nicotine', icon: '', color: '#fff', mode: 'abstinence', startedAt: '2026-01-01T12:00:00' };
const empty = { goodHabitLogs: [], waterLogs: [], routes: [] };

describe('badges for built-in habits', () => {
  test('water earns a badge only on days that reached the goal', () => {
    const logs = [1, 2, 3, 4, 5, 6, 7].map((n) => waterLog(day(n)));
    const { awards, runDays } = templateMilestoneProgress(water, { ...empty, waterLogs: logs }, new Date(2026, 0, 7, 20));
    expect(awards.find((a) => a.days === 1)?.dates).toEqual([day(1)]);
    expect(awards.find((a) => a.days === 7)?.dates).toEqual([day(7)]);
    expect(runDays).toBe(7);
  });

  test('a missed day restarts the run but keeps what was earned', () => {
    const logs = [1, 2, 3, 4, 5, 6, 7, 9].map((n) => waterLog(day(n)));
    const { awards, runDays } = templateMilestoneProgress(water, { ...empty, waterLogs: logs }, new Date(2026, 0, 10, 20));
    expect(awards.find((a) => a.days === 7)?.dates).toEqual([day(7)]);
    expect(awards.find((a) => a.days === 1)?.dates).toEqual([day(1), day(9)]);
    expect(runDays).toBe(1);
  });

  test('today not being finished yet does not break the run', () => {
    const logs = [1, 2, 3].map((n) => waterLog(day(n)));
    expect(templateMilestoneProgress(water, { ...empty, waterLogs: logs }, new Date(2026, 0, 4, 9)).runDays).toBe(3);
    expect(templateMilestoneProgress(water, { ...empty, waterLogs: logs }, new Date(2026, 0, 5, 9)).runDays).toBe(0);
  });

  test('walking counts routes and phone minutes toward the goal', () => {
    const route = { id: 'r', kind: 'walk' as const, startedAt: '2026-01-01T09:00:00', endedAt: '2026-01-01T09:20:00', pausedMs: 0, distanceMeters: 1, points: [] };
    const now = new Date(2026, 0, 1, 20);
    expect(templateMilestoneProgress(walk, { ...empty, routes: [route] }, now).runDays).toBe(0);
    expect(templateMilestoneProgress(walk, { ...empty, routes: [route], phoneMinutesByDate: { '2026-01-01': 10 } }, now).runDays).toBe(1);
  });

  test('weekly habits earn when a finished week met its goal', () => {
    const log = (date: string) => ({ id: date, trackerId: 'exercise', eventDate: date, amount: 1, recordedAt: `${date}T12:00:00Z` });
    const logs = [log('2026-01-06'), log('2026-01-08')];
    expect(templateMilestoneProgress(exercise, { ...empty, goodHabitLogs: logs }, new Date(2026, 0, 9, 12)).awards.find((a) => a.days === 7)?.dates).toEqual([]);
    const done = templateMilestoneProgress(exercise, { ...empty, goodHabitLogs: logs }, new Date(2026, 0, 12, 12));
    expect(done.awards.find((a) => a.days === 7)?.dates).toEqual(['2026-01-11']);
    expect(done.runDays).toBe(7);
  });
});

describe('next badge', () => {
  const state = (logs: number[]) => ({ trackers: [water], waterLogs: logs.map((n) => waterLog(day(n))) });

  test('says how far away the next badge is', () => {
    const next = nextBadge(trackerBadges(state([1, 2, 3, 4, 5]), new Date(2026, 0, 6, 9))[0]);
    expect(next).toMatchObject({ label: '1 Week', remainingDays: 2, line: '2 days to 1 Week' });
  });

  test('invites a start when no run is going', () => {
    expect(nextBadge(trackerBadges(state([]), new Date(2026, 0, 6, 9))[0])?.line).toBe('Hit today’s goal to start toward 1 Day');
  });

  test('weekly habits count in weeks and skip the one-day badge', () => {
    const next = nextBadge(trackerBadges({ trackers: [exercise] }, new Date(2026, 0, 6, 9))[0]);
    expect(next?.label).toBe('1 Week');
    expect(next?.line).toBe('Hit this week’s goal to start toward 1 Week');
  });

  test('prefers the badge you are furthest along toward', () => {
    const list = trackerBadges({ trackers: [{ ...water, id: 'other', name: 'Other' }, water], waterLogs: [1, 2, 3, 4, 5].map((n) => waterLog(day(n))) }, new Date(2026, 0, 6, 9));
    expect(closestBadge(list)?.tracker.id).toBe('water');
  });

  test('archived and goal-less habits are not chased, but keep what they earned', () => {
    const archived = trackerBadges({ trackers: [{ ...water, archived: true }], waterLogs: [waterLog(day(1))] }, new Date(2026, 0, 2, 9));
    expect(nextBadge(archived[0])).toBeNull();
    expect(earnedBadges(archived).map((badge) => badge.days)).toEqual([1]);
    expect(nextBadge(trackerBadges({ trackers: [{ ...walk, habitGoalHistory: [] }] }, new Date(2026, 0, 2, 9))[0])).toBeNull();
  });

  test('past a year it counts to the next full year', () => {
    expect(nextBadge(trackerBadges({ trackers: [quit] }, new Date(2027, 0, 11, 12))[0])).toMatchObject({ label: '2 Years', days: 730 });
  });

  test('a quit tracker without a start date has nothing to chase', () => {
    expect(nextBadge(trackerBadges({ trackers: [{ ...quit, startedAt: undefined }] }, new Date(2026, 0, 2, 9))[0])).toBeNull();
  });

  test('quit trackers keep their earned badges after a lapse and start the next count over', () => {
    const lapse = { id: 'lapse', trackerId: 'quit', eventDate: day(10), outcome: 'lapse' as const, recordedAt: `${day(10)}T12:00:00Z` };
    const list = trackerBadges({ trackers: [quit], historicalEntries: [lapse] }, new Date(2026, 0, 13, 12));
    expect(earnedBadges(list).map((badge) => badge.days)).toEqual([7, 1]);
    expect(nextBadge(list[0])).toMatchObject({ label: '1 Week', line: '5 days to 1 Week' });
  });
});

describe('unlocks', () => {
  const week = { trackers: [water], waterLogs: [1, 2, 3, 4, 5, 6, 7].map((n) => waterLog(day(n))) };
  const now = new Date(2026, 0, 7, 20);

  test('the very first run records what is earned without celebrating', () => {
    const { show, markSeen } = badgeUnlocks(trackerBadges(week, now), undefined, now);
    expect(show).toEqual([]);
    expect(markSeen.sort()).toEqual(['water:1', 'water:7']);
  });

  test('a new badge is celebrated once, biggest first per habit', () => {
    const list = trackerBadges(week, now);
    const { show, markSeen } = badgeUnlocks(list, ['water:1'], now);
    expect(show.map((badge) => badge.days)).toEqual([7]);
    expect(markSeen).toEqual([]);
    expect(badgeUnlocks(list, ['water:1', 'water:7'], now).show).toEqual([]);
  });

  test('old badges from backfilled logs are marked quietly', () => {
    const later = new Date(2026, 0, 20, 12);
    const { show, markSeen } = badgeUnlocks(trackerBadges(week, later), [], later);
    expect(show).toEqual([]);
    expect(markSeen.sort()).toEqual(['water:1', 'water:7']);
  });

  test('the bell gets a good habit’s first-time badge only on the day it was earned', () => {
    expect(badgesEarnedToday(trackerBadges(week, now), now).map((badge) => badge.days)).toEqual([7]);
    const next = new Date(2026, 0, 8, 9);
    expect(badgesEarnedToday(trackerBadges(week, next), next)).toEqual([]);
  });

  test('existing awards for custom habits are unchanged', () => {
    const custom: Tracker = { ...quit, mode: 'habit', frequencyCount: 1, frequencyPeriod: 'day' };
    expect(habitMilestones(custom, [], undefined, new Date(2026, 0, 3, 12)).every((award) => award.dates.length === 0)).toBe(true);
  });
});
