/**
 * Turns OpenStreetMap ways, relations and points into rows for the osm_trails table. No file or
 * parser code lives here, so all of it can be tested with small samples.
 */
import { milesBetween, tileId } from '../worker.mjs';

/** Pieces of one name this close together are one trail, such as across a road or an unnamed link. */
export const GAP_MILES = 0.5;
export const PARKING_MILES = 0.3;
export const MIN_TRAIL_MILES = 0.1;
/** Routes past this aren't a hike to pick from a list: their parts are listed on their own. */
export const MAX_ROUTE_MILES = 50;
/** Connector and spur scraps are how you reach a trail, not somewhere to go. */
const MIN_LINK_MILES = 0.25;
const LINK_NAME = /\b(connector|spur)\b/i;
const MAX_ACCESS_POINTS = 12;
const METERS_PER_MILE = 1609.344;
const SIMPLIFY_METERS = 5;
const PARKING_GRID_DEGREES = 0.01;

const TRAIL_WORD = /\b(trails?|greenway|loop|path|trace)\b/i;
// Full words only, in any case. Short forms need exact case at the end of a name: "CT - Brady
// Mountain" is the Cumberland Trail, not a court.
const ROAD_WORD = /\b(road|street|avenue|drive|lane|court|circle|boulevard|highway|driveway|sidewalk|alley|place|terrace)\b/i;
const ENDS_IN_ROAD_WORD = new RegExp(`${ROAD_WORD.source}$`, 'i');
/** Says what the thing is, not which one: useless in a list, and usually a mapping slip. */
const GENERIC_NAME = /^(the )?((hiking|walking|nature|foot|dirt|gravel|unnamed) )?(trail|path|footpath|track)$/i;
const ROAD_ABBREVIATION = /\b(Rd|St|Ave|Dr|Ln|Blvd|Hwy)\.?$/;
/** Places along a trail, mapped as paths: useful on a map, but not hikes to choose from. */
const NOT_A_HIKE = /\bcampsite\b|\b(campground|kiosk|restroom|parking|parking lot)$/i;
const NATURAL_SURFACE = new Set(['ground', 'dirt', 'earth', 'gravel', 'fine_gravel', 'grass', 'wood', 'woodchips', 'compacted', 'unpaved', 'rock', 'mud', 'sand']);
const CLOSED = new Set(['private', 'no']);

export const WAY_TAGS = ['name', 'highway', 'footway', 'access', 'foot', 'surface', 'sac_scale', 'wikidata', 'wikipedia', 'amenity'];
export const RELATION_TAGS = ['name', 'type', 'route', 'state', 'distance', 'surface', 'sac_scale', 'wikidata', 'wikipedia'];
export const NODE_TAGS = ['name', 'highway', 'waterway', 'natural', 'amenity', 'access', 'wikidata', 'wikipedia'];

const trailName = (tags) => tags?.name?.trim() ?? '';
const nameKey = (name) => name.toLowerCase().replace(/\s+/g, ' ');
const isClosed = (tags) => CLOSED.has(tags.foot) || (CLOSED.has(tags.access) && tags.foot !== 'yes' && tags.foot !== 'designated');
// "Old Mill Road Trail" is a trail; "Trail Place" and "Hathaway Drive" are streets.
const looksLikeRoad = (name) => ENDS_IN_ROAD_WORD.test(name) || (!TRAIL_WORD.test(name) && (ROAD_WORD.test(name) || ROAD_ABBREVIATION.test(name)));

/** A named way people would hike on, without city sidewalks and roads that are mapped as tracks. */
export function isTrailWay(tags = {}) {
  const name = trailName(tags);
  if (!name || GENERIC_NAME.test(name) || NOT_A_HIKE.test(name) || isClosed(tags) || looksLikeRoad(name)) return false;
  if (tags.highway === 'path') return true;
  if (tags.highway === 'footway') {
    if (['sidewalk', 'crossing', 'access_aisle'].includes(tags.footway)) return false;
    return TRAIL_WORD.test(name) || !!tags.sac_scale || NATURAL_SURFACE.has(tags.surface);
  }
  return ['track', 'cycleway', 'bridleway'].includes(tags.highway) && TRAIL_WORD.test(name);
}

