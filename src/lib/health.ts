import { HealthReading } from '@/models/tracker';

export type HealthReadingInput = Omit<HealthReading, 'id' | 'type' | 'recordedAt'> & { id?: string };
export type HealthRange = '7D' | '30D' | 'ALL' | 'CUSTOM';

export function validateHealthReading(input: Pick<HealthReading, 'systolic' | 'diastolic' | 'pulse' | 'measuredAt'>) {
  if (![input.systolic, input.diastolic, input.pulse].every(Number.isInteger)) return 'Enter whole numbers for all three values.';
  if (!input.measuredAt || !Number.isFinite(Date.parse(input.measuredAt))) return 'Enter a valid date and time.';
  if (input.systolic < 40 || input.systolic > 300 || input.diastolic < 25 || input.diastolic > 200 || input.pulse < 20 || input.pulse > 250) {
    return 'Double-check this reading before saving.';
  }
  return undefined;
}

export function upsertHealthReading(readings: HealthReading[], input: HealthReadingInput, id: string, recordedAt = new Date().toISOString()) {
  const reading: HealthReading = { ...input, id: input.id ?? id, type: 'bloodPressure', recordedAt, note: input.note?.trim() || undefined };
  return [...readings.filter((item) => item.id !== reading.id), reading].sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
}

export function removeHealthReading(readings: HealthReading[], id: string, confirmed: boolean) {
  return confirmed ? readings.filter((item) => item.id !== id) : readings;
}

export function filterHealthReadings(readings: HealthReading[], range: HealthRange, now = new Date(), customStart?: string, customEnd?: string) {
  const end = range === 'CUSTOM' && customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : now.getTime();
  const start = range === 'ALL' ? -Infinity : range === 'CUSTOM' && customStart
    ? new Date(`${customStart}T00:00:00`).getTime()
    : end - (range === '7D' ? 7 : 30) * 86_400_000;
  return readings.filter((item) => { const time = Date.parse(item.measuredAt); return time >= start && time <= end; });
}

export function healthSummary(readings: HealthReading[]) {
  if (!readings.length) return undefined;
  const systolic = readings.map((item) => item.systolic);
  const diastolic = readings.map((item) => item.diastolic);
  const pulse = readings.map((item) => item.pulse);
  const average = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
  return {
    count: readings.length,
    averageSystolic: average(systolic), averageDiastolic: average(diastolic), averagePulse: average(pulse),
    lowestSystolic: Math.min(...systolic), highestSystolic: Math.max(...systolic),
    lowestDiastolic: Math.min(...diastolic), highestDiastolic: Math.max(...diastolic),
    lowestPulse: Math.min(...pulse), highestPulse: Math.max(...pulse),
  };
}

export function healthReadingId(now = Date.now(), random = Math.random()) {
  return `health-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`;
}

export function localDateTimeParts(timestamp = new Date().toISOString()) {
  const date = new Date(timestamp);
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}
