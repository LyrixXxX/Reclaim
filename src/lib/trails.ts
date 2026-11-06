/**
 * Trail search: OpenStreetMap trails and trailheads near a point (through the Overpass API), and
 * place search through Stadia Maps. Nothing here is stored except the trails a person saves.
 */

export type TrailKind = 'trailhead' | 'trail' | 'path' | 'waterfall';

export type TrailResult = {
  /** OpenStreetMap id, such as "node/123". Stable, so saved trails can be matched to results. */
  id: string;
  name: string;
  kind: TrailKind;
  latitude: number;
  longitude: number;
  /** Straight-line miles from the search point. */
  distanceMiles: number;
  /** Measured from map data, so it's shown as approximate. See trailLengthLabel. */
  lengthMiles?: number;
  climbFt?: number;
  difficulty?: string;
  difficultySource?: 'official' | 'osm' | 'estimated';
  /** Where to drive to, when the trail has a parking lot or trailhead nearby. */
  parking?: { latitude: number; longitude: number };
  /** The trail's shape: encoded polylines, space-separated. See decodeTrailPath. */
  path?: string;
  surface?: string;
  operator?: string;
  address?: string;
  /** Wikidata item, such as "Q5194226"; the source for a photo when there is one. */
  wikidata?: string;
  /** Wikipedia article, such as "en:Cumberland Trail". */
  wikipedia?: string;
};

export type SavedTrail = Omit<TrailResult, 'distanceMiles'> & { savedAt: string; favorite?: boolean };

export const TRAIL_RADII = [5, 10, 25, 50] as const;
export type TrailRadius = (typeof TRAIL_RADII)[number];

/** Public Overpass servers, tried in order when one is busy, down or slow. */
export const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;
/** Overpass only adds to Stadia's results, so it gets a short wait per server. */
const SERVER_TIMEOUT_MS = 12_000;
export const TRAIL_USER_AGENT = 'Reclaim (Android app; https://lyrixstudios.com)';
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
  return `[out:json][timeout:25];\n(\n  node["highway"="trailhead"]${around};\n  relation["route"="hiking"]["name"]${around};${paths}\n);\nout center tags 150;`;
}

type OverpassElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

// "hiking" is the lowest step of a mountaineering scale and gets put on most trails, hard ones too,
// so it doesn't mean Easy and isn't shown.
const SAC_SCALE: Record<string, string> = {
  mountain_hiking: 'Moderate', demanding_mountain_hiking: 'Challenging',
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
  const found: TrailResult[] = [];
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
      wikidata: /^Q\d+$/.test(tags.wikidata ?? '') ? tags.wikidata : undefined,
      wikipedia: /^[a-z-]{2,12}:.+/.test(tags.wikipedia ?? '') ? tags.wikipedia : undefined,
    };
    found.push(result);
  }
  return combineTrails([found]);
}

/** Same name and type means the same trail; unnamed trailheads stay separate. */
function trailKey(trail: TrailResult) {
  if (trail.name === 'Trailhead') return trail.id;
  const group = trail.kind === 'path' ? 'trail' : trail.kind;
  return `${group}:${trail.name.toLowerCase().replace(/\s+/g, ' ')}`;
}

/** Joins result lists from different sources: one entry per place, closest first. */
export function combineTrails(lists: readonly (readonly TrailResult[])[]): TrailResult[] {
  const byKey = new Map<string, TrailResult>();
  const keyById = new Map<string, string>();
  for (const trail of lists.flat()) {
    const key = keyById.get(trail.id) ?? trailKey(trail);
    const existing = byKey.get(key);
    const merged = existing ? mergeTrail(existing, trail) : trail;
    byKey.set(key, merged);
    keyById.set(trail.id, key);
    keyById.set(merged.id, key);
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
    climbFt: a.climbFt ?? b.climbFt,
    difficulty: a.difficulty ?? b.difficulty,
    difficultySource: a.difficulty ? a.difficultySource : b.difficultySource,
    parking: a.parking ?? b.parking,
    path: a.path ?? b.path,
    surface: nearer.surface ?? a.surface ?? b.surface,
    operator: a.operator ?? b.operator,
    address: a.address ?? b.address,
    wikidata: route?.wikidata ?? a.wikidata ?? b.wikidata,
    wikipedia: route?.wikipedia ?? a.wikipedia ?? b.wikipedia,
  };
}

/**
 * Asks each Overpass server in turn. A busy (429), failing (5xx), slow or unreachable server moves on
 * to the next; any other error is the search's fault and stops right away.
 */
