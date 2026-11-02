import { routeMapBounds, routeMapSegments } from './route-map-preview';
import type { ActivityPoint } from '@/models/tracker';

function point(longitude: number, latitude: number, segment = 0): ActivityPoint {
  return { longitude, latitude, segment, timestamp: 0 };
}

describe('saved route map preview', () => {
  it('fits valid route points with margin', () => {
    const bounds = routeMapBounds([point(-84.9, 36), point(-84.8, 36.1)]);
    expect(bounds).not.toBeNull();
    expect(bounds![0]).toBeLessThan(-84.9);
    expect(bounds![1]).toBeLessThan(36);
    expect(bounds![2]).toBeGreaterThan(-84.8);
    expect(bounds![3]).toBeGreaterThan(36.1);
  });

  it('gives a stationary route a usable viewport', () => {
    const bounds = routeMapBounds([point(-84.9, 36)]);
    expect(bounds![2] - bounds![0]).toBeGreaterThan(0);
    expect(bounds![3] - bounds![1]).toBeGreaterThan(0);
  });

  it('does not connect separate route segments or invalid points', () => {
    const segments = routeMapSegments([
      point(1, 2), point(2, 3), point(3, 4, 1), point(4, 5, 1),
      point(NaN, 0, 1), point(5, 6, 1), point(6, 7, 1),
    ]);
    expect(segments).toEqual([
      [[1, 2], [2, 3]],
      [[3, 4], [4, 5]],
      [[5, 6], [6, 7]],
    ]);
  });

  it('does not fabricate a line for one point', () => {
    expect(routeMapSegments([point(1, 2)])).toEqual([]);
    expect(routeMapBounds([])).toBeNull();
  });
});
