import { CpapReading, CpapTherapySettings, CpapUsageGoal, TrackerState } from '@/models/tracker';

export type CpapReadingInput = Omit<CpapReading, 'id' | 'recordedAt'> & { id?: string };
export type CpapTherapySettingsInput = Omit<CpapTherapySettings, 'id' | 'recordedAt'> & { id?: string };
export type CpapTrendRange = '7D' | '30D' | '90D' | '6M' | '1Y' | 'ALL';
export type CpapTrendMetric = 'ahi' | 'cai' | 'usedMinutes' | 'averagePressure' | 'p95Pressure' | 'averageLeak' | 'p95Leak';
export type CpapTrendPoint = { id: string; bucketKey: string; startDate: string; endDate: string; label: string; count: number; value: number };
export type CpapTrendAxisTick = { key: string; label: string };
export type CpapUsageStreakState = 'empty' | 'no_data' | 'below_threshold' | 'building' | 'active';
export type CpapUsageStreakStats = {
  thresholdMinutes: number;
  current: number;
  longest: number;
  qualifyingNights: number;
  recordedNights: number;
  state: CpapUsageStreakState;
  referenceDate: string;
  latestRecordedDate?: string;
};

export const CPAP_USAGE_STREAK_MINUTES = 240;

export function cpapGoalForDate(goals: CpapUsageGoal[], date: string) {
  return [...goals].filter((goal) => goal.effectiveDate <= date).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
}

export function lastCompletedSleepDate(now: Date) {
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
}

export function cpapGoalProgress(goals: CpapUsageGoal[], readings: CpapReading[], now: Date) {
  if (!goals.length) return null;
  const lastNight = lastCompletedSleepDate(now);
  const today = localDateKey(now);
  // Some machines label the completed night with the wake-up date.
  const sleepDate = readings.some((item) => item.sleepDate === today) ? today : lastNight;
  const reading = [...readings].filter((item) => item.sleepDate === sleepDate).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  const firstGoal = [...goals].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0];
  // Earlier builds started a first goal the day after an existing night.
  const goal = cpapGoalForDate(goals, sleepDate) ?? (reading && firstGoal.effectiveDate === shiftDate(sleepDate, 1) ? firstGoal : undefined);
  return { sleepDate, target: goal?.minutes ?? null, usedMinutes: goal && reading ? reading.usedMinutes : null,
    reached: Boolean(goal && reading && reading.usedMinutes >= goal.minutes), pending: !goal || !reading };
}

export function setCpapUsageGoal(goals: CpapUsageGoal[], readings: CpapReading[], minutes: number, now: Date): CpapUsageGoal[] {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Enter a goal between 1 minute and 24 hours.');
  const today = localDateKey(now);
  const lastNight = lastCompletedSleepDate(now);
  const recentNight = [today, lastNight].find((date) => readings.some((reading) => reading.sleepDate === date));
  const effectiveDate = !goals.length && recentNight ? recentNight : readings.some((reading) => reading.sleepDate === today) ? shiftDate(today, 1) : today;
  return [...goals.filter((goal) => goal.effectiveDate !== effectiveDate), { effectiveDate, minutes }].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function cpapUsageDayCounts(readings: CpapReading[], range: CpapTrendRange, now = new Date()) {
  const today = localDateKey(now);
  const byDate = new Map<string, CpapReading>();
  readings.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.sleepDate) && item.sleepDate <= today).forEach((item) => {
    const previous = byDate.get(item.sleepDate);
    if (!previous || item.recordedAt >= previous.recordedAt) byDate.set(item.sleepDate, item);
  });
  const firstDate = [...byDate.keys()].sort()[0];
  if (!firstDate) return { underFourHours: 0, missed: 0, startDate: undefined, endDate: undefined };
  // An unrecorded current night is still in progress, so do not call it missed.
  const endDate = byDate.has(today) ? today : shiftDate(today, -1);
  const rangeStart = range === 'ALL' ? firstDate : range === '6M'
    ? localDateKey(new Date(now.getFullYear(), now.getMonth() - 5, 1, 12))
    : shiftDate(endDate, -(range === '7D' ? 7 : range === '30D' ? 30 : range === '90D' ? 90 : 365) + 1);
  const startDate = firstDate > rangeStart ? firstDate : rangeStart;
  let underFourHours = 0;
  let missed = 0;
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
    const minutes = byDate.get(date)?.usedMinutes;
    if (minutes === undefined || minutes === 0) missed += 1;
    else if (minutes < CPAP_USAGE_STREAK_MINUTES) underFourHours += 1;
  }
  return { underFourHours, missed, startDate, endDate };
}

