import { CpapReading, CpapTherapySettings } from '@/models/tracker';
import { calendarPeriod, cpapCalendarAxis, cpapCalendarBounds, cpapCalendarDataAxis, cpapCalendarPoints, cpapCalendarReadings, cpapCalendarSettingSegments, isFutureCalendarPeriod, moveCalendarPeriod } from './cpap-calendar';

const reading = (sleepDate: string, ahi: number): CpapReading => ({ id: sleepDate, sleepDate, usedMinutes: 300, averagePressure: 6, p95Pressure: 9, ahi, cai: 0, averageLeak: 3, p95Leak: 11, recordedAt: `${sleepDate}T08:00:00Z` });
const setting = (effectiveDate: string, minPressure: number, maxPressure: number): CpapTherapySettings => ({ id: effectiveDate, effectiveDate, mode: 'APAP', minPressure, maxPressure, recordedAt: `${effectiveDate}T12:00:00Z` });

describe('calendar CPAP trends', () => {
  test('week is Monday–Sunday and moves across year boundaries', () => {
    const period = calendarPeriod('week', new Date(2026, 8, 24, 12));
    expect(cpapCalendarBounds(period)).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    expect(cpapCalendarAxis(period)).toHaveLength(7);
    expect(cpapCalendarAxis(period).map((tick) => tick.key)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    expect(cpapCalendarBounds(moveCalendarPeriod(calendarPeriod('week', new Date(2026, 0, 1, 12)), -1))).toEqual({ start: '2025-12-22', end: '2025-12-28' });
  });

  test('month uses calendar weeks clipped to the month, including six-slot months', () => {
    const september = calendarPeriod('month', new Date(2026, 8, 24, 12));
    expect(cpapCalendarAxis(september).map(({ start, end }) => [start, end])).toEqual([
      ['2026-09-01', '2026-09-06'], ['2026-09-07', '2026-09-13'], ['2026-09-14', '2026-09-20'], ['2026-09-21', '2026-09-27'], ['2026-09-28', '2026-09-30'],
    ]);
    expect(cpapCalendarAxis(calendarPeriod('month', new Date(2026, 7, 20, 12)))).toHaveLength(6);
    expect(cpapCalendarAxis(calendarPeriod('month', new Date(2021, 1, 20, 12)))).toHaveLength(4);
  });

  test('year contains January–December and navigation crosses years', () => {
    const year = calendarPeriod('year', new Date(2026, 8, 24, 12));
    const axis = cpapCalendarAxis(year);
    expect(axis).toHaveLength(12);
    expect(axis[0]).toMatchObject({ key: '2026-01', start: '2026-01-01', end: '2026-01-31' });
    expect(axis[11]).toMatchObject({ key: '2026-12', start: '2026-12-01', end: '2026-12-31' });
    expect(cpapCalendarBounds(moveCalendarPeriod(year, -1)).start).toBe('2025-01-01');
  });

  test('current periods include logged nights but not future nights, and empty slots are absent', () => {
    const today = new Date(2026, 8, 24, 12);
    const period = calendarPeriod('week', today);
    const entries = [reading('2026-09-21', 1), reading('2026-09-23', 3), reading('2026-09-25', 8)];
    const visible = cpapCalendarReadings(entries, period, today);
    expect(visible.map((item) => item.sleepDate)).toEqual(['2026-09-21', '2026-09-23']);
    expect(cpapCalendarPoints(visible, 'ahi', cpapCalendarAxis(period)).map((point) => [point.bucketKey, point.value])).toEqual([['2026-09-21', 1], ['2026-09-23', 3]]);
    expect(isFutureCalendarPeriod(moveCalendarPeriod(period, 1), today)).toBe(true);
    expect(isFutureCalendarPeriod(moveCalendarPeriod(period, -1), today)).toBe(false);
  });

  test('weekly and monthly means use only recorded nights', () => {
    const entries = [reading('2026-09-21', 1), reading('2026-09-23', 3), reading('2026-09-28', 8), reading('2026-10-01', 100)];
    const month = calendarPeriod('month', new Date(2026, 8, 30, 12));
    expect(cpapCalendarPoints(cpapCalendarReadings(entries, month, new Date(2026, 8, 30, 12)), 'ahi', cpapCalendarAxis(month))).toMatchObject([{ count: 2, value: 2 }, { count: 1, value: 8 }]);
    const year = calendarPeriod('year', new Date(2026, 9, 2, 12));
    expect(cpapCalendarPoints(entries, 'ahi', cpapCalendarAxis(year))).toMatchObject([{ bucketKey: '2026-09', count: 3, value: 4 }, { bucketKey: '2026-10', count: 1, value: 100 }]);
  });

  test('month chart labels only logged weeks by their actual start date', () => {
    const month = calendarPeriod('month', new Date(2026, 8, 24, 12));
    const readings = [reading('2026-09-07', 2), reading('2026-09-08', 4), reading('2026-09-22', 3)];
    const axis = cpapCalendarDataAxis(month, readings);
    expect(axis.map((tick) => [tick.key, tick.label])).toEqual([['2026-09-07', 'Sep 7'], ['2026-09-21', 'Sep 21']]);
    expect(cpapCalendarPoints(readings, 'ahi', axis).map((point) => point.value)).toEqual([3, 3]);
  });

  test('year chart labels only logged months in chronological order', () => {
    const year = calendarPeriod('year', new Date(2026, 8, 24, 12));
    const axis = cpapCalendarDataAxis(year, [reading('2026-09-20', 3), reading('2026-02-01', 2), reading('2026-07-01', 1)]);
    expect(axis.map((tick) => [tick.key, tick.label])).toEqual([['2026-02', 'Feb'], ['2026-07', 'Jul'], ['2026-09', 'Sep']]);
    expect(cpapCalendarDataAxis(year, [])).toEqual([]);
  });

  test('pressure settings split a week when the effective date changes', () => {
    const axis = cpapCalendarAxis(calendarPeriod('month', new Date(2026, 8, 24, 12)));
    const segments = cpapCalendarSettingSegments(axis, [setting('2026-09-01', 4, 20), setting('2026-09-24', 5.5, 13)]).filter((item) => item.index === 3);
    expect(segments).toMatchObject([{ start: '2026-09-21', end: '2026-09-23', changedWithinTick: true }, { start: '2026-09-24', end: '2026-09-27', changedWithinTick: true }]);
    expect(segments[0].to).toBeCloseTo(3 / 7);
    expect(segments[1].from).toBeCloseTo(3 / 7);
  });
});
