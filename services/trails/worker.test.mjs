import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { requestHash } from '../nutrition-ai/play-integrity.mjs';
import { encodePolyline } from './import/build-trails.mjs';
import { decodePath, estimateDifficulty, handleRequest, milesBetween, parseSearch, tileId, tilesInRadius } from './worker.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'relay@example.test', private_key: privateKey });
const CROSSVILLE = 'lat=35.95&lon=-85.03&radius=10';

/** A real SQLite database running the real migration, behind the part of D1's API the Worker uses. */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./migrations/0001_trail_schema.sql', import.meta.url), 'utf8'));
  const db = {
    sqlite,
    prepare(sql) {
      return {
        bind(...params) {
          if (params.length > 100) throw new Error('D1 allows 100 bound parameters per query.');
          return { run: () => ({ results: sqlite.prepare(sql).all(...params) }) };
        },
      };
    },
    async batch(statements) { return statements.map((statement) => statement.run()); },
  };
  return db;
}

function addTrail(db, trail) {
  const row = { id: 'relation/1', name: 'Ozone Falls Trail', kind: 'trail', lat: 35.95, lon: -85.03, ...trail };
  db.sqlite.prepare(`INSERT INTO osm_trails (id, tile_id, name, kind, path, length_mi, climb_ft, sac_scale, surface, parking_lat, parking_lon, center_lat, center_lon, wikidata, wikipedia, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(row.id, tileId(row.lat, row.lon), row.name, row.kind, row.path ?? null, row.length_mi ?? null, row.climb_ft ?? null, row.sac_scale ?? null, row.surface ?? null, row.parking_lat ?? null, row.parking_lon ?? null, row.lat, row.lon, row.wikidata ?? null, row.wikipedia ?? null);
}

function markFilled(db, tiles) {
  for (const tile of tiles) db.sqlite.prepare('INSERT INTO tiles (tile_id, filled_at) VALUES (?, 1)').run(tile);
}

/** Plays Google: issues a passing verdict signed for `signedFor`, which defaults to the request itself. */
function google(signedFor, overrides = {}) {
  return async (target) => {
    if (target.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'google-test-token' });
    assert.match(target, /playintegrity\.googleapis\.com/, 'The Worker should call only Google here.');
    return Response.json({ tokenPayloadExternal: {
      requestDetails: { requestPackageName: 'com.greekkid60.reclaim', requestHash: await requestHash(signedFor, ''), timestampMillis: String(Date.now()) },
      appIntegrity: { packageName: 'com.greekkid60.reclaim', appRecognitionVerdict: 'PLAY_RECOGNIZED' },
      accountDetails: { appLicensingVerdict: 'LICENSED' },
      deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
      ...overrides,
    } });
  };
}

async function search(query, { db = fakeD1(), env = {}, fetcher, headers } = {}) {
  const path = query ? `/v1/trails?${query}` : '/v1/trails';
  return handleRequest(
    new Request(`https://trails.test${path}`, { headers: headers ?? { 'X-Play-Integrity': 'a-valid-looking-test-integrity-token' } }),
    { GOOGLE_SERVICE_ACCOUNT_JSON, DB: db, ...env },
    fetcher ?? google(path),
  );
}

test('only GET /v1/trails exists', async () => {
  const env = { GOOGLE_SERVICE_ACCOUNT_JSON };
  assert.equal((await handleRequest(new Request('https://trails.test/v1/other'), env)).status, 404);
  assert.equal((await handleRequest(new Request('https://trails.test/v1/trails', { method: 'POST', body: '{}' }), env)).status, 404);
});

test('without Play credentials nothing is served, and shared tokens do not help', async () => {
  const response = await handleRequest(
    new Request(`https://trails.test/v1/trails?${CROSSVILLE}`, { headers: { Authorization: 'Bearer token', 'X-Play-Integrity': 'a-valid-looking-test-integrity-token' } }),
    { RECLAIM_ACCESS_TOKEN: 'token', DB: fakeD1() },
  );
  assert.equal(response.status, 401);
});

test('a request without a Play Integrity token is refused', async () => {
  assert.equal((await search(CROSSVILLE, { headers: {} })).status, 401);
});

test('a token signed for a different location is refused', async () => {
  const response = await search(CROSSVILLE, { fetcher: google('/v1/trails?lat=1&lon=1&radius=10') });
  assert.equal(response.status, 403);
});

