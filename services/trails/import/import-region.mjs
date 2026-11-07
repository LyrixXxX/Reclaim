/**
 * Builds a local trail database from a Geofabrik extract. Nothing here touches Cloudflare.
 *
 *   node services/trails/import/import-region.mjs services/trails/.data/tennessee-latest.osm.pbf services/trails/.data/tennessee.sqlite
 *
 * An extract lists nodes, then ways, then relations, and each step needs the one after it, so the
 * file is read three times: routes first, then the ways they use, then those ways' coordinates.
 */
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { createOSMStream } from 'osm-pbf-parser-node';

import { tileId } from '../worker.mjs';
import { buildTrails, interiorTiles, isParking, isTrailRelation, isTrailWay, isWaterfall, NODE_TAGS, RELATION_TAGS, WAY_TAGS, writeTrails } from './build-trails.mjs';

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error('Usage: node import-region.mjs <extract.osm.pbf> <output.sqlite>');
  process.exit(1);
}

const started = Date.now();
const log = (message) => console.log(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s] ${message}`);
const withTags = { node: NODE_TAGS, way: WAY_TAGS, relation: RELATION_TAGS };

// Step 1: routes, marked points, and which tiles have any map data.
const relationsById = new Map();
const points = [];
const seenTiles = new Set();
let sourceTimestamp = null;
let nodeCount = 0;
for await (const item of createOSMStream(source, { withTags })) {
  if (item.osmosis_replication_timestamp) sourceTimestamp = item.osmosis_replication_timestamp;
  if (item.type === 'node') {
    nodeCount += 1;
    seenTiles.add(tileId(item.lat, item.lon));
    const tags = item.tags;
    if (tags && (tags.highway === 'trailhead' || isWaterfall(tags) || isParking(tags))) points.push({ id: item.id, lat: item.lat, lon: item.lon, tags });
  } else if (item.type === 'relation') {
    relationsById.set(item.id, item);
  }
}
const relations = [];
const wanted = new Set();
const wantedRelations = new Set();
const addRoute = (relation) => {
  if (wantedRelations.has(relation.id)) return;
  wantedRelations.add(relation.id);
  relations.push(relation);
  for (const member of relation.members) {
    if (member.type === 'way') wanted.add(member.ref);
    else if (member.type === 'relation' && relationsById.has(member.ref)) addRoute(relationsById.get(member.ref));
  }
};
for (const relation of relationsById.values()) if (isTrailRelation(relation.tags)) addRoute(relation);
relationsById.clear();
log(`Step 1: ${nodeCount.toLocaleString()} nodes, ${relations.length} routes, ${points.length} marked points, ${seenTiles.size} tiles`);

// Step 2: the ways those routes use, named trail ways, and parking lots drawn as areas.
const ways = new Map();
const parkingWays = [];
const neededNodes = new Set();
for await (const item of createOSMStream(source, { withTags })) {
  if (item.type !== 'way') continue;
  const parking = isParking(item.tags);
  if (parking) parkingWays.push({ refs: item.refs });
  if (wanted.has(item.id) || isTrailWay(item.tags)) ways.set(item.id, { id: item.id, refs: item.refs, tags: item.tags });
  else if (!parking) continue;
  for (const ref of item.refs) neededNodes.add(ref);
}
const missingWays = [...wanted].filter((id) => !ways.has(id)).length;
log(`Step 2: ${ways.size.toLocaleString()} trail ways, ${parkingWays.length.toLocaleString()} parking areas, ${neededNodes.size.toLocaleString()} nodes needed, ${missingWays} route ways outside this extract`);

// Step 3: coordinates. Nodes come first in the file, so stop at the first way.
const coordinates = new Map();
for await (const item of createOSMStream(source, { withTags: false })) {
  if (item.type === 'way') break;
  if (item.type === 'node' && neededNodes.has(item.id)) coordinates.set(item.id, [item.lat, item.lon]);
}
log(`Step 3: ${coordinates.size.toLocaleString()} coordinates`);

const now = Math.floor(Date.now() / 1000);
const rows = buildTrails({ ways, relations, points, parkingWays, coordinates, now });
log(`Built ${rows.length.toLocaleString()} rows`);

const tiles = interiorTiles(seenTiles);
for (const suffix of ['', '-wal', '-shm', '-journal']) if (existsSync(target + suffix)) rmSync(target + suffix);
const db = new DatabaseSync(target);
db.exec(readFileSync(new URL('../migrations/0001_trail_schema.sql', import.meta.url), 'utf8'));
writeTrails(db, rows, tiles, { filledAt: now, sourceVersion: sourceTimestamp ? `geofabrik:${sourceTimestamp}` : null });
db.exec('VACUUM');

// A summary to judge the import by.
const count = (test) => rows.filter(test).length;
const lines = rows.filter((row) => row.kind === 'trail' || row.kind === 'path');
const percent = (part, whole) => `${part.toLocaleString()} of ${whole.toLocaleString()} (${whole ? Math.round(part / whole * 100) : 0}%)`;
console.log('\nRows by kind:', Object.fromEntries(['trail', 'path', 'trailhead', 'waterfall'].map((kind) => [kind, count((row) => row.kind === kind)])));
console.log('Trails and paths:');
console.log(`  with length:     ${percent(lines.filter((row) => row.length_mi).length, lines.length)}`);
console.log(`  with parking:    ${percent(lines.filter((row) => row.parking_lat != null).length, lines.length)}`);
console.log(`  with sac_scale:  ${percent(lines.filter((row) => row.sac_scale).length, lines.length)}`);
console.log(`  with photo link: ${percent(lines.filter((row) => row.wikidata || row.wikipedia).length, lines.length)}`);
const pathBytes = rows.reduce((sum, row) => sum + (row.path?.length ?? 0), 0);
console.log(`Tiles: ${seenTiles.size} with data, ${tiles.length} marked filled`);
console.log(`Paths: ${(pathBytes / 1e6).toFixed(1)} MB. Database: ${(statSync(target).size / 1e6).toFixed(1)} MB`);

const tagged = rows.filter((row) => row.distanceTag && row.length_mi);
const ratios = tagged.map((row) => row.length_mi / row.distanceTag).sort((a, b) => a - b);
if (ratios.length) {
  console.log(`\nRoutes with a published distance tag: ${ratios.length}. Measured / tagged: median ${ratios[ratios.length >> 1].toFixed(2)}, within 10%: ${percent(ratios.filter((r) => r >= 0.9 && r <= 1.1).length, ratios.length)}`);
  const worst = [...tagged].sort((a, b) => Math.abs(Math.log(b.length_mi / b.distanceTag)) - Math.abs(Math.log(a.length_mi / a.distanceTag))).slice(0, 8);
  for (const row of worst) console.log(`  ${row.length_mi} mi measured, ${row.distanceTag.toFixed(1)} tagged: ${row.name}`);
}
db.close();
log('Done');
