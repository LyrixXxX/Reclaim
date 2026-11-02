export const BREATH_IN_MS = 4_000;
export const BREATH_HOLD_MS = 2_000;
export const BREATH_OUT_MS = 6_000;
export const BREATH_CYCLE_MS = BREATH_IN_MS + BREATH_HOLD_MS + BREATH_OUT_MS;

export function breathingPhase(elapsedMs: number): 'in' | 'hold' | 'out' {
  const position = Math.max(0, elapsedMs) % BREATH_CYCLE_MS;
  if (position < BREATH_IN_MS) return 'in';
  if (position < BREATH_IN_MS + BREATH_HOLD_MS) return 'hold';
  return 'out';
}

export function sessionElapsedMs(savedMs: number, runningSince: number | null, now: number) {
  return Math.max(0, savedMs + (runningSince === null ? 0 : Math.max(0, now - runningSince)));
}

export function sessionMinutes(elapsedMs: number) {
  return Math.round(Math.max(0, elapsedMs) / 1000) / 60;
}

export function sessionClock(elapsedMs: number) {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
