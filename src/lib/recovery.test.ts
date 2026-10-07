import {
  currentStreakStartedAt,
  deleteTrackerHistory,
  recoverySeries,
  recoveryStats,
} from './recovery';
import { TrackerState } from '@/models/tracker';

describe('cumulative recovery', () => {
  const start = '2026-07-20T00:00:00';
  const through = new Date('2026-07-24T12:00:00');

  test('rises by one on every successful calendar day', () => {
    expect(recoverySeries(start, [], through).map((point) => point.cumulative))
      .toEqual([1, 2, 3, 4, 5]);
  });

  test('stays flat on a lapse day', () => {
    const points = recoverySeries(start, [{ date: '2026-07-23' }], through);
    expect(points.map((point) => point.cumulative)).toEqual([1, 2, 3, 3, 4]);
    expect(points[3].successful).toBe(false);
  });

  test('a lapse never erases previously successful days', () => {
    const points = recoverySeries(start, [{ date: '2026-07-23' }], through);
    expect(points[3].cumulative).toBe(points[2].cumulative);
    expect(points[4].cumulative).toBeGreaterThan(points[3].cumulative);
  });

  test('current streak restarts on the calendar day after the latest lapse', () => {
    expect(currentStreakStartedAt(
      start,
      [{ date: '2026-07-22' }],
      new Date('2026-07-24T12:00:00'),
    )).toBe(new Date('2026-07-23T00:00:00').toISOString());
  });

  test('calculates success percentage from successful and tracked days', () => {
    const stats = recoveryStats(recoverySeries(start, [{ date: '2026-07-23' }], through));
    expect(stats).toEqual({
      successfulDays: 4,
      totalTrackedDays: 5,
      successPercentage: 80,
    });
  });

  test('deleting or correcting a lapse recalculates cumulative values', () => {
    const withLapse = recoverySeries(start, [{ date: '2026-07-23' }], through);
    const corrected = recoverySeries(start, [], through);
    expect(withLapse.at(-1)?.cumulative).toBe(4);
    expect(corrected.at(-1)?.cumulative).toBe(5);
  });

  test('history deletion is blocked unless confirmation is explicit', () => {
    const state: TrackerState = {
      trackers: [{
        id: 'marijuana',
        name: 'Marijuana',
        icon: 'M',
        color: '#fff',
        mode: 'abstinence',
        startedAt: start,
      }],
      checkIns: ['2026-07-24'],
      lapseEvents: [{
        id: 'lapse-1',
        trackerId: 'marijuana',
        date: '2026-07-23',
        createdAt: '2026-07-23T12:00:00',
      }],
    };

    expect(deleteTrackerHistory(state, 'marijuana', false)).toBe(state);
    const deleted = deleteTrackerHistory(state, 'marijuana', true);
    expect(deleted.trackers[0].startedAt).toBeUndefined();
    expect(deleted.lapseEvents).toEqual([]);
    // Legacy app-engagement check-ins are global and must not be erased with one tracker.
    expect(deleted.checkIns).toEqual(['2026-07-24']);
  });
});
