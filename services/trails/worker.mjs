import { verifyPlayIntegrity } from '../nutrition-ai/play-integrity.mjs';

const EARTH_RADIUS_MILES = 3958.76;
const NUMBER = /^-?\d+(\.\d+)?$/;
const MAX_RADIUS_MILES = 50;
const MAX_TRAIL_RESULTS = 60; // Matches src/lib/trails.ts.
const TILES_PER_DEGREE = 10;
const D1_MAX_BOUND_PARAMETERS = 100;
const ATTRIBUTION = '© OpenStreetMap contributors. Terrain data courtesy of the U.S. Geological Survey.';
const TILE_MARGIN_MILES = 1; // Tile edges curve at distance; never drop one the circle might touch.
const MAX_PATH_CHARACTERS = 8000; // Keeps a search small. Only the longest few long-distance routes go over.

// Matches src/lib/trails.ts. "hiking" is the lowest step of a mountaineering scale and gets put on
// most trails, hard ones too, so it doesn't mean Easy and isn't shown.
const SAC_SCALE = {
  mountain_hiking: 'Moderate', demanding_mountain_hiking: 'Challenging',
  alpine_hiking: 'Difficult', demanding_alpine_hiking: 'Very difficult', difficult_alpine_hiking: 'Expert',
};

const PAVED_SURFACE = new Set(['asphalt', 'concrete', 'paved', 'paving_stones']);

/**
 * The Shenandoah National Park rating: the square root of climb in feet x 2 x miles. Based on climb
 * and length alone, so it's always shown as an estimate. Unmeasured trails get no rating. The formula
 * counts distance heavily, which suits the woods but not a long paved greenway, so those stop at Moderate.
 */
export function estimateDifficulty(climbFt, miles, { name = '', surface } = {}) {
  if (climbFt == null || !miles) return undefined;
  const rating = Math.sqrt(climbFt * 2 * miles);
  if (rating < 50) return 'Easy';
  if (rating < 100 || PAVED_SURFACE.has(surface) || /\bgreenway\b/i.test(name)) return 'Moderate';
  if (rating < 150) return 'Moderately strenuous';
  if (rating < 200) return 'Strenuous';
  return 'Very strenuous';
}

export default { fetch: (request, env) => handleRequest(request, env) };

export async function handleRequest(request, env, fetcher = fetch) {
  const headers = { 'Content-Type': 'application/json', 'X-Request-Id': crypto.randomUUID(), 'Cache-Control': 'no-store' };
  try {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/v1/trails') return json({ error: 'Not found.' }, 404, headers);

    if (env.RATE_LIMITER) {
      const key = `reclaim-${(await sha256(request.headers.get('CF-Connecting-IP') || 'unknown')).slice(0, 32)}`;
      const outcome = await env.RATE_LIMITER.limit({ key });
      if (!outcome.success) return json({ error: 'Trail search is temporarily rate-limited. Try again shortly.' }, 429, headers);
    }

    // There is no shared-token route here: without the Play credentials, nothing is served.
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) return json({ error: 'Not authorized.' }, 401, headers);
    const integrityToken = request.headers.get('X-Play-Integrity');
    if (!integrityToken) return json({ error: 'A Google Play install is required for trail search.' }, 401, headers);
    let verified = false;
    // A GET has no body, so the signed request hash has to cover the query string instead.
    try { verified = await verifyPlayIntegrity(integrityToken, `${url.pathname}${url.search}`, '', env.GOOGLE_SERVICE_ACCOUNT_JSON, fetcher); }
    catch { return json({ error: 'Trail search verification is temporarily unavailable.' }, 503, headers); }
    if (!verified) return json({ error: 'Google Play could not verify this app install.' }, 403, headers);

    if (env.GLOBAL_RATE_LIMITER) {
      const outcome = await env.GLOBAL_RATE_LIMITER.limit({ key: 'all-trail-requests' });
      if (!outcome.success) return json({ error: 'Trail search is at capacity. Try again later.' }, 429, headers);
    }

    const search = parseSearch(url.searchParams);
    if (!search) return json({ error: 'Send lat, lon and a radius of up to 50 miles.' }, 400, headers);
    return json(await findTrails(env.DB, search), 200, headers);
  } catch {
    // Never echo details: an error could otherwise carry the search location into logs or the app.
    return json({ error: 'Trail search is temporarily unavailable.' }, 503, headers);
  }
}