export function isTrailRelation(tags = {}) {
  return !!trailName(tags) && ['route', 'superroute'].includes(tags.type) && ['hiking', 'foot'].includes(tags.route) && tags.state !== 'proposed';
}

/** Waterfalls are mapped as waterway=waterfall, and on older entries as natural=waterfall. */
export function isWaterfall(tags = {}) {
  return tags.waterway === 'waterfall' || tags.natural === 'waterfall';
}

export function isParking(tags = {}) {
  return tags.amenity === 'parking' && !['private', 'customers', 'no'].includes(tags.access);
}

/** OpenStreetMap's distance tag defaults to kilometers. Matches src/lib/trails.ts. */
export function distanceTagMiles(raw) {
  const match = /^([\d.]+)\s*(mi|miles?|km|m)?$/i.exec(raw?.trim() ?? '');
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = (match[2] ?? 'km').toLowerCase();
  return unit.startsWith('mi') ? value : unit === 'm' ? value / METERS_PER_MILE : value * 1000 / METERS_PER_MILE;
}

export function lineMiles(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += milesBetween(points[i - 1], points[i]);
  return total;
}

/** Google's encoded polyline format, precision 5. */
export function encodePolyline(points) {
  let lastLat = 0;
  let lastLon = 0;
  let out = '';
  const encode = (value) => {
    let rest = value < 0 ? ~(value << 1) : value << 1;
    while (rest >= 0x20) { out += String.fromCharCode((0x20 | (rest & 0x1f)) + 63); rest >>= 5; }
    out += String.fromCharCode(rest + 63);
  };
  for (const { lat, lon } of points) {
    const y = Math.round(lat * 1e5);
    const x = Math.round(lon * 1e5);
    encode(y - lastLat);
    encode(x - lastLon);
    lastLat = y;
    lastLon = x;
  }
  return out;
}

/** Douglas-Peucker: drops points that change the line by less than `meters`. */
export function simplifyLine(points, meters = SIMPLIFY_METERS) {
  if (points.length < 3) return points;
  const metersPerLat = 111_320;
  const metersPerLon = metersPerLat * Math.cos(points[0].lat * Math.PI / 180);
  const offset = (p, a, b) => {
    const px = (p.lon - a.lon) * metersPerLon, py = (p.lat - a.lat) * metersPerLat;
    const bx = (b.lon - a.lon) * metersPerLon, by = (b.lat - a.lat) * metersPerLat;
    const lengthSquared = bx * bx + by * by;
    const t = lengthSquared ? Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared)) : 0;
    return Math.hypot(px - t * bx, py - t * by);
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = -1;
    let distance = meters;
    for (let i = first + 1; i < last; i += 1) {
      const d = offset(points[i], points[first], points[last]);
      if (d > distance) { distance = d; farthest = i; }
    }
    if (farthest >= 0) { keep[farthest] = 1; stack.push([first, farthest], [farthest, last]); }
  }
  return points.filter((_, index) => keep[index]);
}

/** Joins lines that meet end to end, so a trail's path is as few pieces as possible. */
export function stitchLines(lines) {
  const remaining = lines.map((line) => [...line]);
  const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
  const chains = [];
  while (remaining.length) {
    const chain = remaining.pop();
    for (let joined = true; joined;) {
      joined = false;
      for (let i = remaining.length - 1; i >= 0; i -= 1) {
        const line = remaining[i];
        const end = chain[chain.length - 1];
        if (same(end, line[0])) chain.push(...line.slice(1));
        else if (same(end, line[line.length - 1])) chain.push(...[...line].reverse().slice(1));
        else if (same(chain[0], line[line.length - 1])) chain.unshift(...line.slice(0, -1));
        else if (same(chain[0], line[0])) chain.unshift(...[...line].reverse().slice(0, -1));
        else continue;
        remaining.splice(i, 1);
        joined = true;
      }
    }
    chains.push(chain);
  }
  return chains;
}

