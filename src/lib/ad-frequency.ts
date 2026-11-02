import { localDateKey } from './progress';

export type AdFrequency = { day: string; shownAt: number[]; weightShownAt?: number };
export const AD_DAILY_LIMIT = 6;
export const AD_MIN_INTERVAL_MS = 15 * 60 * 1000;

export function canShowPostSaveAd(completion: 'meal' | 'route' | 'weight', history: AdFrequency, now = new Date()): boolean {
  if (completion === 'meal') return true;
  if (completion === 'weight' && history.day === localDateKey(now) && history.weightShownAt !== undefined) return false;
  return canShowCompletionAd(history, now);
}

export function shouldOfferWeightSaveAd(date: string, today: string, editing: boolean, existingDates: readonly string[]): boolean {
  return !editing && date === today && !existingDates.includes(date);
}

export function canShowCompletionAd(history: AdFrequency, now = new Date()): boolean {
  const shown = history.day === localDateKey(now) ? history.shownAt.filter((time) => Number.isFinite(time) && time <= now.getTime()) : [];
  return shown.length < AD_DAILY_LIMIT && (shown.length === 0 || now.getTime() - Math.max(...shown) >= AD_MIN_INTERVAL_MS);
}

export function recordCompletionAd(history: AdFrequency, now = new Date(), completion: 'meal' | 'route' | 'weight' = 'route'): AdFrequency {
  const day = localDateKey(now);
  return {
    day,
    shownAt: [...(history.day === day ? history.shownAt : []), now.getTime()],
    weightShownAt: completion === 'weight' ? now.getTime() : history.day === day ? history.weightShownAt : undefined,
  };
}
