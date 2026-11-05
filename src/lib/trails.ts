/**
 * Trail search: OpenStreetMap trails and trailheads near a point (through the Overpass API), and
 * place search through Stadia Maps. Nothing here is stored except the trails a person saves.
 */

export type TrailKind = 'trailhead' | 'trail' | 'path';

export type TrailResult = {
  /** OpenStreetMap id, such as "node/123". Stable, so saved trails can be matched to results. */
  id: string;
  name: string;
  kind: TrailKind;
  latitude: number;
  longitude: number;
  /** Straight-line miles from the search point. */
  distanceMiles: number;
  lengthMiles?: number;
  difficulty?: string;
  surface?: string;
  operator?: string;
  address?: string;
};

export type SavedTrail = Omit<TrailResult, 'distanceMiles'> & { savedAt: string; favorite?: boolean };

export const TRAIL_RADII = [5, 10, 25, 50] as const;
export type TrailRadius = (typeof TRAIL_RADII)[number];

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TRAIL_USER_AGENT = 'Reclaim (Android app; https://lyrixstudios.com)';
const METERS_PER_MILE = 1609.344;
/** Named paths are numerous; past this radius only trailheads and hiking routes are searched. */
const PATH_SEARCH_LIMIT_MILES = 10;
export const MAX_TRAIL_RESULTS = 60;

export function milesBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h))) / METERS_PER_MILE;
}

/** The Overpass query: trailheads, named hiking routes and, for nearby searches, named paths. */
export function trailQuery(latitude: number, longitude: number, radiusMiles: number) {
  const around = `(around:${Math.round(radiusMiles * METERS_PER_MILE)},${latitude.toFixed(5)},${longitude.toFixed(5)})`;
  const paths = radiusMiles <= PATH_SEARCH_LIMIT_MILES ? `\n  way["highway"="path"]["name"]${around};\n  way["highway"="footway"]["name"]["sac_scale"]${around};` : '';
  return `[out:json][timeout:25];\n(\n  node["highway"="trailhead"]${around};\n  relation["route"="hiking"]["name"]${around};${paths}\n);\nout center tags 400;`;
}

type OverpassElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

const SAC_SCALE: Record<string, string> = {
  hiking: 'Easy', mountain_hiking: 'Moderate', demanding_mountain_hiking: 'Challenging',
  alpine_hiking: 'Difficult', demanding_alpine_hiking: 'Very difficult', difficult_alpine_hiking: 'Expert',
};

