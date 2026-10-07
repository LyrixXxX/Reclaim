const DAY_MS = 86_400_000;

export type DurationParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function elapsedParts(startedAt: string, now = Date.now()): DurationParts {
  const totalSeconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function rollingProgress(startedAt: string, periodDays: number, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(startedAt));
  return Math.min(1, (elapsed % (periodDays * DAY_MS)) / (periodDays * DAY_MS));
}

export function nextCheckpoint(
  startedAt: string,
  checkpoints: number[],
  now = Date.now(),
) {
  const elapsedDays = Math.max(0, (now - Date.parse(startedAt)) / DAY_MS);
  const targetDays = checkpoints.find((days) => days > elapsedDays) ??
    Math.ceil(elapsedDays / 365 + 1) * 365;
  const remainingMs = Math.max(0, targetDays * DAY_MS - (now - Date.parse(startedAt)));

  return {
    targetDays,
    remainingMs,
    remainingDays: Math.floor(remainingMs / DAY_MS),
    remainingHours: Math.floor((remainingMs % DAY_MS) / 3_600_000),
  };
}

export function reductionPercent(baseline: number, current: number) {
  if (baseline <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((baseline - current) / baseline) * 100)));
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
