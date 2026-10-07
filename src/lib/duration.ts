const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const MONTH_MS = 30.4375 * DAY_MS;
export const YEAR_MS = 365.25 * DAY_MS;

export type DurationUnit = 'minute' | 'hour' | 'day' | 'month' | 'year';

export type DurationRow = {
  unit: DurationUnit;
  total: number;
  totalLabel: string;
  progress: number;
  secondaryLabel: string;
};

export type LiveDuration = {
  elapsedMs: number;
  fullLabel: string;
  rows: DurationRow[];
};

export function liveDuration(startedAt: string, now = Date.now()): LiveDuration {
  const parsed = Date.parse(startedAt);
  const elapsedMs = Number.isFinite(parsed) ? Math.max(0, now - parsed) : 0;
  const totals = {
    minute: elapsedMs / MINUTE_MS,
    hour: elapsedMs / HOUR_MS,
    day: elapsedMs / DAY_MS,
    month: elapsedMs / MONTH_MS,
    year: elapsedMs / YEAR_MS,
  };
  const yearProgress = cycle(totals.year);
  return {
    elapsedMs,
    fullLabel: formatFullDuration(elapsedMs),
    rows: [
      row('minute', totals.minute, cycle(totals.minute), `${Math.floor((elapsedMs % MINUTE_MS) / SECOND_MS)} seconds toward next minute`),
      row('hour', totals.hour, cycle(totals.hour), `${formatFlexible((elapsedMs % HOUR_MS) / MINUTE_MS, 1)} minutes toward next hour`),
      row('day', totals.day, cycle(totals.day), `${formatFlexible((elapsedMs % DAY_MS) / HOUR_MS, 1)} hours toward next day`),
      row('month', totals.month, cycle(totals.month), `${formatFlexible((elapsedMs % MONTH_MS) / DAY_MS, 1)} days toward next month`),
      row('year', totals.year, yearProgress, totals.year >= 1
        ? `${Math.round(yearProgress * 100)}% toward year ${Math.floor(totals.year) + 1}`
        : `${formatFlexible((elapsedMs % YEAR_MS) / MONTH_MS, 2)} months toward next year`),
    ],
  };
}

export function formatFullDuration(elapsedMs: number) {
  let remaining = Math.max(0, elapsedMs);
  const years = Math.floor(remaining / YEAR_MS); remaining -= years * YEAR_MS;
  const months = Math.floor(remaining / MONTH_MS); remaining -= months * MONTH_MS;
  const days = Math.floor(remaining / DAY_MS); remaining -= days * DAY_MS;
  const hours = Math.floor(remaining / HOUR_MS); remaining -= hours * HOUR_MS;
  const minutes = Math.floor(remaining / MINUTE_MS); remaining -= minutes * MINUTE_MS;
  const seconds = Math.floor(remaining / SECOND_MS);
  const parts: string[] = [];
  if (years) parts.push(plural(years, 'year'));
  if (months) parts.push(plural(months, 'month'));
  if (days) parts.push(plural(days, 'day'));
  if (hours) parts.push(plural(hours, 'hour'));
  if (minutes) parts.push(plural(minutes, 'minute'));
  if (!parts.length) parts.push(plural(seconds, 'second'));
  return parts.join(', ');
}

function row(unit: DurationUnit, total: number, progress: number, secondaryLabel: string): DurationRow {
  return { unit, total, progress: clamp(progress), totalLabel: totalText(unit, total), secondaryLabel };
}

function totalText(unit: DurationUnit, total: number) {
  const label = `${unit}s`;
  if (unit === 'minute') return `${Math.floor(total).toLocaleString()} total ${label}`;
  if (unit === 'hour') return `${formatFlexible(total, 1)} total ${label}`;
  if (unit === 'day') return `${formatFlexible(total, 2, 1)} total ${label}`;
  if (unit === 'month') return `${total.toFixed(2)} total ${label}`;
  return `${total.toFixed(total < 0.1 ? 3 : 2)} total ${label}`;
}

function cycle(total: number) { return total - Math.floor(total); }
function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function plural(value: number, unit: string) { return `${value} ${unit}${value === 1 ? '' : 's'}`; }
function formatFlexible(value: number, maxDecimals: number, minDecimals = 0) {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDecimals, minimumFractionDigits: minDecimals });
}