function lengthMiles(tags: Record<string, string>): number | undefined {
  const raw = tags.distance ?? tags.length;
  if (!raw) return undefined;
  const match = /^([\d.]+)\s*(mi|miles?|km|m)?$/i.exec(raw.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = (match[2] ?? 'km').toLowerCase();
  // OpenStreetMap's distance tag defaults to kilometers.
  const miles = unit.startsWith('mi') ? value : unit === 'm' ? value / METERS_PER_MILE : value * 1000 / METERS_PER_MILE;
  return Math.round(miles * 10) / 10;
}

function address(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const parts = [street, tags['addr:city'], tags['addr:state']].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

/**
 * Turns an Overpass response into a list of places, closest first. A trail split into many map
 * segments shows once, at its closest point. Unnamed trailheads are kept, since they still lead somewhere.
 */
export function parseTrails(response: unknown, origin: { latitude: number; longitude: number }, radiusMiles: number): TrailResult[] {
  const elements = (response as { elements?: OverpassElement[] })?.elements;
  if (!Array.isArray(elements)) return [];
  const byKey = new Map<string, TrailResult>();
  for (const element of elements) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
    const tags = element.tags ?? {};
    const kind: TrailKind = tags.highway === 'trailhead' ? 'trailhead' : element.type === 'relation' ? 'trail' : 'path';
    const name = tags.name?.trim() || (kind === 'trailhead' ? 'Trailhead' : '');
    if (!name) continue;
    const distanceMiles = Math.round(milesBetween(origin, { latitude, longitude }) * 10) / 10;
    if (distanceMiles > radiusMiles * 1.05) continue;
    const result: TrailResult = {
      id: `${element.type}/${element.id}`, name, kind, latitude, longitude, distanceMiles,
      lengthMiles: lengthMiles(tags),
      difficulty: SAC_SCALE[tags.sac_scale] ?? (tags.difficulty ? capitalize(tags.difficulty) : undefined),
      surface: tags.surface ? capitalize(tags.surface) : undefined,
      operator: tags.operator,
      address: address(tags),
    };
    // Same name and type means the same trail; unnamed trailheads stay separate.
    const key = name === 'Trailhead' ? result.id : `${kind === 'trailhead' ? 'trailhead' : 'trail'}:${name.toLowerCase()}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeTrail(existing, result) : result);
  }
  return [...byKey.values()].sort((a, b) => a.distanceMiles - b.distanceMiles || a.name.localeCompare(b.name)).slice(0, MAX_TRAIL_RESULTS);
}

/**
 * One trail from several map pieces: the nearest piece gives the location, a hiking route's id is
 * kept (so saving stays stable between searches), and details come from whichever piece has them.
 */
function mergeTrail(a: TrailResult, b: TrailResult): TrailResult {
  const nearer = b.distanceMiles < a.distanceMiles ? b : a;
  const route = [a, b].find((item) => item.kind === 'trail');
  return {
    ...nearer,
    id: route?.id ?? (a.id < b.id ? a.id : b.id),
    kind: route ? 'trail' : nearer.kind,
    lengthMiles: route?.lengthMiles ?? a.lengthMiles ?? b.lengthMiles,
    difficulty: a.difficulty ?? b.difficulty,
    surface: nearer.surface ?? a.surface ?? b.surface,
    operator: a.operator ?? b.operator,
    address: a.address ?? b.address,
  };
}

export async function searchTrails(latitude: number, longitude: number, radiusMiles: number, request: typeof fetch = fetch): Promise<TrailResult[]> {
  const response = await request(OVERPASS_URL, {
    method: 'POST',
    // Overpass rejects requests without an identifying User-Agent (Android's default gets HTTP 406).
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': TRAIL_USER_AGENT },
    body: `data=${encodeURIComponent(trailQuery(latitude, longitude, radiusMiles))}`,
  });
  if (response.status === 429 || response.status === 504) throw new Error('The trail service is busy right now. Try again in a minute.');
  if (!response.ok) throw new Error(`Trails couldn’t be loaded (${response.status}). Try again in a minute.`);
  return parseTrails(await response.json(), { latitude, longitude }, radiusMiles);
}

export type PlaceResult = { label: string; latitude: number; longitude: number };

/** Finds a town, park or ZIP code with Stadia Maps. */
export async function searchPlace(text: string, key: string, request: typeof fetch = fetch): Promise<PlaceResult | null> {
  const query = text.trim();
  if (!query) return null;
  if (!key) throw new Error('Place search isn’t available in this build. Use your location instead.');
  const response = await request(`https://api.stadiamaps.com/geocoding/v1/search?text=${encodeURIComponent(query)}&size=1&api_key=${encodeURIComponent(key)}`);
  if (!response.ok) throw new Error(`Place search failed (${response.status}). Try again.`);
  const data = await response.json() as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { label?: string; name?: string } }[] };
  const feature = data.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!feature || !coordinates) return null;
  return { label: feature.properties?.label ?? feature.properties?.name ?? query, longitude: coordinates[0], latitude: coordinates[1] };
}

/** Opens Google Maps (the app when installed) with directions to the trail. */
export function directionsUrl(trail: Pick<TrailResult, 'latitude' | 'longitude'>) {
  return `https://www.google.com/maps/dir/?api=1&destination=${trail.latitude.toFixed(6)},${trail.longitude.toFixed(6)}`;
}

export function trailKindLabel(kind: TrailKind) {
  return kind === 'trailhead' ? 'Trailhead' : kind === 'trail' ? 'Hiking trail' : 'Trail';
}

export function saveTrail(saved: readonly SavedTrail[], trail: TrailResult, now = new Date()): SavedTrail[] {
  if (saved.some((item) => item.id === trail.id)) return [...saved];
  const { distanceMiles: _distance, ...rest } = trail;
  return [...saved, { ...rest, savedAt: now.toISOString() }];
}

export function removeSavedTrail(saved: readonly SavedTrail[], id: string): SavedTrail[] {
  return saved.filter((item) => item.id !== id);
}

/** Favoriting a trail that isn't saved yet saves it too. */
export function toggleFavoriteTrail(saved: readonly SavedTrail[], trail: TrailResult | SavedTrail, now = new Date()): SavedTrail[] {
  if (!saved.some((item) => item.id === trail.id)) {
    const { distanceMiles: _distance, savedAt: _savedAt, favorite: _favorite, ...rest } = trail as TrailResult & Partial<SavedTrail>;
    return [...saved, { ...rest, savedAt: now.toISOString(), favorite: true }];
  }
  return saved.map((item) => item.id === trail.id ? { ...item, favorite: !item.favorite || undefined } : item);
}

/** Favorites first, then the most recently saved. */
export function sortSavedTrails(saved: readonly SavedTrail[]): SavedTrail[] {
  return [...saved].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || b.savedAt.localeCompare(a.savedAt));
}

export function isSavedTrail(value: unknown): value is SavedTrail {
  const item = value as SavedTrail;
  return !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string'
    && ['trailhead', 'trail', 'path'].includes(item.kind) && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    && Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180 && typeof item.savedAt === 'string';
}