test('a failing Play verdict is refused', async () => {
  const path = `/v1/trails?${CROSSVILLE}`;
  const response = await search(CROSSVILLE, { fetcher: google(path, { appIntegrity: { packageName: 'com.greekkid60.reclaim', appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } }) });
  assert.equal(response.status, 403);
});

test('Google being unavailable is reported as temporary', async () => {
  const response = await search(CROSSVILLE, { fetcher: async () => new Response('', { status: 500 }) });
  assert.equal(response.status, 503);
});

test('the per-address limit runs before Google is called, and the global limit after', async () => {
  let keys = [];
  const perAddress = await search(CROSSVILLE, {
    headers: { 'CF-Connecting-IP': '203.0.113.9', 'X-Play-Integrity': 'a-valid-looking-test-integrity-token' },
    env: { RATE_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } },
    fetcher: async () => assert.fail('Google should not be called'),
  });
  assert.equal(perAddress.status, 429);
  assert.equal(keys.length, 1);
  assert.ok(!keys[0].includes('203.0.113.9'), 'The address is hashed before use.');

  const global = await search(CROSSVILLE, { env: { GLOBAL_RATE_LIMITER: { limit: async () => ({ success: false }) } } });
  assert.equal(global.status, 429);
});

test('bad search parameters are refused', async () => {
  for (const query of ['', 'lat=35&lon=-85', 'lat=91&lon=0&radius=5', 'lat=0&lon=181&radius=5', 'lat=0&lon=0&radius=0', 'lat=0&lon=0&radius=51', 'lat=0x10&lon=0&radius=5', 'lat=1e1&lon=0&radius=5', 'lat=&lon=0&radius=5', 'lat=abc&lon=0&radius=5']) {
    assert.equal((await search(query)).status, 400, query);
  }
  assert.deepEqual(parseSearch(new URLSearchParams(CROSSVILLE)), { lat: 35.95, lon: -85.03, radius: 10 });
});

test('tile ids match the plan and hold every point of their tile', () => {
  assert.equal(tileId(35.95, -84.95), '359:-850');
  assert.equal(tileId(2.9, 0), '29:0');
  assert.equal(tileId(-0.05, -0.05), '-1:-1');
  assert.equal(tileId(90, 180), '899:-1800');
});

test('a search covers every tile a point in its circle can fall in', () => {
  for (const center of [{ lat: 35.95, lon: -85.03 }, { lat: -33.9, lon: 151.2 }, { lat: 64.1, lon: -21.9 }, { lat: 0.02, lon: 179.98 }]) {
    for (const radius of [5, 50]) {
      const tiles = new Set(tilesInRadius({ ...center, radius }));
      for (let step = 0; step < 720; step += 1) {
        const bearing = step / 2 * Math.PI / 180;
        const distance = radius * (step % 4 + 1) / 4 / 3958.76;
        const lat1 = center.lat * Math.PI / 180;
        const lat = Math.asin(Math.sin(lat1) * Math.cos(distance) + Math.cos(lat1) * Math.sin(distance) * Math.cos(bearing));
        const lon = center.lon * Math.PI / 180 + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat1), Math.cos(distance) - Math.sin(lat1) * Math.sin(lat));
        const point = { lat: lat * 180 / Math.PI, lon: ((lon * 180 / Math.PI + 540) % 360) - 180 };
        assert.ok(tiles.has(tileId(point.lat, point.lon)), `${JSON.stringify(point)} from ${JSON.stringify(center)} at ${radius} mi`);
      }
    }
  }
});

test('tile cover leaves out far corners and handles the poles', () => {
  const center = { lat: 35.95, lon: -85.03, radius: 50 };
  const tiles = tilesInRadius(center);
  assert.ok(tiles.length > 100, 'Large enough that one query could not hold them.');
  assert.ok(!tiles.includes(tileId(35.95 + 0.72 * 1.9, -85.03 + 0.89 * 1.9)));
  assert.ok(tilesInRadius({ lat: 90, lon: 0, radius: 5 }).length > 0);
  assert.ok(tilesInRadius({ lat: -90, lon: 180, radius: 50 }).length > 0);
});

