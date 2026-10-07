import { WeightEntry } from '@/models/tracker';

export type LegacyWeightEntry = {
  date: string;
  weight: number;
  caloriesEaten?: number | null;
  estimatedBurn?: number | null;
  goal?: number | null;
  notes?: string;
};

export type WeightExport = {
  format: 'reclaim-weight-export';
  version: 1;
  exportedAt: string;
  unit: 'lb' | 'kg';
  entries: LegacyWeightEntry[];
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const optionalNumber = (value: unknown) => value == null || (typeof value === 'number' && Number.isFinite(value));

export function parseWeightExport(raw: string): WeightExport {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('This is not a Weight Tracker export.');
  const file = value as Partial<WeightExport>;
  if (file.format !== 'reclaim-weight-export' || file.version !== 1 || !Array.isArray(file.entries)) {
    throw new Error('Choose a file created by Weight Tracker’s “Export for Reclaim” button.');
  }
  if (file.unit !== 'lb' && file.unit !== 'kg') throw new Error('The weight unit is missing or unsupported.');
  for (const entry of file.entries) {
    if (!entry || !datePattern.test(entry.date) || typeof entry.weight !== 'number' || !Number.isFinite(entry.weight) || entry.weight <= 0 ||
      !optionalNumber(entry.caloriesEaten) || !optionalNumber(entry.estimatedBurn) || !optionalNumber(entry.goal)) {
      throw new Error('One or more weight entries are incomplete or invalid. Nothing was imported.');
    }
  }
  return file as WeightExport;
}

export function mergeWeightImport(existing: WeightEntry[], file: WeightExport) {
  const byDate = new Map(existing.map((entry) => [entry.date, entry]));
  let added = 0; let duplicates = 0;
  for (const item of file.entries) {
    if (byDate.has(item.date)) { duplicates += 1; continue; }
    byDate.set(item.date, {
      ...item,
      id: `weight-${item.date}`,
      unit: file.unit,
      recordedAt: file.exportedAt,
    });
    added += 1;
  }
  return { entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), added, duplicates };
}

export function upsertWeightEntry(entries: WeightEntry[], input: Omit<WeightEntry, 'id' | 'recordedAt'>, now = new Date().toISOString()) {
  const next: WeightEntry = { ...input, id: `weight-${input.date}`, recordedAt: now };
  return [...entries.filter((entry) => entry.date !== input.date), next].sort((a, b) => a.date.localeCompare(b.date));
}

/** Present history from past to present so Next moves forward in time. */
export function weightHistoryChronological(entries: WeightEntry[]) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

export function weightStats(entries: WeightEntry[]) {
  if (!entries.length) return null;
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const first = ordered[0]; const current = ordered.at(-1)!;
  const recent = weightWindow(ordered, current.date, 7);
  return {
    start: first.weight,
    current: current.weight,
    latestDate: current.date,
    averageReadings: recent.length,
    lowest: Math.min(...ordered.map((entry) => entry.weight)),
    change: current.weight - first.weight,
    sevenDayAverage: recent.reduce((sum, entry) => sum + entry.weight, 0) / recent.length,
  };
}

export function weightTrendSeries(entries: WeightEntry[]) {
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return ordered.map((entry, index) => {
    const window = weightWindow(ordered.slice(0, index + 1), entry.date, 7);
    return { entry, average: window.reduce((sum, item) => sum + item.weight, 0) / window.length };
  });
}

// Calendar arithmetic at local noon avoids DST and UTC date shifts.
export function weightWindow(entries: WeightEntry[], end: string, days: number) {
  const start = new Date(`${end}T12:00:00`);
  start.setDate(start.getDate() - days + 1);
  const cutoff = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return entries.filter((entry) => entry.date >= cutoff && entry.date <= end);
}

export function latestWeightGoal(entries: WeightEntry[]) {
  for (const entry of [...entries].sort((a, b) => b.date.localeCompare(a.date))) {
    if (typeof entry.goal === 'number') return entry.goal;
  }
  return undefined;
}