type OcrFrame = { left: number; top: number; right: number; bottom: number };
export type CpapRecognition = { text: string; blocks: { lines: { text: string; frame: OcrFrame }[] }[] };
type ParsedMetric = keyof Pick<CpapReadingInput, 'usedMinutes' | 'averagePressure' | 'p95Pressure' | 'ahi' | 'cai' | 'averageLeak' | 'p95Leak'>;

const LABELS: Record<ParsedMetric, RegExp[]> = {
  usedMinutes: [/used?\s*time/i, /usage\s*time/i],
  averagePressure: [/avg\.?\s*(?:treat(?:ment)?\s*)?p(?:ressure)?/i, /average\s*pressure/i],
  p95Pressure: [/(?:p\s*9[5s]|9[5s]\s*%)(?!.*leak)/i],
  ahi: [/\bah[il1!]\b/i],
  cai: [/\bca[il1!]\b/i],
  averageLeak: [/avg\.?\s*leak/i, /average\s*leak/i],
  p95Leak: [/(?:p\s*9[5s]|9[5s]\s*%)\s*leak/i],
};

export function parseCpapText(text: string): Partial<CpapReadingInput> {
  const lines = text.split(/\r?\n/).map(cleanOcrText).filter(Boolean);
  const parsed: Partial<Record<ParsedMetric, number>> = {};
  (Object.keys(LABELS) as ParsedMetric[]).forEach((metric) => {
    const line = lines.find((candidate) => LABELS[metric].some((label) => label.test(candidate)));
    const label = line && LABELS[metric].find((candidate) => candidate.test(line));
    const value = line && label ? firstNumber(line.slice((line.match(label)?.index ?? 0) + (line.match(label)?.[0].length ?? 0))) : undefined;
    if (value !== undefined) parsed[metric] = value;
  });

  const whole = cleanOcrText(text);
  parsed.usedMinutes ??= unitValues(whole, /(-?\d+(?:[.,]\d+)?)\s*(?:min(?:utes?)?|mins?)\b/gi)[0];
  const pressures = unitValues(whole, /(-?\d+(?:[.,]\d+)?)\s*c[mn]?\s*h[2z₂]?o/gi);
  parsed.averagePressure ??= pressures[0]; parsed.p95Pressure ??= pressures[1];
  const leaks = unitValues(whole, /(-?\d+(?:[.,]\d+)?)\s*l\s*[/|]\s*min/gi);
  parsed.averageLeak ??= leaks[0]; parsed.p95Leak ??= leaks[1];
  const score = scoreFromTextLines(lines);
  return compact({ ...parsed, score });
}