test('returns nearby trails closest first, in the app shape', async () => {
  const db = fakeD1();
  const path = encodePolyline([{ lat: 35.951, lon: -85.03 }, { lat: 35.952, lon: -85.03 }]);
  addTrail(db, { id: 'relation/2', name: 'Far', lat: 36.05, lon: -85.03 });
  addTrail(db, {
    id: 'relation/1', lat: 35.951, lon: -85.03, path, length_mi: 0.8, climb_ft: 180, sac_scale: 'mountain_hiking', surface: 'fine_gravel',
    parking_lat: 35.95, parking_lon: -85.03, wikidata: 'Q1', wikipedia: 'en:Ozone Falls',
  });
  addTrail(db, { id: 'node/3', name: 'Outside the radius', kind: 'trailhead', lat: 36.5, lon: -85.03 });
  const response = await search(CROSSVILLE, { db });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body.trails.map((trail) => trail.id), ['relation/1', 'relation/2']);
  assert.deepEqual(body.trails[0], {
    id: 'relation/1', name: 'Ozone Falls Trail', kind: 'trail', latitude: 35.951, longitude: -85.03, distanceMiles: 0,
    lengthMiles: 0.8, climbFt: 180, difficulty: 'Moderate', difficultySource: 'osm', surface: 'Fine gravel',
    parking: { latitude: 35.95, longitude: -85.03 }, path, wikidata: 'Q1', wikipedia: 'en:Ozone Falls',
  });
  assert.deepEqual(Object.keys(body.trails[1]).sort(), ['distanceMiles', 'id', 'kind', 'latitude', 'longitude', 'name']);
  assert.equal(body.attribution, '© OpenStreetMap contributors. Terrain data courtesy of the U.S. Geological Survey.');
});

test('distance and parking are the closest way onto the trail, not a line passing nearby', async () => {
  const db = fakeD1();
  const path = encodePolyline([{ lat: 35.951, lon: -85.03 }, { lat: 36.05, lon: -85.03 }]);
  db.sqlite.exec('DELETE FROM osm_trails');
  addTrail(db, { lat: 36.0, lon: -85.03, path, parking_lat: 36.05, parking_lon: -85.03 });
  db.sqlite.prepare("UPDATE osm_trails SET access_points = '36.05000,-85.03000 35.98000,-85.03000'").run();
  const { trails } = await (await search(CROSSVILLE, { db })).json();
  assert.equal(trails[0].distanceMiles, 2.1, 'to the closer lot, not the 0.1 mile trail line');
  assert.deepEqual(trails[0].parking, { latitude: 35.98, longitude: -85.03 });
  assert.equal(trails[0].accessPoints.length, 2);
});

test('with no known parking, distance is to the nearest point of the trail, not its middle', async () => {
  const db = fakeD1();
  const path = `${encodePolyline([{ lat: 36.05, lon: -85.03 }, { lat: 36.0, lon: -85.03 }])} ${encodePolyline([{ lat: 35.951, lon: -85.03 }, { lat: 35.96, lon: -85.03 }])}`;
  addTrail(db, { lat: 36.0, lon: -85.03, path });
  const { trails } = await (await search(CROSSVILLE, { db })).json();
  assert.equal(trails[0].distanceMiles, 0.1);
  assert.equal(decodePath(path).length, 4);
});

test('estimates difficulty from climb and length', () => {
  assert.equal(estimateDifficulty(50, 1), 'Easy');
  assert.equal(estimateDifficulty(625, 2), 'Moderate');
  assert.equal(estimateDifficulty(1100, 5), 'Moderately strenuous');
  assert.equal(estimateDifficulty(2000, 6), 'Strenuous');
  assert.equal(estimateDifficulty(3000, 8), 'Very strenuous');
  assert.equal(estimateDifficulty(0, 2), 'Easy', 'flat is easy');
  assert.equal(estimateDifficulty(null, 2), undefined);
  assert.equal(estimateDifficulty(100, null), undefined);
  assert.equal(estimateDifficulty(3000, 8, { name: 'Clarksville Greenway' }), 'Moderate');
  assert.equal(estimateDifficulty(3000, 8, { name: 'River Walk', surface: 'asphalt' }), 'Moderate');
  assert.equal(estimateDifficulty(50, 1, { name: 'Short Greenway' }), 'Easy');
});

test('labels a difficulty by where it came from, and a map rating wins', async () => {
  const db = fakeD1();
  addTrail(db, { id: 'way/1', lat: 35.951, lon: -85.03, climb_ft: 1100, length_mi: 5 });
  addTrail(db, { id: 'way/2', name: 'Rated', lat: 35.952, lon: -85.03, climb_ft: 50, length_mi: 1, sac_scale: 'demanding_mountain_hiking' });
  addTrail(db, { id: 'way/3', name: 'Lowest step', lat: 35.953, lon: -85.03, climb_ft: 50, length_mi: 1, sac_scale: 'hiking' });
  const { trails } = await (await search(CROSSVILLE, { db })).json();
  assert.deepEqual(trails.map((trail) => [trail.difficulty, trail.difficultySource]), [['Moderately strenuous', 'estimated'], ['Challenging', 'osm'], ['Easy', 'estimated']]);
});