/** Ways of one name that touch or nearly touch. The same name far away is a different trail. */
export function connectedPieces(ways, gapMiles = GAP_MILES) {
  const parent = ways.map((_, index) => index);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const owner = new Map();
  ways.forEach((way, index) => {
    for (const ref of way.refs) {
      if (owner.has(ref)) union(owner.get(ref), index);
      else owner.set(ref, index);
    }
  });
  const ends = (way) => [way.points[0], way.points[way.points.length - 1]];
  for (let a = 0; a < ways.length; a += 1) {
    for (let b = a + 1; b < ways.length; b += 1) {
      if (find(a) === find(b)) continue;
      if (ends(ways[a]).some((p) => ends(ways[b]).some((q) => milesBetween(p, q) <= gapMiles))) union(a, b);
    }
  }
  const pieces = new Map();
  ways.forEach((way, index) => {
    const root = find(index);
    if (!pieces.has(root)) pieces.set(root, []);
    pieces.get(root).push(way);
  });
  return [...pieces.values()];
}

/** The value that covers the most miles, such as a mostly-gravel trail with one boardwalk. */
function dominant(ways, tag) {
  const miles = new Map();
  for (const way of ways) {
    const value = way.tags?.[tag];
    if (value) miles.set(value, (miles.get(value) ?? 0) + way.miles);
  }
  return [...miles].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

const wikidataOf = (tags) => /^Q\d+$/.test(tags?.wikidata ?? '') ? tags.wikidata : undefined;
const wikipediaOf = (tags) => /^[a-z-]{2,12}:.+/.test(tags?.wikipedia ?? '') ? tags.wikipedia : undefined;

/** The point on the trail nearest its middle, so the center is never off in the woods. */
function middlePoint(lines) {
  const all = lines.flat();
  const lat = all.reduce((sum, p) => sum + p.lat, 0) / all.length;
  const lon = all.reduce((sum, p) => sum + p.lon, 0) / all.length;
  let best = all[0];
  let bestDistance = Infinity;
  for (const p of all) {
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d < bestDistance) { bestDistance = d; best = p; }
  }
  return best;
}

function parkingIndex(spots) {
  const grid = new Map();
  const cell = (lat, lon) => `${Math.floor(lat / PARKING_GRID_DEGREES)}:${Math.floor(lon / PARKING_GRID_DEGREES)}`;
  for (const spot of spots) {
    const key = cell(spot.lat, spot.lon);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(spot);
  }
  // One ring of 0.01° cells reaches 0.01° in every direction, which is more than 0.3 miles up to
  // about 60° north or south.
  return (point) => {
    const row = Math.floor(point.lat / PARKING_GRID_DEGREES);
    const column = Math.floor(point.lon / PARKING_GRID_DEGREES);
    const found = [];
    for (let r = row - 1; r <= row + 1; r += 1) for (let c = column - 1; c <= column + 1; c += 1) found.push(...(grid.get(`${r}:${c}`) ?? []));
    return found;
  };
}

/** The closest trailhead within reach of either end of the trail, or else the closest parking lot. */
export function findParking(ends, nearby, maxMiles = PARKING_MILES) {
  let best;
  let bestScore = Infinity;
  for (const end of ends) {
    for (const spot of nearby(end)) {
      const miles = milesBetween(end, spot);
      if (miles > maxMiles) continue;
      const score = spot.trailhead ? miles : miles + maxMiles;
      if (score < bestScore) { bestScore = score; best = spot; }
    }
  }
  return best;
}

/** Every parking lot or trailhead near any part of a trail, trailheads first. */
export function findAccessPoints(lines, nearby, maxMiles = PARKING_MILES) {
  const found = new Set();
  for (const line of lines) {
    for (const point of line) {
      for (const spot of nearby(point)) {
        if (!found.has(spot) && milesBetween(point, spot) <= maxMiles) found.add(spot);
      }
    }
  }
  return [...found].sort((a, b) => Number(b.trailhead) - Number(a.trailhead)).slice(0, MAX_ACCESS_POINTS);
}

const encodeAccessPoints = (spots) => spots.map((spot) => `${spot.lat.toFixed(5)},${spot.lon.toFixed(5)}`).join(' ') || null;

/**
 * Tiles safe to call fully imported: every neighbor has map data too. A region's edge tiles may be
 * cut off by the border, and marking them filled would hide trails just over the line, so they
 * stay unfilled until the neighboring region is imported.
 */
export function interiorTiles(seen) {
  const interior = [];
  for (const tile of seen) {
    const [row, column] = tile.split(':').map(Number);
    let inside = true;
    for (let r = row - 1; r <= row + 1 && inside; r += 1) {
      for (let c = column - 1; c <= column + 1 && inside; c += 1) inside = seen.has(`${r}:${c}`);
    }
    if (inside) interior.push(tile);
  }
  return interior;
}

