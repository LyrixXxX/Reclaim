import {
  elapsedParts,
  localDateKey,
  nextCheckpoint,
  reductionPercent,
  rollingProgress,
} from './progress';

describe('progress helpers', () => {
  const start = '2026-01-01T00:00:00.000Z';

  test('splits elapsed time into live timer parts', () => {
    expect(elapsedParts(start, Date.parse('2026-01-03T02:03:04.000Z'))).toEqual({
      days: 2,
      hours: 2,
      minutes: 3,
      seconds: 4,
    });
  });

  test('calculates rolling period progress', () => {
    expect(rollingProgress(start, 7, Date.parse('2026-01-04T12:00:00.000Z'))).toBeCloseTo(0.5);
  });

  test('finds the next checkpoint', () => {
    const checkpoint = nextCheckpoint(start, [1, 3, 7, 14], Date.parse('2026-01-05T00:00:00.000Z'));
    expect(checkpoint.targetDays).toBe(7);
    expect(checkpoint.remainingDays).toBe(3);
  });

  test('clamps reduction percent', () => {
    expect(reductionPercent(400, 180)).toBe(55);
    expect(reductionPercent(0, 5)).toBe(0);
    expect(reductionPercent(10, -2)).toBe(100);
  });

  test('creates a local date key', () => {
    expect(localDateKey(new Date(2026, 6, 4))).toBe('2026-07-04');
  });
});