export function parseCpapRecognition(recognition: CpapRecognition): Partial<CpapReadingInput> {
  const parsed = parseCpapText(recognition.text);
  const lines = recognition.blocks.flatMap((block) => block.lines).filter((line) => line.text.trim());
  const labelLines = new Set(lines.filter((line) => Object.values(LABELS).flat().some((label) => label.test(cleanOcrText(line.text)))));
  const used = new Set<number>();
  (Object.keys(LABELS) as ParsedMetric[]).forEach((metric) => {
    const labelLine = lines.find((line) => LABELS[metric].some((label) => label.test(cleanOcrText(line.text))));
    if (!labelLine) return;
    const sameLineValue = valueAfterKnownLabel(labelLine.text, LABELS[metric]);
    if (sameLineValue !== undefined) { parsed[metric] = sameLineValue; return; }
    const labelY = centerY(labelLine.frame); const labelHeight = Math.max(1, labelLine.frame.bottom - labelLine.frame.top);
    const candidates = lines.map((line, index) => ({ line, index, value: firstNumber(line.text), yDistance: Math.abs(centerY(line.frame) - labelY), rightPenalty: line.frame.left + 8 < labelLine.frame.right ? labelHeight * 4 : 0 })).filter((candidate) => !labelLines.has(candidate.line) && candidate.value !== undefined && !used.has(candidate.index) && candidate.yDistance <= labelHeight * 1.8).sort((a, b) => a.yDistance + a.rightPenalty - (b.yDistance + b.rightPenalty));
    const best = candidates[0]; if (best) { parsed[metric] = best.value; used.add(best.index); }
  });
  const pointsLine = lines.find((line) => /100\s*points?/i.test(cleanOcrText(line.text)));
  let score = parsed.score;
  if (pointsLine) {
    const pointsX = (pointsLine.frame.left + pointsLine.frame.right) / 2;
    const pointsTop = pointsLine.frame.top;
    score = lines.map((line) => ({ line, value: numericOnly(line.text), yDistance: pointsTop - line.frame.bottom, xDistance: Math.abs((line.frame.left + line.frame.right) / 2 - pointsX) })).filter((candidate) => candidate.line !== pointsLine && candidate.value !== undefined && candidate.value >= 0 && candidate.value <= 100 && candidate.yDistance >= -4 && candidate.yDistance < Math.max(120, pointsLine.frame.bottom - pointsLine.frame.top) * 4).sort((a, b) => a.yDistance + a.xDistance - (b.yDistance + b.xDistance))[0]?.value ?? score;
  }
  return compact({ ...parsed, score });
}

export function validateCpapReading(input: CpapReadingInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sleepDate) || !Number.isFinite(Date.parse(`${input.sleepDate}T12:00:00`))) return 'Enter a valid sleep date.';
  const values = [input.usedMinutes, input.averagePressure, input.p95Pressure, input.ahi, input.cai, input.averageLeak, input.p95Leak];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return 'Review every extracted value before saving.';
  if (input.usedMinutes > 1_440 || input.averagePressure > 40 || input.p95Pressure > 40 || input.ahi > 150 || input.cai > 150 || input.averageLeak > 300 || input.p95Leak > 300) return 'Double-check this reading before saving.';
  return undefined;
}

export function upsertCpapReading(readings: CpapReading[], input: CpapReadingInput, id: string, recordedAt = new Date().toISOString()) {
  const reading: CpapReading = { ...input, id: input.id ?? id, recordedAt, note: input.note?.trim() || undefined };
  return [...readings.filter((item) => item.id !== reading.id), reading].sort((a, b) => b.sleepDate.localeCompare(a.sleepDate));
}

export function removeCpapReading(readings: CpapReading[], id: string, confirmed: boolean) {
  return confirmed ? readings.filter((item) => item.id !== id) : readings;
}

export function validateCpapTherapySettings(input: CpapTherapySettingsInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) || !Number.isFinite(Date.parse(`${input.effectiveDate}T12:00:00`))) return 'Enter a valid effective date.';
  if (input.effectiveTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.effectiveTime)) return 'Enter a valid time or leave it blank.';
  if (!Number.isFinite(input.minPressure) || !Number.isFinite(input.maxPressure) || input.minPressure < 0 || input.maxPressure > 40) return 'Enter pressures between 0 and 40 cmH₂O.';
  if (input.minPressure > input.maxPressure) return 'Minimum pressure cannot be higher than maximum pressure.';
  if (input.rampStartPressure !== undefined && (!Number.isFinite(input.rampStartPressure) || input.rampStartPressure < 0 || input.rampStartPressure > 40)) return 'Enter a valid ramp start pressure.';
  if (input.rampMinutes !== undefined && (!Number.isInteger(input.rampMinutes) || input.rampMinutes < 0 || input.rampMinutes > 120)) return 'Enter ramp minutes from 0 to 120.';
  return undefined;
}

