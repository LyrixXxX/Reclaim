import { addMotionFix, closeMotion, freshMotionState, motionTotals } from './activity-motion';

const base = Date.parse('2026-10-21T12:00:00.000Z');
const fix = (seconds: number, latitude: number, accuracy = 5, segment = 0) => ({ latitude, longitude: -87.63, accuracy, timestamp: base + seconds * 1000, segment });

test('counts sustained walking, a long stop, and resumed walking independently', () => {
  const state = freshMotionState();
  for (let second = 0; second <= 300; second += 5) addMotionFix(state, fix(second, 41.88 + second * 0.000012));
  for (let second = 305; second <= 905; second += 5) addMotionFix(state, fix(second, 41.8836 + (second % 10 ? 0.000002 : 0)));
  for (let second = 910; second <= 1210; second += 5) addMotionFix(state, fix(second, 41.8836 + (second - 905) * 0.000012));
  closeMotion(state, base + 1210_000);
  expect(state.movingMs).toBeGreaterThan(550_000);
  expect(state.stoppedMs).toBeGreaterThan(550_000);
  expect(state.stationaryIntervals).toHaveLength(1);
  expect(motionTotals(state, 1210_000).movingMs! + motionTotals(state, 1210_000).stoppedMs!).toBeLessThanOrEqual(1210_000);
});

test('drift, weak fixes, impossible jumps, and missing updates do not create moving time', () => {
  const state = freshMotionState();
  addMotionFix(state, fix(0, 41.88));
  addMotionFix(state, fix(5, 41.880002));
  addMotionFix(state, fix(10, 41.880001));
  addMotionFix(state, fix(15, 41.880003));
  addMotionFix(state, fix(20, 41.881, 80));
  addMotionFix(state, fix(25, 41.88));
  addMotionFix(state, fix(30, 41.9));
  addMotionFix(state, fix(100, 41.9001));
  expect(state.movingMs).toBe(0);
  expect(motionTotals(state, 100_000).unclassifiedMs).toBeGreaterThan(70_000);
});

test('manual pause segment boundary prevents time across a pause being counted', () => {
  const state = freshMotionState();
  addMotionFix(state, fix(0, 41.88));
  addMotionFix(state, fix(5, 41.88006));
  closeMotion(state, base + 5_000);
  addMotionFix(state, fix(605, 41.881, 5, 1));
  addMotionFix(state, fix(610, 41.88106, 5, 1));
  expect(state.movingMs).toBe(10_000);
});

test('slow uphill travel eventually qualifies without calling it a stop', () => {
  const state = freshMotionState();
  for (let second = 0; second <= 120; second += 5) addMotionFix(state, fix(second, 41.88 + second * 0.0000055));
  expect(state.movingMs).toBeGreaterThan(75_000);
  expect(state.stoppedMs).toBe(0);
});

test('steady phone-reported walking resumes a stop within two five-second fixes', () => {
  const state = freshMotionState();
  for (const second of [0, 5, 10, 15]) addMotionFix(state, { ...fix(second, 41.88, 15), speed: 0 });
  expect(state.status).toBe('stopped');
  addMotionFix(state, { ...fix(20, 41.88005, 15), speed: 1.1 });
  expect(state.status).toBe('stopped');
  addMotionFix(state, { ...fix(25, 41.88010, 15), speed: 1.1 });
  expect(state.status).toBe('moving');
  expect(state.stationaryIntervals).toHaveLength(1);
});

test('a brief speed spike without displacement does not resume a stop', () => {
  const state = freshMotionState();
  for (const second of [0, 5, 10, 15]) addMotionFix(state, { ...fix(second, 41.88, 15), speed: 0 });
  addMotionFix(state, { ...fix(20, 41.880001, 15), speed: 1.2 });
  addMotionFix(state, { ...fix(25, 41.88, 15), speed: 0 });
  expect(state.status).not.toBe('moving');
});