export async function searchTrails(latitude: number, longitude: number, radiusMiles: number, request: typeof fetch = fetch, servers: readonly string[] = OVERPASS_SERVERS): Promise<TrailResult[]> {
  const body = `data=${encodeURIComponent(trailQuery(latitude, longitude, radiusMiles))}`;
  for (const server of servers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
    try {
      const response = await request(server, {
        method: 'POST',
        // Overpass rejects requests without an identifying User-Agent (Android's default gets HTTP 406).
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': TRAIL_USER_AGENT },
        body, signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) continue;
      if (!response.ok) throw new Error(`Trails couldn’t be loaded (${response.status}). Try again in a minute.`);
      return parseTrails(await response.json(), { latitude, longitude }, radiusMiles);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Trails couldn’t be loaded')) throw error;
      // Timeouts and network errors: try the next server.
    } finally { clearTimeout(timer); }
  }
  throw new Error('The trail service is busy right now. Try again in a minute.');
}

type StadiaFeature = { geometry?: { coordinates?: [number, number] }; properties?: { id?: string; name?: string; source?: string; layer?: string; locality?: string; county?: string; region_a?: string } };

/** Stadia searches run for these words; their results are sorted into trailheads, trails and waterfalls. */
const STADIA_TRAIL_QUERIES = ['trailhead', 'trail', 'falls'] as const;
const NOT_A_HIKE = /\b(kiosk|campsite|campground|conference|parking|restroom|toilet|shelter|bridge|store|shop|church|school|road|street|drive|lane|court|circle)\b/i;

/** Turns Stadia place results into trails. Only OpenStreetMap places are kept, so ids match map data and saved trails. */
export function parseStadiaTrails(responses: readonly unknown[], origin: { latitude: number; longitude: number }, radiusMiles: number): TrailResult[] {
  const found: TrailResult[] = [];
  for (const response of responses) {
    for (const feature of ((response as { features?: StadiaFeature[] })?.features ?? [])) {
      const props = feature.properties ?? {};
      const coordinates = feature.geometry?.coordinates;
      const name = props.name?.trim();
      if (!name || !coordinates || props.source !== 'openstreetmap' || props.layer !== 'venue' || !props.id) continue;
      const isTrailhead = /trail ?head/i.test(name);
      const isWaterfall = !isTrailhead && /\b(falls|waterfall)\b/i.test(name);
      const isTrail = !isTrailhead && !isWaterfall && /\btrails?\b/i.test(name);
      if ((!isTrailhead && !isWaterfall && !isTrail) || NOT_A_HIKE.test(name)) continue;
      const [longitude, latitude] = coordinates;
      const distanceMiles = Math.round(milesBetween(origin, { latitude, longitude }) * 10) / 10;
      if (distanceMiles > radiusMiles * 1.05) continue;
      found.push({
        id: props.id, name, kind: isTrailhead ? 'trailhead' : isWaterfall ? 'waterfall' : 'trail', latitude, longitude, distanceMiles,
        address: [props.locality ?? props.county, props.region_a].filter(Boolean).join(', ') || undefined,
      });
    }
  }
  return combineTrails([found]);
}

/** Trailheads, named trails and waterfalls near a point, from Stadia. Fast, so it's shown first. */
export async function searchStadiaTrails(latitude: number, longitude: number, radiusMiles: number, key: string, request: typeof fetch = fetch): Promise<TrailResult[]> {
  if (!key) return [];
  const radiusKm = Math.round(radiusMiles * 1.609344);
  const responses = await Promise.all(STADIA_TRAIL_QUERIES.map(async (text) => {
    const url = `https://api.stadiamaps.com/geocoding/v1/search?text=${encodeURIComponent(text)}&layers=venue&boundary.circle.lat=${latitude.toFixed(5)}&boundary.circle.lon=${longitude.toFixed(5)}&boundary.circle.radius=${radiusKm}&size=25&api_key=${encodeURIComponent(key)}`;
    try {
      const response = await request(url);
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }));
  return parseStadiaTrails(responses, { latitude, longitude }, radiusMiles);
}

export type TrailPhoto = { url: string; width?: number; height?: number; credit: string; license?: string; sourceUrl: string };

const json = async (request: typeof fetch, url: string) => {
  const response = await request(url, { headers: { Accept: 'application/json', 'User-Agent': TRAIL_USER_AGENT } });
  return response.ok ? response.json() : null;
};

/** Plain text from Commons' HTML metadata, such as an author link. */
export function plainText(html: string | undefined) {
  return (html ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * A freely licensed photo for a trail, when its map entry links to Wikidata or Wikipedia.
 * Only Wikimedia Commons files are used, since those can be reused with credit. Most trails have none.
 */
export async function trailPhoto(trail: Pick<TrailResult, 'wikidata' | 'wikipedia'>, request: typeof fetch = fetch): Promise<TrailPhoto | null> {
  let file: string | undefined;
  if (trail.wikidata) {
    const data = await json(request, `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(trail.wikidata)}.json`);
    file = data?.entities?.[trail.wikidata]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  }
  if (!file && trail.wikipedia) {
    const [lang, ...rest] = trail.wikipedia.split(':');
    const data = await json(request, `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&titles=${encodeURIComponent(rest.join(':'))}`);
    const pages = Object.values(data?.query?.pages ?? {}) as { pageimage?: string }[];
    file = pages[0]?.pageimage;
  }
  if (!file) return null;
  const data = await json(request, `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=${encodeURIComponent(`File:${file}`)}`);
  const page = (Object.values(data?.query?.pages ?? {}) as (CommonsPage & { missing?: string })[])[0];
  return commonsPhoto(page && !('missing' in page) ? page.imageinfo?.[0] : undefined);
}

/** Words of a name that a photo's title should contain: "CT - Ozone Falls Trail" looks for "ozone falls". */
export function photoSearchName(name: string) {
  return name.replace(/^CT\s*[-_]\s*/i, '').replace(/\b(trail ?head|trail|loop|connector|spur)s?\b/gi, ' ').replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

const PHOTO_MAX_MILES = 5;

type CommonsPage = {
  index?: number; title?: string; coordinates?: { lat: number; lon: number }[];
  imageinfo?: { thumburl?: string; thumbwidth?: number; thumbheight?: number; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
};

function commonsPhoto(info: NonNullable<CommonsPage['imageinfo']>[number] | undefined): TrailPhoto | null {
  if (!info?.thumburl || !info.descriptionurl) return null;
  const meta = info.extmetadata ?? {};
  return {
    url: info.thumburl, width: info.thumbwidth, height: info.thumbheight,
    credit: plainText(meta.Artist?.value) || 'Wikimedia Commons',
    license: plainText(meta.LicenseShortName?.value) || undefined,
    sourceUrl: info.descriptionurl,
  };
}

/**
 * A freely licensed photo found by name, for the many trails with no link to one. A wrong photo is
 * worse than none, and names repeat ("Black Mountain" is also a town in North Carolina), so a file
 * must be geotagged near the trail and have the whole name in its title. Names of one word are too
 * common to trust.
 */
export async function nearbyTrailPhoto(trail: Pick<TrailResult, 'name' | 'latitude' | 'longitude'>, request: typeof fetch = fetch): Promise<TrailPhoto | null> {
  const name = photoSearchName(trail.name);
  const words = name.toLowerCase().split(' ').filter(Boolean);
  if (words.length < 2) return null;
  const data = await json(request, `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(`"${name}" filetype:bitmap`)}&prop=coordinates|imageinfo&iiprop=url|extmetadata&iiurlwidth=800&colimit=max`);
  const pages = (Object.values(data?.query?.pages ?? {}) as CommonsPage[]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const page of pages) {
    const point = page.coordinates?.[0];
    if (!point || milesBetween(trail, { latitude: point.lat, longitude: point.lon }) > PHOTO_MAX_MILES) continue;
    const title = (page.title ?? '').toLowerCase().replace(/[-_]+/g, ' ');
    if (!words.every((word) => title.includes(word))) continue;
    const photo = commonsPhoto(page.imageinfo?.[0]);
    if (photo) return photo;
  }
  return null;
}

/** Trail lengths come from map data and can differ from signs, so they're always "about". */
export function trailLengthLabel(miles: number | undefined) {
  if (!miles) return undefined;
  const shown = miles >= 100 ? Math.round(miles).toLocaleString('en-US') : String(Math.round(miles * 10) / 10);
  return `about ${shown} mi`;
}

export function trailDifficultyLabel(trail: Pick<TrailResult, 'difficulty' | 'difficultySource'>) {
  if (!trail.difficulty) return undefined;
  return trail.difficultySource === 'estimated' ? `${trail.difficulty} (estimated)` : trail.difficulty;
}

/** The second line of a list row: only what's known, with no blanks. */
export function trailRowDetails(trail: Pick<TrailResult, 'kind' | 'lengthMiles' | 'difficulty' | 'difficultySource'>, milesAway: number | undefined) {
  const length = trailLengthLabel(trail.lengthMiles);
  return [
    trail.kind === 'trailhead' || trail.kind === 'waterfall' ? trailKindLabel(trail.kind) : undefined,
    milesAway !== undefined ? `${milesAway} mi away` : undefined,
    length ? `${length} long` : undefined,
    trailDifficultyLabel(trail),
  ].filter(Boolean).join(' · ');
}

/** Each piece of a trail as a list of [longitude, latitude] points. */
export function decodeTrailPath(path: string | undefined): [number, number][][] {
  const lines: [number, number][][] = [];
  for (const piece of (path ?? '').split(' ')) {
    let index = 0;
    let latitude = 0;
    let longitude = 0;
    const next = () => {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = piece.charCodeAt(index) - 63;
        index += 1;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < piece.length);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    const line: [number, number][] = [];
    while (index < piece.length) {
      latitude += next();
      longitude += next();
      line.push([longitude / 1e5, latitude / 1e5]);
    }
    if (line.length > 1) lines.push(line);
  }
  return lines;
}

/** Miles to the nearest point of a trail when its shape is known, or else to its spot on the map. */
export function milesToPlace(origin: { latitude: number; longitude: number }, place: Pick<TrailResult, 'latitude' | 'longitude' | 'path'>) {
  let nearest = milesBetween(origin, place);
  for (const line of decodeTrailPath(place.path)) {
    for (const [longitude, latitude] of line) nearest = Math.min(nearest, milesBetween(origin, { latitude, longitude }));
  }
  return Math.round(nearest * 10) / 10;
}

export type TrailDatabaseResponse = { trails: TrailResult[]; coverage: 'full' | 'partial' | 'none' };

/** Checks a trail database response. Anything unexpected is treated as no answer. */
export function parseTrailDatabase(response: unknown): TrailDatabaseResponse | null {
  const body = response as Partial<TrailDatabaseResponse> | null;
  if (!body || !Array.isArray(body.trails) || !['full', 'partial', 'none'].includes(body.coverage as string)) return null;
  const trails = body.trails.filter((trail) => !!trail && typeof trail.id === 'string' && typeof trail.name === 'string'
    && ['trailhead', 'trail', 'path', 'waterfall'].includes(trail.kind) && Number.isFinite(trail.latitude) && Number.isFinite(trail.longitude) && Number.isFinite(trail.distanceMiles));
  return { trails, coverage: body.coverage as TrailDatabaseResponse['coverage'] };
}

/**
 * The saved copy of a place. Ids can change when a place comes from a different source, so the
 * same name close by counts too; otherwise a saved trail would look unsaved in new results.
 */
export function findSavedTrail(saved: readonly SavedTrail[], place: Pick<TrailResult, 'id' | 'name' | 'latitude' | 'longitude'>) {
  const name = place.name.toLowerCase();
  return saved.find((item) => item.id === place.id) ?? saved.find((item) => item.name.toLowerCase() === name && milesBetween(item, place) <= 1);
}

export type PlaceResult = { label: string; latitude: number; longitude: number };

/**
 * Finds a town, park or ZIP code with Stadia Maps. `near` makes close matches win: without it,
 * "Ozone Falls" finds a place in Arkansas rather than the one in Tennessee.
 */
export async function searchPlace(text: string, key: string, request: typeof fetch = fetch, near?: { latitude: number; longitude: number }): Promise<PlaceResult | null> {
  const query = text.trim();
  if (!query) return null;
  if (!key) throw new Error('Place search isn’t available in this build. Use your location instead.');
  const response = await request(`https://api.stadiamaps.com/geocoding/v1/search?text=${encodeURIComponent(query)}&size=1${near ? `&focus.point.lat=${near.latitude.toFixed(2)}&focus.point.lon=${near.longitude.toFixed(2)}` : ''}&api_key=${encodeURIComponent(key)}`);
  if (!response.ok) throw new Error(`Place search failed (${response.status}). Try again.`);
  const data = await response.json() as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { label?: string; name?: string } }[] };
  const feature = data.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!feature || !coordinates) return null;
  return { label: feature.properties?.label ?? feature.properties?.name ?? query, longitude: coordinates[0], latitude: coordinates[1] };
}

/** Opens Google Maps (the app when installed) with directions to the parking spot, or else the trail. */
export function directionsUrl(trail: Pick<TrailResult, 'latitude' | 'longitude' | 'parking'>) {
  const { latitude, longitude } = trail.parking ?? trail;
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

export function trailKindLabel(kind: TrailKind) {
  return kind === 'trailhead' ? 'Trailhead' : kind === 'trail' ? 'Hiking trail' : kind === 'waterfall' ? 'Waterfall' : 'Trail';
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
    && ['trailhead', 'trail', 'path', 'waterfall'].includes(item.kind) && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    && Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180 && typeof item.savedAt === 'string';
}