export function parseSearch(params) {
  const [lat, lon, radius] = ['lat', 'lon', 'radius'].map((name) => {
    const value = params.get(name);
    return value !== null && NUMBER.test(value) ? Number(value) : NaN;
  });
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180) || !(radius > 0) || !(radius <= MAX_RADIUS_MILES)) return null;
  return { lat, lon, radius };
}

/** The tile holding a point. The import script must use this too, so rows land where searches look. */
export function tileId(lat, lon) {
  return `${latIndex(lat)}:${wrapLonIndex(lonIndex(lon))}`;
}

// The small offset stops float error such as 2.9 * 10 = 28.999... from shifting a point across a tile edge.
function latIndex(lat) { return Math.min(899, Math.floor(lat * TILES_PER_DEGREE + 1e-9)); }
function lonIndex(lon) { return Math.floor(lon * TILES_PER_DEGREE + 1e-9); }
function wrapLonIndex(index) { return ((index + 1800) % 3600 + 3600) % 3600 - 1800; }

export function milesBetween(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Every tile the search circle touches, including across the 180° meridian. */
export function tilesInRadius({ lat, lon, radius }) {
  const angular = radius / EARTH_RADIUS_MILES;
  const dLat = angular * 180 / Math.PI;
  const reachesPole = Math.abs(lat) + dLat >= 90;
  const dLon = reachesPole ? 180 : Math.asin(Math.min(1, Math.sin(angular) / Math.cos(lat * Math.PI / 180))) * 180 / Math.PI;
  const firstRow = Math.max(-900, latIndex(lat - dLat));
  const lastRow = latIndex(Math.min(90, lat + dLat));
  const firstColumn = reachesPole ? -1800 : lonIndex(lon - dLon);
  const lastColumn = reachesPole ? 1799 : lonIndex(lon + dLon);
  const found = new Set();
  for (let row = firstRow; row <= lastRow; row += 1) {
    const south = row / TILES_PER_DEGREE;
    const nearestLat = Math.min(Math.max(lat, south), south + 1 / TILES_PER_DEGREE);
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const west = column / TILES_PER_DEGREE;
      const east = west + 1 / TILES_PER_DEGREE;
      const inside = lon >= west && lon <= east;
      const distance = inside ? milesBetween({ lat, lon }, { lat: nearestLat, lon })
        : Math.min(milesBetween({ lat, lon }, { lat: nearestLat, lon: west }), milesBetween({ lat, lon }, { lat: nearestLat, lon: east }));
      if (distance <= radius + TILE_MARGIN_MILES) found.add(`${row}:${wrapLonIndex(column)}`);
    }
  }
  return [...found];
}

const TRAIL_COLUMNS = 'id, name, kind, path, length_mi, climb_ft, sac_scale, surface, parking_lat, parking_lon, access_points, center_lat, center_lon, wikidata, wikipedia';

