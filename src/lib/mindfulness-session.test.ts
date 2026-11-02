import { BREATH_CYCLE_MS, breathingPhase, sessionClock, sessionElapsedMs, sessionMinutes } from './mindfulness-session';

test('breathing guide has a four-second inhale, two-second hold, and slower six-second exhale', () => {
  expect(BREATH_CYCLE_MS).toBe(12_000);
  expect(breathingPhase(0)).toBe('in');
  expect(breathingPhase(3_999)).toBe('in');
  expect(breathingPhase(4_000)).toBe('hold');
  expect(breathingPhase(5_999)).toBe('hold');
  expect(breathingPhase(6_000)).toBe('out');
  expect(breathingPhase(11_999)).toBe('out');
  expect(breathingPhase(12_000)).toBe('in');
});

test('early finish saves practiced time rather than the planned session length', () => {
  expect(sessionMinutes(sessionElapsedMs(0, 1_000, 421_000))).toBe(7);
  expect(sessionClock(sessionElapsedMs(0, 1_000, 421_000))).toBe('07:00');
});

test('a paused or backgrounded session does not accumulate more time', () => {
  expect(sessionElapsedMs(180_000, null, 999_000)).toBe(180_000);
  expect(sessionMinutes(sessionElapsedMs(180_000, 500_000, 620_000))).toBe(5);
});

test('subsecond sessions do not create a positive log', () => {
  expect(sessionMinutes(400)).toBe(0);
});
