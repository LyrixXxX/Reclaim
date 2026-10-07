import { CpapReading } from '@/models/tracker';
import { cpapAxisLabelIndices, cpapTrendAxis, cpapTrendPoints, filterCpapReadings } from './cpap';

const base: CpapReading = { id: 'test', sleepDate: '2026-09-01', usedMinutes: 300, averagePressure: 5, p95Pressure: 8, ahi: 2, cai: 0, averageLeak: 10, p95Leak: 20, recordedAt: '2026-09-01T08:00:00Z' };
const reading = (sleepDate: string, ahi = 2) => ({ ...base, id: sleepDate, sleepDate, ahi });

describe('six-month CPAP charts', () => {
  test('shows six consecutive months including the current month', () => {
    expect(cpapTrendAxis('6M', [], new Date(2026, 8, 22)).map((tick) => tick.key)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(cpapAxisLabelIndices(6, '6M')).toEqual([0, 1, 2, 3, 4, 5]);
  });
  test('handles year rollover and month-end dates', () => {
    expect(cpapTrendAxis('6M', [], new Date(2026, 0, 31)).map((tick) => tick.key)).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
  });
  test('filters complete calendar months through today without modifying history', () => {
    const data = [reading('2026-03-31'), reading('2026-04-01'), reading('2026-09-01', 4), reading('2026-09-22', 6), reading('2026-09-23')];
    const original = JSON.stringify(data);
    const visible = filterCpapReadings(data, '6M', new Date(2026, 8, 22));
    expect(visible.map((item) => item.sleepDate)).toEqual(['2026-04-01', '2026-09-01', '2026-09-22']);
    expect(cpapTrendPoints(visible, 'ahi', '6M')).toMatchObject([{ bucketKey: '2026-04', count: 1, value: 2 }, { bucketKey: '2026-09', count: 2, value: 5 }]);
    expect(JSON.stringify(data)).toBe(original);
  });
  test('keeps seven completed days and annual report windows unchanged', () => {
    const now = new Date(2026, 8, 22);
    expect(cpapTrendAxis('7D', [], now).map((tick) => tick.key)).toEqual(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21']);
    expect(cpapAxisLabelIndices(7, '7D')).toHaveLength(7);
    expect(cpapTrendAxis('1Y', [], now)).toHaveLength(12);
  });
  test('long axes do not append a seventh label beside the final label', () => {
    expect(cpapAxisLabelIndices(12, '1Y')).toEqual([0, 2, 4, 7, 9, 11]);
    expect(cpapAxisLabelIndices(0, '6M')).toEqual([]);
    expect(cpapAxisLabelIndices(1, 'ALL')).toEqual([0]);
  });
});
