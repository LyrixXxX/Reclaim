import { ActivityPoint } from '@/models/tracker';
import { routeElevation } from './route-elevation';

const points = (heights: (number | null)[], segment = 0): ActivityPoint[] => heights.map((altitudeMeters, index) => ({ latitude: 35 + index * 0.0001, longitude: -86, timestamp: index * 1000, altitudeMeters, altitudeAccuracyMeters: 5, segment }));

test('older routes without altitude stay unavailable', () => {
  expect(routeElevation(points([null, null, null, null]))).toBeNull();
});

test('smooths small altitude wobble without inventing a climb', () => {
  const result = routeElevation(points([100, 101, 99, 100, 101, 100]));
  expect(result?.gainMeters).toBe(0);
  expect(result?.lossMeters).toBe(0);
});

test('counts a sustained climb and descent', () => {
  const result = routeElevation(points([100, 101, 104, 108, 112, 115, 112, 108, 104, 100]));
  expect(result?.gainMeters).toBeGreaterThan(5);
  expect(result?.lossMeters).toBeGreaterThan(5);
});

test('does not join pauses or unreliable altitude readings', () => {
  const separate = [...points([100, 100, 100, 100, 100]), ...points([300, 300, 300, 300, 300], 1).map((point, index) => ({ ...point, latitude: 35.001 + index * 0.0001 }))];
  expect(routeElevation(separate)?.gainMeters).toBe(0);
  const unreliable = points([100, 100, 200, 100, 100]);
  unreliable[2].altitudeAccuracyMeters = 100;
  expect(routeElevation(unreliable)).toBeNull();
});
