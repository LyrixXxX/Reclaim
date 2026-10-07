export type RollingRange = '7D' | '30D' | '365D' | 'ALL';

export const rollingOptions: { value: RollingRange; label: string }[] = [
  { value: '7D', label: '7 day' }, { value: '30D', label: '30 day' },
  { value: '365D', label: '365 day' }, { value: 'ALL', label: 'All' },
];

export function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function shiftDate(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  return dateKey(new Date(year, month - 1, day + days, 12));
}

export function rollingBounds(range: RollingRange, offset = 0, now = new Date(), endShift = 0) {
  const today = dateKey(now);
  if (range === 'ALL') return { start: '', end: shiftDate(today, endShift), days: 0 };
  const days = range === '7D' ? 7 : range === '30D' ? 30 : 365;
  const end = shiftDate(today, endShift + Math.min(0, offset) * days);
  return { start: shiftDate(end, 1 - days), end, days };
}

export function rollingLabel(start: string, end: string) {
  const format = (key: string, year: boolean) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
  return start ? `${format(start, false)} – ${format(end, true)}` : `All history through ${format(end, true)}`;
}

export function datesInWindow(start: string, end: string) {
  const dates: string[] = [];
  for (let key = start; key <= end; key = shiftDate(key, 1)) dates.push(key);
  return dates;
}