function toRow({ id, name, kind, lines, tags, sacScale, surface, lengthMiles, parking, accessPoints = [], center, now }) {
  const chains = stitchLines(lines);
  return {
    id,
    tile_id: tileId(center.lat, center.lon),
    name,
    kind,
    // Encoded polylines never contain a space, so a trail in several pieces can be space-separated.
    path: chains.map((chain) => encodePolyline(simplifyLine(chain))).join(' ') || null,
    length_mi: lengthMiles === undefined ? null : Math.round(lengthMiles * 10) / 10,
    climb_ft: null,
    sac_scale: sacScale ?? null,
    surface: surface ?? null,
    parking_lat: parking?.lat ?? null,
    parking_lon: parking?.lon ?? null,
    access_points: encodeAccessPoints(accessPoints),
    center_lat: center.lat,
    center_lon: center.lon,
    wikidata: wikidataOf(tags) ?? null,
    wikipedia: wikipediaOf(tags) ?? null,
    updated_at: now,
  };
}

function resolveWay(way, coordinates) {
  const points = [];
  for (const ref of way.refs) {
    const point = coordinates.get(ref);
    if (!point) return null;
    points.push({ lat: point[0], lon: point[1] });
  }
  return points.length >= 2 ? { ...way, points, miles: lineMiles(points) } : null;
}

/** Every way in a route, through routes made of smaller routes. A missing part makes it incomplete. */
function routeMembers(relation, relationsById, seen = new Set([relation.id])) {
  const wayIds = new Set();
  let complete = true;
  for (const member of relation.members) {
    if (member.type === 'way') wayIds.add(member.ref);
    if (member.type !== 'relation' || seen.has(member.ref)) continue;
    seen.add(member.ref);
    const child = relationsById.get(member.ref);
    if (!child) { complete = false; continue; }
    const inner = routeMembers(child, relationsById, seen);
    complete &&= inner.complete;
    for (const id of inner.wayIds) wayIds.add(id);
  }
  return { wayIds, complete };
}

/**
 * @param input.ways Map of way id to { id, refs, tags }: trail ways and every way in a route.
 * @param input.relations hiking routes, plus any route they contain.
 * @param input.points nodes with tags: trailheads, waterfalls, parking.
 * @param input.parkingWays parking lots drawn as areas, as { refs }.
 * @param input.coordinates Map of node id to [lat, lon].
 * @returns rows for osm_trails, each with `distanceTag` (not stored) for checking lengths.
 */