export function upsertCpapTherapySettings(settings: CpapTherapySettings[], input: CpapTherapySettingsInput, id: string, recordedAt = new Date().toISOString()) {
  const entry: CpapTherapySettings = {
    ...input,
    id: input.id ?? id,
    recordedAt: settings.find((item) => item.id === input.id)?.recordedAt ?? recordedAt,
    effectiveTime: input.effectiveTime || undefined,
    maskName: input.maskName?.trim() || undefined,
    exhalationRelief: input.exhalationRelief?.trim() || undefined,
    humidity: input.humidity?.trim() || undefined,
    heatedTubeTemperature: input.heatedTubeTemperature?.trim() || undefined,
    note: input.note?.trim() || undefined,
  };
  return [...settings.filter((item) => item.id !== entry.id), entry].sort(compareCpapSettings);
}

export function removeCpapTherapySettings(settings: CpapTherapySettings[], id: string, confirmed: boolean) {
  return confirmed ? settings.filter((item) => item.id !== id) : settings;
}

export function activeCpapSettings(settings: CpapTherapySettings[], sleepDate: string) {
  return [...settings].sort(compareCpapSettings).filter((item) => item.effectiveDate <= sleepDate).at(-1);
}

export function cpapSettingsId(now = Date.now(), random = Math.random()) { return `cpap-settings-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`; }

export type CpapSettingsPeriod = {
  setting: CpapTherapySettings;
  endDate?: string;
  readings: CpapReading[];
};

export function cpapSettingsPeriods(settings: CpapTherapySettings[], readings: CpapReading[]): CpapSettingsPeriod[] {
  const ordered = [...settings].sort(compareCpapSettings);
  return ordered.map((setting, index) => {
    const next = ordered[index + 1];
    return {
      setting,
      endDate: next ? shiftDate(next.effectiveDate, -1) : undefined,
      readings: readings.filter((reading) => reading.sleepDate >= setting.effectiveDate && (!next || reading.sleepDate < next.effectiveDate)).sort((a, b) => a.sleepDate.localeCompare(b.sleepDate)),
    };
  });
}

export function equalNightSettingsComparison(settings: CpapTherapySettings[], readings: CpapReading[], requestedNights: number) {
  const periods = cpapSettingsPeriods(settings, readings);
  if (periods.length < 2) return undefined;
  const before = periods.at(-2)!;
  const after = periods.at(-1)!;
  const count = Math.min(requestedNights, before.readings.length, after.readings.length);
  if (!count) return { before: before.setting, after: after.setting, count: 0, beforeReadings: [], afterReadings: [] };
  return {
    before: before.setting,
    after: after.setting,
    count,
    beforeReadings: before.readings.slice(-count),
    afterReadings: after.readings.slice(0, count),
  };
}

export function cpapSummary(readings: CpapReading[]) {
  if (!readings.length) return undefined;
  const average = (key: keyof Pick<CpapReading, 'usedMinutes' | 'ahi' | 'averageLeak' | 'p95Leak'>) => Math.round(readings.reduce((sum, item) => sum + item[key], 0) / readings.length * 10) / 10;
  return { count: readings.length, averageUsedMinutes: average('usedMinutes'), averageAhi: average('ahi'), averageLeak: average('averageLeak'), averageP95Leak: average('p95Leak') };
}

export function filterCpapReadings(readings: CpapReading[], range: CpapTrendRange, now = new Date()) {
  if (range === '6M') {
    const start = localDateKey(new Date(now.getFullYear(), now.getMonth() - 5, 1, 12));
    const end = localDateKey(now);
    return readings.filter((item) => item.sleepDate >= start && item.sleepDate <= end);
  }
  const days = range === '7D' ? 7 : range === '30D' ? 30 : range === '90D' ? 90 : range === '1Y' ? 365 : undefined;
  if (!days) return [...readings];
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (range === '7D') end.setDate(end.getDate() - 1);
  const start = new Date(end); start.setDate(start.getDate() - days + 1);
  return readings.filter((item) => Date.parse(`${item.sleepDate}T12:00:00`) >= start.getTime() && Date.parse(`${item.sleepDate}T12:00:00`) <= end.getTime());
}

