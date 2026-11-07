export type RouteForecast = {
  status: 'ready';
  area: string;
  temperature: number;
  unit: 'F' | 'C';
  condition: string;
  symbol: string;
  startTime: string;
  endTime: string;
} | { status: 'unavailable' } | { status: 'error' };

const cache = new Map<string, { expires: number; value: RouteForecast }>();
const pending = new Map<string, Promise<RouteForecast>>();
const HEADERS = { Accept: 'application/geo+json', 'User-Agent': 'Reclaim/1.0 (Reclaim.LyrixStudios@gmail.com)' };

// Each symbol ends in U+FE0F so Android draws the color emoji, not a thin text outline.
function symbolFor(condition: string): string {
  const value = condition.toLowerCase();
  if (/thunder|storm/.test(value)) return '⛈️';
  if (/snow|sleet|ice|flurr/.test(value)) return '❄️';
  if (/rain|shower|drizzle/.test(value)) return '🌧';
  if (/cloud|overcast|fog/.test(value)) return '☁️';
  return '☀️';
}

/** Fixes arrive every few seconds, so one this old means the signal has really gone. */
export const GPS_FIX_STALE_MS = 30_000;

export function gpsAccuracyBars(accuracy: number | null | undefined): number {
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy < 0) return 0;
  if (accuracy <= 10) return 4;
  if (accuracy <= 20) return 3;
  if (accuracy <= 35) return 2;
  if (accuracy <= 50) return 1;
  return 0;
}

function possiblyInNwsArea(latitude: number, longitude: number): boolean {
  return (latitude >= 24 && latitude <= 50 && longitude >= -125 && longitude <= -66)
    || (latitude >= 51 && latitude <= 72 && longitude >= -180 && longitude <= -129)
    || (latitude >= 18 && latitude <= 23 && longitude >= -161 && longitude <= -154)
    || (latitude >= 17 && latitude <= 19 && longitude >= -68 && longitude <= -64)
    || (latitude >= 13 && latitude <= 15 && longitude >= 144 && longitude <= 146);
}

export async function getRouteForecast(latitude: number, longitude: number, now = Date.now(), request: typeof fetch = fetch): Promise<RouteForecast> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { status: 'unavailable' };
  if (!possiblyInNwsArea(latitude, longitude)) return { status: 'unavailable' };
  // A roughly 1 km bucket avoids a new request for every GPS fix.
  const lat = latitude.toFixed(2);
  const lon = longitude.toFixed(2);
  const key = `${lat},${lon}`;
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.value;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const task = (async (): Promise<RouteForecast> => {
    try {
      const point = await request(`https://api.weather.gov/points/${lat},${lon}`, { headers: HEADERS });
      if (point.status === 404) return { status: 'unavailable' };
      if (!point.ok) return { status: 'error' };
      const properties = (await point.json()).properties;
      const hourlyUrl = properties?.forecastHourly;
      if (typeof hourlyUrl !== 'string' || !hourlyUrl.startsWith('https://api.weather.gov/')) return { status: 'error' };
      const hourly = await request(hourlyUrl, { headers: HEADERS });
      if (!hourly.ok) return { status: 'error' };
      const periods = (await hourly.json()).properties?.periods;
      if (!Array.isArray(periods)) return { status: 'error' };
      const period = periods.find((item) => Date.parse(item.startTime) <= now && now < Date.parse(item.endTime))
        ?? periods.find((item) => Date.parse(item.startTime) > now);
      if (!period || !Number.isFinite(period.temperature) || typeof period.shortForecast !== 'string') return { status: 'error' };
      const place = properties.relativeLocation?.properties;
      const area = [place?.city, place?.state].filter((part) => typeof part === 'string' && part.trim()).join(', ') || 'Your area';
      return { status: 'ready', area, temperature: period.temperature, unit: period.temperatureUnit === 'C' ? 'C' : 'F', condition: period.shortForecast, symbol: symbolFor(period.shortForecast), startTime: period.startTime, endTime: period.endTime };
    } catch { return { status: 'error' }; }
  })();
  pending.set(key, task);
  try {
    const value = await task;
    const ttl = value.status === 'ready' ? 30 * 60_000 : value.status === 'unavailable' ? 60 * 60_000 : 5 * 60_000;
    const periodEnd = value.status === 'ready' ? Date.parse(value.endTime) : Infinity;
    cache.set(key, { value, expires: Number.isFinite(periodEnd) ? Math.min(now + ttl, periodEnd) : now + ttl });
    return value;
  } finally { pending.delete(key); }
}

export function clearRouteForecastCacheForTests() { cache.clear(); pending.clear(); }
