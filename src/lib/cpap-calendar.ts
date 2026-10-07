import { CpapReading, CpapTherapySettings } from '@/models/tracker';
import { activeCpapSettings, CpapTrendMetric, CpapTrendPoint } from './cpap';
import { RollingRange, dateKey, datesInWindow, rollingBounds, rollingLabel } from './rolling-range';

export type CpapCalendarRange = 'week' | 'month' | 'year';
export type CpapCalendarPeriod = { range: CpapCalendarRange; anchor: string };
export type CpapRollingPeriod = { range: RollingRange; offset: number; today: string; first: string };
export type CpapChartPeriod = CpapCalendarPeriod | CpapRollingPeriod;
export type CpapCalendarTick = { key: string; label: string; start: string; end: string };

export function rollingCpapPeriod(range: RollingRange, offset: number, now: Date, readings: CpapReading[]): CpapRollingPeriod {
  return { range, offset, today: dateKey(now), first: [...readings].sort((a, b) => a.sleepDate.localeCompare(b.sleepDate))[0]?.sleepDate ?? dateKey(now) };
}
export function cpapPeriodBounds(period: CpapChartPeriod) {
  if (!('offset' in period)) return cpapCalendarBounds(period);
  const bounds = rollingBounds(period.range, period.offset, new Date(`${period.today}T12:00:00`), -1);
  return { start: period.range === 'ALL' ? period.first <= bounds.end ? period.first : bounds.end : bounds.start, end: bounds.end };
}
export function cpapPeriodLabel(period: CpapChartPeriod) {
  if (period.range === 'week' || period.range === 'month' || period.range === 'year') return cpapCalendarLabel(period);
  const { start, end } = cpapPeriodBounds(period);
  return rollingLabel(period.range === 'ALL' ? '' : start, end);
}
export function cpapPeriodAxis(period: CpapChartPeriod): CpapCalendarTick[] {
  if (period.range === 'week' || period.range === 'month' || period.range === 'year') return cpapCalendarAxis(period);
  const { start, end } = cpapPeriodBounds(period);
  if (start > end) return [];
  const dates = datesInWindow(start, end);
  const size = period.range === '7D' ? 1 : period.range === '30D' ? 7 : period.range === '365D' ? 30 : Math.max(1, Math.ceil(dates.length / 12));
  const ticks: CpapCalendarTick[] = [];
  for (let i = 0; i < dates.length; i += size) {
    const first = dates[i], last = dates[Math.min(i + size - 1, dates.length - 1)];
    ticks.push({ key: first, label: short(first), start: first, end: last });
  }
  return ticks;
}
export function cpapPeriodDataAxis(period: CpapChartPeriod, readings: CpapReading[]) {
  const axis = cpapPeriodAxis(period);
  return 'offset' in period ? axis : axis.filter((tick) => readings.some((reading) => reading.sleepDate >= tick.start && reading.sleepDate <= tick.end));
}
export function cpapPeriodReadings(readings: CpapReading[], period: CpapChartPeriod) {
  const { start, end } = cpapPeriodBounds(period);
  return readings.filter((reading) => reading.sleepDate >= start && reading.sleepDate <= end);
}

const date = (key: string) => new Date(`${key}T12:00:00`);
const key = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const shift = (value: string, days: number) => { const next = date(value); next.setDate(next.getDate() + days); return key(next); };
const monday = (value: string) => shift(value, -((date(value).getDay() + 6) % 7));
const short = (value: string) => `${date(value).getMonth() + 1}/${date(value).getDate()}`;

export function calendarPeriod(range: CpapCalendarRange, reference = new Date()): CpapCalendarPeriod {
  return { range, anchor: key(reference) };
}

export function moveCalendarPeriod(period: CpapCalendarPeriod, steps: number): CpapCalendarPeriod {
  if (period.range === 'week') return { ...period, anchor: shift(period.anchor, steps * 7) };
  const anchor = date(period.anchor);
  const moved = period.range === 'month'
    ? new Date(anchor.getFullYear(), anchor.getMonth() + steps, 1, 12)
    : new Date(anchor.getFullYear() + steps, 0, 1, 12);
  return { ...period, anchor: key(moved) };
}

export function isFutureCalendarPeriod(period: CpapCalendarPeriod, today = new Date()) {
  return cpapCalendarBounds(period).start > key(today);
}

