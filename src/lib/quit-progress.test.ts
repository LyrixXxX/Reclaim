import { CravingEvent, Tracker } from '@/models/tracker';
import { activeSavingsGoal, cravingsBeaten, featuredQuit, quitSummary, quittingStarts, totalQuitDays, taperingStarts } from './quit-progress';

const tracker = (id: string, startedAt?: string, extra: Partial<Tracker> = {}): Tracker => ({ id, name: id, icon: '•', color: '#fff', mode: 'abstinence', startedAt, ...extra } as Tracker);
const DAY = 86_400_000;
const NOW = Date.parse('2026-11-03T12:00:00');

describe('quit progress', () => {
  test('lists running quits and features the chosen one, else the first', () => {
    const starts = quittingStarts([tracker('a'), tracker('b', '2026-10-01T00:00:00'), tracker('c', '2026-09-01T00:00:00'), tracker('d', '2026-01-01T00:00:00', { archived: true }), tracker('e', '2026-01-01T00:00:00', { mode: 'habit' })], []);
    expect(starts.map((item) => item.tracker.id)).toEqual(['a', 'b', 'c']);
    expect(featuredQuit(starts)?.tracker.id).toBe('b');
    expect(featuredQuit(starts, 'c')?.tracker.id).toBe('c');
    expect(featuredQuit(starts, 'a')?.tracker.id).toBe('b');
    expect(totalQuitDays(starts, NOW)).toBe(Math.floor((NOW - Date.parse('2026-10-01T00:00:00') + NOW - Date.parse('2026-09-01T00:00:00')) / DAY));
  });

  test('summarizes days and the next checkpoint', () => {
    const summary = quitSummary(tracker('a'), new Date(NOW - 10.5 * DAY).toISOString(), 'exact', NOW);
    expect(summary).toMatchObject({ days: 10, hours: 12, nextDays: 14, daysToNext: 4, exact: true });
    expect(summary.checkpointProgress).toBeCloseTo(3.5 / 7);
  });

  test('goes past the last checkpoint in whole years', () => {
    const summary = quitSummary(tracker('a'), new Date(NOW - 385 * DAY).toISOString(), 'exact', NOW);
    expect(summary.nextDays).toBe(730);
    expect(summary.daysToNext).toBe(345);
  });

  test('counts beaten cravings per tracker', () => {
    const cravings: CravingEvent[] = [
      { id: '1', trackerId: 'a', at: '2026-11-01T10:00:00', outcome: 'beaten' },
      { id: '2', trackerId: 'a', at: '2026-11-02T10:00:00', outcome: 'slipped' },
      { id: '3', trackerId: 'b', at: '2026-11-02T10:00:00', outcome: 'beaten' },
    ];
    expect(cravingsBeaten(cravings)).toBe(2);
    expect(cravingsBeaten(cravings, 'a')).toBe(1);
    expect(cravingsBeaten(undefined)).toBe(0);
  });

  test('tracks the oldest open savings goal', () => {
    const goals = [
      { id: 'g2', name: 'Tent', targetCents: 50_000, createdAt: '2026-10-02' },
      { id: 'g1', name: 'Boots', targetCents: 20_000, createdAt: '2026-10-01' },
      { id: 'g0', name: 'Done', targetCents: 100, createdAt: '2026-09-01', achievedAt: '2026-09-02' },
    ];
    expect(activeSavingsGoal(goals, 15_000)).toMatchObject({ goal: { id: 'g1' }, progress: 0.75, remainingCents: 5_000 });
    expect(activeSavingsGoal(goals, 30_000)?.progress).toBe(1);
    expect(activeSavingsGoal([], 100)).toBeUndefined();
  });
});

test('tapering items carry their level and when it began, and quits and habits stay out', () => {
  const taper = { id: 't', name: 'Coffee', mode: 'reduction', current: 2, unit: 'cups', baseline: 4, currentStepStartedAt: '2026-11-01T08:00:00' } as never;
  const quit = { id: 'q', name: 'Nicotine', mode: 'abstinence', startedAt: '2026-10-01T08:00:00' } as never;
  const habit = { id: 'h', name: 'Water', mode: 'habit' } as never;
  expect(taperingStarts([taper, quit, habit], [])).toEqual([{ tracker: taper, startedAt: '2026-11-01T08:00:00', amount: 2, unit: 'cups' }]);
});