export function cpapUsageStreakStats(readings: CpapReading[], now = new Date()): CpapUsageStreakStats {
  const today = localDateKey(now);
  const byDate = new Map<string, CpapReading>();
  readings
    .filter((reading) => /^\d{4}-\d{2}-\d{2}$/.test(reading.sleepDate) && reading.sleepDate <= today)
    .forEach((reading) => {
      const existing = byDate.get(reading.sleepDate);
      if (!existing || reading.recordedAt >= existing.recordedAt) byDate.set(reading.sleepDate, reading);
    });

  const referenceDate = byDate.has(today) ? today : shiftDate(today, -1);
  const orderedDates = [...byDate.keys()].filter((date) => date <= referenceDate).sort();
  const recordedNights = orderedDates.length;
  const qualifyingNights = orderedDates.filter((date) => byDate.get(date)!.usedMinutes >= CPAP_USAGE_STREAK_MINUTES).length;

  let longest = 0;
  let run = 0;
  let previousQualifyingDate: string | undefined;
  orderedDates.forEach((date) => {
    if (byDate.get(date)!.usedMinutes < CPAP_USAGE_STREAK_MINUTES) {
      run = 0;
      previousQualifyingDate = undefined;
      return;
    }
    run = previousQualifyingDate && daysBetween(previousQualifyingDate, date) === 1 ? run + 1 : 1;
    previousQualifyingDate = date;
    longest = Math.max(longest, run);
  });

  const latestRecordedDate = orderedDates.at(-1);
  if (!latestRecordedDate) {
    return { thresholdMinutes: CPAP_USAGE_STREAK_MINUTES, current: 0, longest: 0, qualifyingNights: 0, recordedNights: 0, state: 'empty', referenceDate };
  }

  let current = 0;
  let cursor = latestRecordedDate;
  while (byDate.get(cursor)?.usedMinutes !== undefined && byDate.get(cursor)!.usedMinutes >= CPAP_USAGE_STREAK_MINUTES) {
    current += 1;
    cursor = shiftDate(cursor, -1);
  }

  const state: CpapUsageStreakState = latestRecordedDate !== referenceDate
    ? 'no_data'
    : current === 0
      ? 'below_threshold'
      : current === 1
        ? 'building'
        : 'active';
  return { thresholdMinutes: CPAP_USAGE_STREAK_MINUTES, current, longest, qualifyingNights, recordedNights, state, referenceDate, latestRecordedDate };
}

export function cpapReadingId(now = Date.now(), random = Math.random()) { return `cpap-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`; }

export function formatCpapMetricValue(metric: CpapTrendMetric, value: number, suffix: string) {
  if (metric === 'usedMinutes') return `${Math.round(value)}m`;
  return `${Number.isInteger(value) ? value.toFixed(1) : Math.round(value * 10) / 10}${suffix}`;
}

export function cpapTrendDescription(range: CpapTrendRange, readings: CpapReading[]) {
  if (range === '7D') return 'Nightly values';
  if (range === '30D') return 'Weekly averages';
  if (range === 'ALL') return 'Yearly averages';
  return 'Monthly averages';
}

export function cpapTrendPoints(readings: CpapReading[], metric: CpapTrendMetric, range: CpapTrendRange): CpapTrendPoint[] {
  const mode = range === '7D' ? 'day' : range === '30D' ? 'week' : range === 'ALL' ? 'year' : 'month';
  const buckets = new Map<string, CpapReading[]>();
  [...readings].sort((a, b) => a.sleepDate.localeCompare(b.sleepDate)).forEach((reading) => {
    const key = trendBucketKey(reading.sleepDate, mode);
    buckets.set(key, [...(buckets.get(key) ?? []), reading]);
  });
  return [...buckets.entries()].map(([key, entries]) => {
    const startDate = entries[0].sleepDate;
    const endDate = entries[entries.length - 1].sleepDate;
    const value = entries.reduce((total, entry) => total + entry[metric], 0) / entries.length;
    return { id: `${mode}-${key}`, bucketKey: key, startDate, endDate, label: trendLabel(key, mode), count: entries.length, value: Math.round(value * 10) / 10 };
  });
}

