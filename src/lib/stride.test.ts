import { ActivityRoute } from '@/models/tracker';
import { formatMiles, stepDistanceMiles, strideNote, TYPICAL_STRIDE_METERS, walkingStride } from './stride';
import { stepCalories } from './step-calories';

const walk = (id: string, startedAt: string, distanceMeters: number, routeSteps: number, extra: Partial<ActivityRoute> = {}): ActivityRoute =>
  ({ id, kind: 'walk', startedAt, endedAt: startedAt, pausedMs: 0, distanceMeters, points: [], routeSteps, routeStepStatus: 'available', ...extra });

describe('walkingStride', () => {
  it('pools recorded walks so longer walks count for more', () => {
    const stride = walkingStride({ activityRoutes: [walk('a', '2026-11-01T10:00:00Z', 1600, 2000), walk('b', '2026-11-02T10:00:00Z', 4000, 5000)] });
    expect(stride.source).toBe('walks');
    expect(stride.walkCount).toBe(2);
    expect(stride.meters).toBeCloseTo(5600 / 7000);
  });

  it('skips hikes, runs, short walks, partial step counts and impossible strides', () => {
    const routes = [
      walk('hike', '2026-11-01T10:00:00Z', 3000, 3000, { kind: 'hike' }),
      walk('run', '2026-11-01T11:00:00Z', 3000, 2500, { kind: 'run' }),
      walk('short', '2026-11-01T12:00:00Z', 200, 260),
      walk('partial', '2026-11-01T13:00:00Z', 2000, 2500, { routeStepStatus: 'partial' }),
      walk('gps-jump', '2026-11-01T14:00:00Z', 9000, 2000),
    ];
    expect(walkingStride({ activityRoutes: routes }).source).toBe('typical');
  });

  it('uses only the 10 most recent walks', () => {
    const old = Array.from({ length: 5 }, (_, i) => walk(`old${i}`, `2026-01-0${i + 1}T10:00:00Z`, 1000, 2000));
    const recent = Array.from({ length: 10 }, (_, i) => walk(`new${i}`, `2026-10-${10 + i}T10:00:00Z`, 1600, 2000));
    expect(walkingStride({ activityRoutes: [...old, ...recent] }).meters).toBeCloseTo(0.8);
  });

  it('falls back to height, then a typical stride', () => {
    expect(walkingStride({ weightTdeeProfile: { heightCm: 180, birthDate: '1990-01-01', formulaSex: 'male' } })).toEqual({ meters: 1.8 * 0.413, source: 'height', walkCount: 0 });
    expect(walkingStride({ nutritionGoals: [{ id: 'g', effectiveDate: '2026-10-01', recordedAt: '2026-10-01', calculation: { sourceWeightLb: 180, referenceWeightLb: 170, heightCm: 170 } } as never] }).meters).toBeCloseTo(1.7 * 0.413);
    expect(walkingStride(undefined)).toEqual({ meters: TYPICAL_STRIDE_METERS, source: 'typical', walkCount: 0 });
  });
});

describe('distance and notes', () => {
  it('turns steps into miles', () => {
    expect(stepDistanceMiles(2000, { meters: 1609.344 / 2000, source: 'walks', walkCount: 1 })).toBeCloseTo(1);
    expect(formatMiles(2.456)).toBe('2.46 mi');
    expect(formatMiles(12.34)).toBe('12.3 mi');
  });

  it('says where the stride came from', () => {
    expect(strideNote({ meters: 0.7925, source: 'walks', walkCount: 4 })).toBe('Stride 2.6 ft, from your last 4 walks.');
    expect(strideNote({ meters: 0.7925, source: 'walks', walkCount: 1 })).toBe('Stride 2.6 ft, from your last walk.');
    expect(strideNote({ meters: TYPICAL_STRIDE_METERS, source: 'typical', walkCount: 0 })).toMatch(/^Stride 2.5 ft, a typical stride/);
  });

  it('gives more step calories for a longer stride', () => {
    const short = stepCalories(10_000, [], '2026-11-03', 0.7)!.kcal;
    const long = stepCalories(10_000, [], '2026-11-03', 0.9)!.kcal;
    expect(long).toBeGreaterThan(short);
  });
});
