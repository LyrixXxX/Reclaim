import {
  dailyCheckInStreak,
  removeHistoricalEntry,
  upsertHistoricalEntry,
} from './history';
import {
  currentStreakFromEntries,
  recoverySeriesFromEntries,
  recoveryStats,
} from './recovery';
import { HistoricalEntry, TrackerState } from '@/models/tracker';

const tracker = {
  id: 'marijuana' as const,
  name: 'Marijuana',
  icon: 'M',
  color: '#fff',
  mode: 'abstinence' as const,
  startedAt: '2026-07-20T00:00:00',
};

function baseState(): TrackerState {
  return { trackers: [tracker], checkIns: ['2026-07-26'], historicalEntries: [] };
}

describe('historical check-in editing', () => {
  test('historical days can be backfilled with event and recording timestamps', () => {
    const state = upsertHistoricalEntry(baseState(), {
      trackerId: 'marijuana',
      eventDate: '2026-07-22',
      outcome: 'stayed_on_plan',
    }, '2026-07-26T14:30:00.000Z');

    expect(state.historicalEntries).toHaveLength(1);
    expect(state.historicalEntries?.[0]).toMatchObject({
      eventDate: '2026-07-22',
      recordedAt: '2026-07-26T14:30:00.000Z',
      outcome: 'stayed_on_plan',
    });
    expect(state.historicalEntries?.[0].eventDate).not.toBe(
      state.historicalEntries?.[0].recordedAt,
    );
  });

  test('backfilled success updates recovery totals', () => {
    const through = new Date('2026-07-22T12:00:00');
    const unknown: HistoricalEntry[] = [{
      id: 'day-2',
      trackerId: 'marijuana',
      eventDate: '2026-07-21',
      recordedAt: '2026-07-26T12:00:00',
      outcome: 'no_data',
    }];
    const before = recoveryStats(
      recoverySeriesFromEntries(tracker.startedAt, unknown, through),
    );
    const corrected = [{ ...unknown[0], outcome: 'stayed_on_plan' as const }];
    const after = recoveryStats(
      recoverySeriesFromEntries(tracker.startedAt, corrected, through),
    );

    expect(before.successfulDays).toBe(2);
    expect(after.successfulDays).toBe(3);
  });

  test('a backfilled lapse flattens the correct date and later values stay cumulative', () => {
    const points = recoverySeriesFromEntries(
      tracker.startedAt,
      [{
        eventDate: '2026-07-22',
        outcome: 'lapse',
      }],
      new Date('2026-07-24T12:00:00'),
    );

    expect(points.map((point) => point.cumulative)).toEqual([1, 2, 2, 3, 4]);
    expect(points[2]).toMatchObject({
      date: '2026-07-22',
      successful: false,
      outcome: 'lapse',
    });
    expect(points[4].cumulative).toBeGreaterThan(points[2].cumulative);
  });

  test('backfilling does not increase the daily check-in streak', () => {
    const before = baseState();
    const streakBefore = dailyCheckInStreak(before.checkIns, new Date('2026-07-26T12:00:00'));
    const after = upsertHistoricalEntry(before, {
      trackerId: 'marijuana',
      eventDate: '2026-07-24',
      outcome: 'stayed_on_plan',
    }, '2026-07-26T12:00:00');

    expect(after.checkIns).toEqual(before.checkIns);
    expect(dailyCheckInStreak(after.checkIns, new Date('2026-07-26T12:00:00')))
      .toBe(streakBefore);
  });

  test('editing and deleting historical entries recalculates recovery metrics', () => {
    const through = new Date('2026-07-22T12:00:00');
    const withLapse = upsertHistoricalEntry(baseState(), {
      trackerId: 'marijuana',
      eventDate: '2026-07-21',
      outcome: 'lapse',
    }, '2026-07-26T12:00:00');
    const lapseEntry = withLapse.historicalEntries![0];
    const edited = upsertHistoricalEntry(withLapse, {
      id: lapseEntry.id,
      trackerId: 'marijuana',
      eventDate: '2026-07-21',
      outcome: 'stayed_on_plan',
    }, '2026-07-26T13:00:00');
    const deleted = removeHistoricalEntry(edited, lapseEntry.id);

    expect(recoveryStats(recoverySeriesFromEntries(
      tracker.startedAt,
      withLapse.historicalEntries!,
      through,
    )).successfulDays).toBe(2);
    expect(recoveryStats(recoverySeriesFromEntries(
      tracker.startedAt,
      edited.historicalEntries!,
      through,
    )).successfulDays).toBe(3);
    expect(deleted.historicalEntries).toEqual([]);
    expect(recoveryStats(recoverySeriesFromEntries(
      tracker.startedAt,
      deleted.historicalEntries!,
      through,
    )).successfulDays).toBe(3);
  });

  test('no data is neither success nor lapse and does not restart the streak', () => {
    const entry: HistoricalEntry = {
      id: 'unknown-day',
      trackerId: 'marijuana',
      eventDate: '2026-07-22',
      recordedAt: '2026-07-26T12:00:00',
      outcome: 'no_data',
    };
    const points = recoverySeriesFromEntries(
      tracker.startedAt,
      [entry],
      new Date('2026-07-23T12:00:00'),
    );

    expect(points[2]).toMatchObject({ successful: false, outcome: 'no_data' });
    expect(points[2].cumulative).toBe(points[1].cumulative);
    expect(currentStreakFromEntries(
      tracker.startedAt,
      [entry],
      new Date('2026-07-23T12:00:00'),
    )).toBe(tracker.startedAt);
  });
});