export async function findTrails(db, search) {
  const tiles = tilesInRadius(search);
  // D1 allows 100 bound parameters per query, and a 50-mile search touches hundreds of tiles.
  const statements = [];
  for (let start = 0; start < tiles.length; start += D1_MAX_BOUND_PARAMETERS) {
    const chunk = tiles.slice(start, start + D1_MAX_BOUND_PARAMETERS);
    const slots = chunk.map(() => '?').join(',');
    statements.push(db.prepare(`SELECT tile_id FROM tiles WHERE tile_id IN (${slots})`).bind(...chunk));
    statements.push(db.prepare(`SELECT ${TRAIL_COLUMNS} FROM osm_trails WHERE tile_id IN (${slots})`).bind(...chunk));
  }
  const results = await db.batch(statements);
  const filled = results.filter((_, index) => index % 2 === 0).reduce((total, result) => total + result.results.length, 0);
  const rows = results.filter((_, index) => index % 2 === 1).flatMap((result) => result.results);
  const trails = rows
    .map((row) => toTrailResult(row, search))
    .filter((trail) => trail.distanceMiles <= search.radius * 1.05)
    .sort((a, b) => a.distanceMiles - b.distanceMiles || a.name.localeCompare(b.name))
    .slice(0, MAX_TRAIL_RESULTS);
  // An empty list from an area not imported yet is different from an area with no trails.
  const coverage = filled === 0 ? 'none' : filled === tiles.length ? 'full' : 'partial';
  return { trails, coverage, attribution: ATTRIBUTION };
}

/** Encoded polylines, space-separated, to a list of points. */
export function decodePath(path) {
  const points = [];
  for (const piece of (path ?? '').split(' ')) {
    let index = 0;
    let lat = 0;
    let lon = 0;
    const next = () => {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = piece.charCodeAt(index) - 63;
        index += 1;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < piece.length);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    while (index < piece.length) {
      lat += next();
      lon += next();
      points.push({ lat: lat / 1e5, lon: lon / 1e5 });
    }
  }
  return points;
}

function accessPoints(row) {
  const points = (row.access_points ?? '').split(' ').filter(Boolean).map((text) => {
    const [lat, lon] = text.split(',').map(Number);
    return { lat, lon };
  });
  if (row.parking_lat != null && row.parking_lon != null && !points.some((point) => point.lat === row.parking_lat && point.lon === row.parking_lon)) points.push({ lat: row.parking_lat, lon: row.parking_lon });
  return points;
}

function nearestOf(search, points) {
  let best;
  let bestMiles = Infinity;
  for (const point of points) {
    const miles = milesBetween(search, point);
    if (miles < bestMiles) { bestMiles = miles; best = point; }
  }
  return best ? { point: best, miles: bestMiles } : undefined;
}

/**
 * How far to where you'd actually go: the closest parking lot or trailhead when there is one. A
 * trail passing behind a house isn't "close" if the way onto it is miles off, and this must match
 * where Directions goes. With no known access, it's the nearest point of the trail.
 */
function milesToAccess(row, search, access) {
  if (access) return access.miles;
  const onTrail = nearestOf(search, decodePath(row.path));
  return onTrail ? onTrail.miles : milesBetween(search, { lat: row.center_lat, lon: row.center_lon });
}

function toTrailResult(row, search) {
  const points = accessPoints(row);
  const access = nearestOf(search, points);
  const rated = SAC_SCALE[row.sac_scale];
  const difficulty = rated ?? estimateDifficulty(row.climb_ft, row.length_mi, row);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    latitude: row.center_lat,
    longitude: row.center_lon,
    distanceMiles: Math.round(milesToAccess(row, search, access) * 10) / 10,
    lengthMiles: row.length_mi ?? undefined,
    climbFt: row.climb_ft ?? undefined,
    difficulty,
    difficultySource: rated ? 'osm' : difficulty ? 'estimated' : undefined,
    surface: row.surface ? row.surface.charAt(0).toUpperCase() + row.surface.slice(1).replace(/_/g, ' ') : undefined,
    parking: access ? { latitude: access.point.lat, longitude: access.point.lon } : undefined,
    accessPoints: points.length > 1 ? points.map((point) => ({ latitude: point.lat, longitude: point.lon })) : undefined,
    path: row.path && row.path.length <= MAX_PATH_CHARACTERS ? row.path : undefined,
    wikidata: row.wikidata ?? undefined,
    wikipedia: row.wikipedia ?? undefined,
  };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers });
}