test('the lowest mountaineering rating is not shown as easy', async () => {
  const db = fakeD1();
  addTrail(db, { lat: 35.951, lon: -85.03, sac_scale: 'hiking' });
  const { trails } = await (await search(CROSSVILLE, { db })).json();
  assert.equal(trails[0].difficulty, undefined);
  assert.equal(trails[0].difficultySource, undefined);
});

test('leaves out a path too long to send, and keeps the trail', async () => {
  const db = fakeD1();
  addTrail(db, { lat: 35.951, lon: -85.03, path: encodePolyline(Array.from({ length: 4000 }, (_, i) => ({ lat: 35.951 + i * 0.001, lon: -85.03 + (i % 2) * 0.001 }))) });
  const { trails } = await (await search(CROSSVILLE, { db })).json();
  assert.equal(trails.length, 1);
  assert.equal(trails[0].path, undefined);
});

test('caps results at the 60 closest', async () => {
  const db = fakeD1();
  for (let index = 0; index < 70; index += 1) addTrail(db, { id: `way/${index}`, name: `Trail ${index}`, lat: 35.95 + index * 0.001, lon: -85.03 });
  const { trails } = await (await search(CROSSVILLE, { db })).json();
  assert.equal(trails.length, 60);
  assert.equal(trails[0].id, 'way/0');
  assert.equal(trails[59].id, 'way/59');
});

test('a 50-mile search stays inside the D1 parameter limit and finds trails in far tiles', async () => {
  const db = fakeD1();
  addTrail(db, { lat: 35.95 + 0.6, lon: -85.03 });
  const response = await search('lat=35.95&lon=-85.03&radius=50', { db });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).trails.length, 1);
});

test('finds trails across the 180° meridian', async () => {
  const db = fakeD1();
  addTrail(db, { lat: 0, lon: -179.99 });
  const { trails } = await (await search('lat=0&lon=179.99&radius=5', { db })).json();
  assert.equal(trails.length, 1);
  assert.ok(trails[0].distanceMiles < 2);
});

test('coverage says whether an empty list means no trails or not imported yet', async () => {
  const query = { lat: 35.95, lon: -85.03, radius: 10 };
  const tiles = tilesInRadius(query);
  const db = fakeD1();
  assert.equal((await (await search(CROSSVILLE, { db })).json()).coverage, 'none');
  markFilled(db, tiles.slice(0, 1));
  assert.equal((await (await search(CROSSVILLE, { db })).json()).coverage, 'partial');
  markFilled(db, tiles.slice(1));
  assert.equal((await (await search(CROSSVILLE, { db })).json()).coverage, 'full');
});

test('a search writes nothing to the database', async () => {
  const db = fakeD1();
  const before = db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
  await search(CROSSVILLE, { db });
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS changes').get().changes, before);
});

test('database failure is temporary and leaks no details', async () => {
  const response = await search(CROSSVILLE, { db: { prepare() { throw new Error('secret detail 35.95'); } } });
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('secret'));
});

test('schema keeps OpenStreetMap data apart and has nowhere to hold a person', () => {
  const db = fakeD1();
  const columns = (table) => db.sqlite.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  const tables = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((table) => table.name).sort();
  assert.deepEqual(tables, ['osm_trails', 'tiles', 'trail_links', 'usfs_trails']);
  assert.ok(!columns('usfs_trails').some((name) => ['path', 'climb_ft', 'length_mi', 'sac_scale'].includes(name)), 'No OpenStreetMap-derived columns.');
  const everyColumn = tables.flatMap(columns);
  assert.ok(!everyColumn.some((name) => /user|device|email|account|^ip|_ip|address/i.test(name)), 'No personal columns.');
  assert.throws(() => db.sqlite.prepare("INSERT INTO osm_trails (id, source, tile_id, name, kind, center_lat, center_lon, updated_at) VALUES ('x', 'usfs', 't', 'n', 'trail', 0, 0, 1)").run());
});

test('distance matches the formula in the app', () => {
  assert.ok(Math.abs(milesBetween({ lat: 35.95, lon: -85.03 }, { lat: 36.95, lon: -85.03 }) - 69.1) < 0.1);
});
