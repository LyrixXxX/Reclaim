import { canBridgeAutoPause, lostFixCoverage, plausibleRouteFix, reliableRouteFix } from './route-continuity';

const anchor = { latitude: 41.88, longitude: -87.63, timestamp: 0, accuracy: 5, segment: 0 };

test('bridges a nearby reliable stop, but never an unsupported gap or large relocation', () => {
  const resumed = { ...anchor, latitude: 41.88012, timestamp: 300_000 };
  expect(canBridgeAutoPause(anchor, resumed, false)).toBe(true);
  expect(canBridgeAutoPause(anchor, resumed, true)).toBe(false);
  expect(canBridgeAutoPause(anchor, resumed, undefined)).toBe(false);
  expect(canBridgeAutoPause(anchor, { ...resumed, latitude: 41.881 }, false)).toBe(false);
  expect(canBridgeAutoPause(anchor, { ...resumed, accuracy: 80 }, false)).toBe(false);
});

test('identifies weak, impossible and missing fixes before route point storage', () => {
  expect(reliableRouteFix(anchor)).toBe(true);
  expect(reliableRouteFix({ ...anchor, accuracy: 60 })).toBe(false);
  expect(plausibleRouteFix(anchor, { ...anchor, latitude: 41.9, timestamp: 5_000 })).toBe(false);
  expect(lostFixCoverage(anchor, { ...anchor, timestamp: 30_001 })).toBe(true);
  expect(lostFixCoverage(anchor, { ...anchor, timestamp: 30_000 })).toBe(false);
});