export function cpapTrendAxis(range: CpapTrendRange, points: CpapTrendPoint[], now = new Date()): CpapTrendAxisTick[] {
  if (range === '7D') {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    end.setDate(end.getDate() - 1);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(end); date.setDate(end.getDate() - 6 + index);
      const key = localDateKey(date);
      return { key, label: trendLabel(key, 'day') };
    });
  }
  if (range === '1Y' || range === '6M') {
    const months = range === '6M' ? 6 : 12;
    return Array.from({ length: months }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - months + 1 + index, 1, 12);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: trendLabel(key, 'month') };
    });
  }
  return points.map((point) => ({ key: point.bucketKey, label: point.label }));
}

/** Spread labels across the entire axis without appending a crowded last tick. */
export function cpapAxisLabelIndices(length: number, range: CpapTrendRange): number[] {
  const count = Math.min(length, range === '7D' ? 7 : 6);
  if (count <= 0) return [];
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) => Math.round(index * (length - 1) / (count - 1)));
}

export function migrateCpapState(state: TrackerState): TrackerState {
  const cpapReadings = state.cpapReadings ?? [];
  return { ...state, cpapReadings, cpapTherapySettings: state.cpapTherapySettings ?? [], cpapUsageGoals: state.cpapUsageGoals ?? [] };
}

function compact<T extends object>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function cleanOcrText(value: string) { return value.replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim(); }
function firstNumber(value: string) { const repaired = value.replace(/\b[Oo](?=[.,]\d)/g, '0').replace(/\b[Iil](?=\d)/g, '1'); const match = repaired.match(/-?\d+(?:[.,]\d+)?/); return match ? Number(match[0].replace(',', '.')) : undefined; }
function unitValues(text: string, pattern: RegExp) { return [...text.matchAll(pattern)].map((match) => Number(match[1].replace(',', '.'))); }
function centerY(frame: OcrFrame) { return (frame.top + frame.bottom) / 2; }
function valueAfterKnownLabel(text: string, labels: RegExp[]) { const clean = cleanOcrText(text); const label = labels.find((candidate) => candidate.test(clean)); if (!label) return undefined; const match = clean.match(label); return firstNumber(clean.slice((match?.index ?? 0) + (match?.[0].length ?? 0))); }
function numericOnly(value: string) { const clean = value.trim().replace(/[Oo](?=[.,]\d)/g, '0'); return /^\d{1,3}(?:[.,]\d+)?$/.test(clean) ? Number(clean.replace(',', '.')) : undefined; }
function scoreFromTextLines(lines: string[]) { const pointsIndex = lines.findIndex((line) => /100\s*points?/i.test(line)); if (pointsIndex < 1) return undefined; for (let index = pointsIndex - 1; index >= Math.max(0, pointsIndex - 3); index -= 1) { const value = numericOnly(lines[index]); if (value !== undefined && value <= 100) return value; } return undefined; }
function trendBucketKey(date: string, mode: 'day' | 'week' | 'month' | 'year') {
  if (mode === 'day') return date;
  if (mode === 'month') return date.slice(0, 7);
  if (mode === 'year') return date.slice(0, 4);
  const parsed = new Date(`${date}T00:00:00Z`); const day = parsed.getUTCDay() || 7; parsed.setUTCDate(parsed.getUTCDate() - day + 1); return parsed.toISOString().slice(0, 10);
}
function trendLabel(key: string, mode: 'day' | 'week' | 'month' | 'year') {
  if (mode === 'year') return key;
  const date = new Date(`${mode === 'month' ? `${key}-01` : key}T12:00:00Z`);
  if (mode === 'month') return `${date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })} ’${String(date.getUTCFullYear()).slice(-2)}`;
  return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
}
function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
}
function compareCpapSettings(a: CpapTherapySettings, b: CpapTherapySettings) {
  return a.effectiveDate.localeCompare(b.effectiveDate) || (a.effectiveTime ?? '').localeCompare(b.effectiveTime ?? '') || a.recordedAt.localeCompare(b.recordedAt);
}