export function cpapCalendarBounds(period: CpapCalendarPeriod) {
  const anchor = date(period.anchor);
  if (period.range === 'week') { const start = monday(period.anchor); return { start, end: shift(start, 6) }; }
  if (period.range === 'month') return { start: key(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)), end: key(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12)) };
  return { start: `${anchor.getFullYear()}-01-01`, end: `${anchor.getFullYear()}-12-31` };
}

export function cpapCalendarLabel(period: CpapCalendarPeriod) {
  const { start, end } = cpapCalendarBounds(period);
  if (period.range === 'week') return `${date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return date(start).toLocaleDateString(undefined, period.range === 'month' ? { month: 'long', year: 'numeric' } : { year: 'numeric' });
}

export function cpapCalendarAxis(period: CpapCalendarPeriod): CpapCalendarTick[] {
  const { start, end } = cpapCalendarBounds(period);
  if (period.range === 'week') return Array.from({ length: 7 }, (_, index) => { const day = shift(start, index); return { key: day, label: short(day), start: day, end: day }; });
  if (period.range === 'year') return Array.from({ length: 12 }, (_, index) => {
    const year = date(start).getFullYear(); const first = key(new Date(year, index, 1, 12)); const last = key(new Date(year, index + 1, 0, 12));
    return { key: first.slice(0, 7), label: date(first).toLocaleDateString(undefined, { month: 'short' }), start: first, end: last };
  });
  const ticks: CpapCalendarTick[] = [];
  for (let first = start; first <= end;) {
    const last = shift(monday(first), 6);
    const clippedEnd = last < end ? last : end;
    ticks.push({ key: first, label: date(first).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), start: first, end: clippedEnd });
    first = shift(clippedEnd, 1);
  }
  return ticks;
}

/** Keep calendar buckets for aggregation, but only plot buckets with a recorded night. */
export function cpapCalendarDataAxis(period: CpapCalendarPeriod, readings: CpapReading[]): CpapCalendarTick[] {
  return cpapCalendarAxis(period).filter((tick) => readings.some((reading) => reading.sleepDate >= tick.start && reading.sleepDate <= tick.end));
}

export function cpapCalendarReadings(readings: CpapReading[], period: CpapCalendarPeriod, today = new Date()) {
  const { start, end } = cpapCalendarBounds(period);
  const cutoff = key(today) < end ? key(today) : end;
  return readings.filter((item) => item.sleepDate >= start && item.sleepDate <= cutoff);
}

export function cpapCalendarPoints(readings: CpapReading[], metric: CpapTrendMetric, axis: CpapCalendarTick[]): CpapTrendPoint[] {
  return axis.flatMap((tick) => {
    const entries = readings.filter((item) => item.sleepDate >= tick.start && item.sleepDate <= tick.end).sort((a, b) => a.sleepDate.localeCompare(b.sleepDate));
    if (!entries.length) return [];
    const value = entries.reduce((sum, entry) => sum + entry[metric], 0) / entries.length;
    return [{ id: tick.key, bucketKey: tick.key, startDate: tick.start, endDate: tick.end, label: tick.label, count: entries.length, value: Math.round(value * 10) / 10 }];
  });
}

export function cpapCalendarSettingSegments(axis: CpapCalendarTick[], settings: CpapTherapySettings[]) {
  return axis.flatMap((tick, index) => {
    const changes = settings.filter((item) => item.effectiveDate > tick.start && item.effectiveDate <= tick.end).map((item) => item.effectiveDate).sort();
    const boundaries = [tick.start, ...new Set(changes), shift(tick.end, 1)];
    const days = Math.round((date(shift(tick.end, 1)).getTime() - date(tick.start).getTime()) / 86_400_000);
    return boundaries.slice(0, -1).flatMap((start, segmentIndex) => {
      const setting = activeCpapSettings(settings, start);
      if (!setting) return [];
      const from = Math.round((date(start).getTime() - date(tick.start).getTime()) / 86_400_000) / days;
      const to = Math.round((date(boundaries[segmentIndex + 1]).getTime() - date(tick.start).getTime()) / 86_400_000) / days;
      return [{ index, start, end: shift(boundaries[segmentIndex + 1], -1), from, to, setting, changedWithinTick: changes.length > 0 }];
    });
  });
}
