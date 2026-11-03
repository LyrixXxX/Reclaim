import { stepCalories } from './step-calories';

describe('step calories', () => {
  test('scales with steps and the latest weigh-in on or before the day', () => {
    const entries = [
      { id: 'a', date: '2026-10-01', weight: 220, unit: 'lb' as const, recordedAt: '' },
      { id: 'b', date: '2026-11-01', weight: 80, unit: 'kg' as const, recordedAt: '' },
      { id: 'c', date: '2026-12-01', weight: 60, unit: 'kg' as const, recordedAt: '' },
    ];
    expect(stepCalories(10_000, entries, '2026-11-03')).toEqual({ kcal: 333, weightKg: 80, fromWeighIn: true });
    expect(stepCalories(10_000, entries, '2026-10-15')?.kcal).toBe(416);
  });

  test('falls back to an average weight, and skips missing counts', () => {
    expect(stepCalories(8_000, [], '2026-11-03')).toEqual({ kcal: 233, weightKg: 70, fromWeighIn: false });
    expect(stepCalories(0, [], '2026-11-03')?.kcal).toBe(0);
    expect(stepCalories(undefined, [], '2026-11-03')).toBeUndefined();
  });
});
