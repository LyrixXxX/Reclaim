import { DAY_MS, HOUR_MS, liveDuration, MINUTE_MS, MONTH_MS, YEAR_MS } from './duration';

const start = '2020-01-01T00:00:00.000Z';
const startMs = Date.parse(start);

describe('live accumulated durations', () => {
  test('totals accumulate in every requested unit with sensible display rounding', () => {
    const elapsed = 11 * DAY_MS + 17 * HOUR_MS + 30 * MINUTE_MS;
    const duration = liveDuration(start, startMs + elapsed);
    const labels = Object.fromEntries(duration.rows.map((row) => [row.unit, row.totalLabel]));
    expect(labels).toEqual({
      minute: '16,890 total minutes',
      hour: '281.5 total hours',
      day: '11.73 total days',
      month: '0.39 total months',
      year: '0.032 total years',
    });
  });

  test('totals never reset at minute, hour, day, month, or year boundaries', () => {
    const duration = liveDuration(start, startMs + 2 * YEAR_MS + 3 * DAY_MS + 2 * HOUR_MS);
    const totals = Object.fromEntries(duration.rows.map((row) => [row.unit, row.total]));
    expect(totals.minute).toBeGreaterThan(1_000_000);
    expect(totals.hour).toBeGreaterThan(17_000);
    expect(totals.day).toBeGreaterThan(733);
    expect(totals.month).toBeGreaterThan(24);
    expect(totals.year).toBeGreaterThan(2);
  });

  test('bars cycle at their exact elapsed-time boundaries', () => {
    const before = liveDuration(start, startMs + HOUR_MS - 1);
    const boundary = liveDuration(start, startMs + HOUR_MS);
    expect(before.rows.find((row) => row.unit === 'hour')?.progress).toBeCloseTo(1, 5);
    expect(boundary.rows.find((row) => row.unit === 'hour')?.progress).toBe(0);
    expect(liveDuration(start, startMs + DAY_MS).rows.find((row) => row.unit === 'day')?.progress).toBe(0);
    expect(liveDuration(start, startMs + MONTH_MS).rows.find((row) => row.unit === 'month')?.progress).toBe(0);
    expect(liveDuration(start, startMs + YEAR_MS).rows.find((row) => row.unit === 'year')?.progress).toBe(0);
  });

  test('five-plus-year totals and the next-year bar remain correct', () => {
    const duration = liveDuration(start, startMs + 5.42 * YEAR_MS);
    const year = duration.rows.find((row) => row.unit === 'year');
    expect(year?.totalLabel).toBe('5.42 total years');
    expect(year?.progress).toBeCloseTo(0.42);
    expect(year?.secondaryLabel).toBe('42% toward year 6');
  });

  test('every progress value remains bounded between zero and one', () => {
    for (const elapsed of [0, 1, MINUTE_MS - 1, YEAR_MS * 100 + 123_456]) {
      expect(liveDuration(start, startMs + elapsed).rows.every((row) => row.progress >= 0 && row.progress <= 1)).toBe(true);
    }
  });

  test('future timestamps clamp to zero instead of showing negative time', () => {
    const duration = liveDuration('2030-01-01T00:00:00.000Z', Date.parse('2029-01-01T00:00:00.000Z'));
    expect(duration.elapsedMs).toBe(0);
    expect(duration.fullLabel).toBe('0 seconds');
    expect(duration.rows.every((row) => row.total === 0 && row.progress === 0)).toBe(true);
  });

  test('full duration is human-readable below and above one year', () => {
    expect(liveDuration(start, startMs + 11 * DAY_MS + 17 * HOUR_MS + 30 * MINUTE_MS).fullLabel)
      .toBe('11 days, 17 hours, 30 minutes');
    expect(liveDuration(start, startMs + 2 * YEAR_MS + 4 * MONTH_MS + 8 * DAY_MS + 6 * HOUR_MS).fullLabel)
      .toBe('2 years, 4 months, 8 days, 6 hours');
  });

  test('live calculations never alter the stored start timestamp', () => {
    const stored = { startedAt: start };
    liveDuration(stored.startedAt, startMs + DAY_MS);
    liveDuration(stored.startedAt, startMs + 2 * DAY_MS);
    expect(stored.startedAt).toBe(start);
  });
});
