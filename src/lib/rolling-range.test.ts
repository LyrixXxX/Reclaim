import { datesInWindow, rollingBounds, shiftDate } from './rolling-range';

describe('rolling date windows', () => {
  test('crosses week, month, and year boundaries', () => {
    expect(rollingBounds('7D', 0, new Date(2027, 0, 1))).toMatchObject({ start: '2026-12-26', end: '2027-01-01' });
    expect(rollingBounds('30D', 0, new Date(2026, 9, 1)).start).toBe('2026-09-02');
    expect(datesInWindow('2026-12-26', '2027-01-01')).toHaveLength(7);
  });
  test('uses 365 calendar dates including leap day', () => {
    const { start, end } = rollingBounds('365D', 0, new Date(2024, 2, 1));
    expect(datesInWindow(start, end)).toHaveLength(365);
    expect(datesInWindow(start, end)).toContain('2024-02-29');
  });
  test('browses by a full window and clamps future offsets', () => {
    const current = rollingBounds('7D', 0, new Date(2026, 8, 23));
    expect(rollingBounds('7D', -1, new Date(2026, 8, 23)).end).toBe(shiftDate(current.start, -1));
    expect(rollingBounds('7D', 1, new Date(2026, 8, 23))).toEqual(current);
  });
  test('CPAP completed-night shift ends yesterday', () => {
    expect(rollingBounds('7D', 0, new Date(2026, 9, 1), -1)).toMatchObject({ start: '2026-09-24', end: '2026-09-30' });
  });
});
