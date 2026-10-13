import { localDateKey } from './progress';

export type AdFrequency = { day: string; shownAt: number[] };
export const AD_DAILY_LIMIT = 2;
export const AD_MIN_INTERVAL_MS = 20 * 60 * 1000;

export function canShowCompletionAd(history: AdFrequency, now = new Date()): boolean {
  const shown = history.day === localDateKey(now) ? history.shownAt.filter((time) => Number.isFinite(time) && time <= now.getTime()) : [];
  return shown.length < AD_DAILY_LIMIT && (shown.length === 0 || now.getTime() - Math.max(...shown) >= AD_MIN_INTERVAL_MS);
}

export function recordCompletionAd(history: AdFrequency, now = new Date()): AdFrequency {
  return { day: localDateKey(now), shownAt: [...(history.day === localDateKey(now) ? history.shownAt : []), now.getTime()] };
}