export function buildTrails({ ways, relations, points = [], parkingWays = [], coordinates, now = 0 }) {
  const relationsById = new Map(relations.map((relation) => [relation.id, relation]));
  const resolved = new Map();
  for (const way of ways.values()) {
    const line = resolveWay(way, coordinates);
    if (line) resolved.set(way.id, line);
  }

  const spots = [];
  for (const point of points) {
    if (point.tags?.highway === 'trailhead') spots.push({ lat: point.lat, lon: point.lon, trailhead: true });
    else if (isParking(point.tags)) spots.push({ lat: point.lat, lon: point.lon, trailhead: false });
  }
  for (const lot of parkingWays) {
    const corners = lot.refs.map((ref) => coordinates.get(ref)).filter(Boolean);
    if (!corners.length) continue;
    spots.push({ lat: corners.reduce((sum, c) => sum + c[0], 0) / corners.length, lon: corners.reduce((sum, c) => sum + c[1], 0) / corners.length, trailhead: false });
  }
  const nearby = parkingIndex(spots);
  const parkingFor = (lines) => findParking(stitchLines(lines).flatMap((chain) => [chain[0], chain[chain.length - 1]]), nearby);
  // Stitching can reorder pieces, but every point stays in the list, which is all this looks at.
  const accessFor = (lines) => findAccessPoints(lines, nearby);

  const rows = [];
  const routeWaysByName = new Map();

  for (const relation of relations) {
    if (!isTrailRelation(relation.tags)) continue;
    const name = trailName(relation.tags);
    const { wayIds, complete } = routeMembers(relation, relationsById);
    const found = [...wayIds].map((id) => resolved.get(id)).filter(Boolean);
    if (!found.length) continue;
    const key = nameKey(name);
    if (!routeWaysByName.has(key)) routeWaysByName.set(key, new Set());
    for (const way of found) routeWaysByName.get(key).add(way.id);
    const whole = complete && found.length === wayIds.size;
    const measured = found.reduce((sum, way) => sum + way.miles, 0);
    const tagged = distanceTagMiles(relation.tags.distance);
    // Cut off by the region's border: a sum of what's here would be wrong, so use the tag or nothing.
    const lengthMiles = whole ? measured : tagged;
    // Also true of anything too long to measure, such as a proposed route around the whole country.
    if (lengthMiles === undefined || lengthMiles > MAX_ROUTE_MILES) continue;
    const lines = found.map((way) => way.points);
    const row = toRow({
      id: `relation/${relation.id}`, name, kind: 'trail', lines, tags: relation.tags,
      sacScale: relation.tags.sac_scale ?? dominant(found, 'sac_scale'), surface: relation.tags.surface ?? dominant(found, 'surface'),
      lengthMiles, parking: parkingFor(lines), accessPoints: accessFor(lines), center: middlePoint(lines), now,
    });
    rows.push({ ...row, distanceTag: tagged });
  }

  const byName = new Map();
  for (const way of resolved.values()) {
    if (!isTrailWay(way.tags)) continue;
    const key = nameKey(trailName(way.tags));
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(way);
  }
  for (const [key, group] of byName) {
    const route = routeWaysByName.get(key);
    for (const piece of connectedPieces(group)) {
      const miles = piece.reduce((sum, way) => sum + way.miles, 0);
      if (miles < MIN_TRAIL_MILES || (miles < MIN_LINK_MILES && LINK_NAME.test(key))) continue;
      // Already listed as a hiking route of the same name.
      if (route && piece.reduce((sum, way) => sum + (route.has(way.id) ? way.miles : 0), 0) >= miles / 2) continue;
      const lines = piece.map((way) => way.points);
      const tags = piece.find((way) => wikidataOf(way.tags) || wikipediaOf(way.tags))?.tags;
      rows.push(toRow({
        // The lowest id as text, the same way the app picks one when it merges map pieces.
        id: `way/${piece.map((way) => String(way.id)).sort()[0]}`,
        name: trailName(piece[0].tags), kind: 'path', lines, tags,
        sacScale: dominant(piece, 'sac_scale'), surface: dominant(piece, 'surface'),
        lengthMiles: miles, parking: parkingFor(lines), accessPoints: accessFor(lines), center: middlePoint(lines), now,
      }));
    }
  }

  for (const point of points) {
    const name = trailName(point.tags);
    const trailhead = point.tags?.highway === 'trailhead';
    const waterfall = isWaterfall(point.tags);
    if (!name || name.toLowerCase() === 'trailhead' || (!trailhead && !waterfall)) continue;
    rows.push(toRow({
      id: `node/${point.id}`, name, kind: trailhead ? 'trailhead' : 'waterfall', lines: [], tags: point.tags,
      // A waterfall's own spot can be deep in the woods. A trailhead is its own destination.
      accessPoints: waterfall ? findAccessPoints([[point]], nearby) : [],
      center: { lat: point.lat, lon: point.lon }, now,
    }));
  }
  return rows;
}

const ROW_COLUMNS = ['id', 'tile_id', 'name', 'kind', 'path', 'length_mi', 'climb_ft', 'sac_scale', 'surface', 'parking_lat', 'parking_lon', 'access_points', 'center_lat', 'center_lon', 'wikidata', 'wikipedia', 'updated_at'];

/** Writes rows and filled tiles to a database that has the trail schema. */
export function writeTrails(db, rows, tiles, { filledAt = 0, sourceVersion = null } = {}) {
  const insertTrail = db.prepare(`INSERT OR REPLACE INTO osm_trails (${ROW_COLUMNS.join(', ')}) VALUES (${ROW_COLUMNS.map(() => '?').join(', ')})`);
  const insertTile = db.prepare('INSERT OR REPLACE INTO tiles (tile_id, filled_at, source_versions) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const row of rows) insertTrail.run(...ROW_COLUMNS.map((column) => row[column]));
    for (const tile of tiles) insertTile.run(tile, filledAt, sourceVersion);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
