import type { ActivityRoute } from '@/models/tracker';

import { routeShareStats } from './route-share';

const route = (extra: Partial<ActivityRoute> = {}): ActivityRoute => ({
  id: 'route-1', kind: 'hike', startedAt: '2026-11-06T10:00:00.000Z', endedAt: '2026-11-06T12:30:00.000Z', pausedMs: 0, distanceMeters: 8047, points: [], ...extra,
});

const climb = Array.from({ length: 12 }, (_, index) => ({ latitude: 36 + index * 0.001, longitude: -85, timestamp: index * 60_000, altitudeMeters: 300 + index * 10, altitudeAccuracyMeters: 3 }));

test('shows moving time, elevation and steps when the route recorded them', () => {
  const labels = routeShareStats(route({ movingMs: 2_520_000, routeSteps: 12_345, points: climb }));
  expect(labels.find((stat) => stat.label === 'Moving time')?.value).toBe('42 min');
  expect(labels.find((stat) => stat.label === 'Steps')?.value).toBe((12_345).toLocaleString());
  expect(labels.find((stat) => stat.label === 'Elevation gain')?.value).toMatch(/ ft$/);
});

test('leaves out what an older route never recorded', () => {
  const stats = routeShareStats(route());
  expect(stats.map((stat) => stat.label)).toEqual(['Distance', 'Time']);
  expect(stats[1].value).toBe('2h 30m');
});
