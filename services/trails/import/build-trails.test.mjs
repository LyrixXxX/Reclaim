import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { milesBetween, tileId } from '../worker.mjs';
import { buildTrails, distanceTagMiles, encodePolyline, findParking, interiorTiles, isTrailRelation, isTrailWay, lineMiles, simplifyLine, stitchLines, writeTrails } from './build-trails.mjs';

const START = { lat: 35.95, lon: -85.03 };
/** About 0.069 miles per 0.001° of latitude. */
const MILE = 1 / 69.05;

/** Lays out a north-going way from `from` for `miles`, with node ids starting at `firstNode`. */
function line(coordinates, firstNode, from, miles, steps = 2) {
  const refs = [];
  for (let i = 0; i <= steps; i += 1) {
    const ref = firstNode + i;
    refs.push(ref);
    coordinates.set(ref, [from.lat + miles * MILE * i / steps, from.lon]);
  }
  return refs;
}

const sample = () => ({ coordinates: new Map(), ways: new Map(), relations: [], points: [], parkingWays: [] });
const addWay = (input, id, refs, tags) => input.ways.set(id, { id, refs, tags });
const lengthOf = (row) => row.length_mi;

test('keeps hiking paths and drops sidewalks, roads and closed ways', () => {
  assert.equal(isTrailWay({ highway: 'path', name: 'CT - Brady Mountain' }), true, '"CT" is the Cumberland Trail, not a court');
  assert.equal(isTrailWay({ highway: 'path', name: 'Below the Bluff' }), true);
  assert.equal(isTrailWay({ highway: 'footway', name: 'Soldier\'s Beach Trail' }), true);
  assert.equal(isTrailWay({ highway: 'footway', name: 'Ridge Walk', surface: 'dirt' }), true);
  assert.equal(isTrailWay({ highway: 'footway', name: 'Campus Walk', surface: 'concrete' }), false);
  assert.equal(isTrailWay({ highway: 'footway', footway: 'sidewalk', name: 'Main Trail' }), false);
  assert.equal(isTrailWay({ highway: 'track', name: 'Hammersmith Road' }), false);
  assert.equal(isTrailWay({ highway: 'track', name: 'Bluff Trail' }), true);
  assert.equal(isTrailWay({ highway: 'path', name: 'Hathaway Drive' }), false);
  assert.equal(isTrailWay({ highway: 'path', name: 'Old Mill Road Trail' }), true, 'a trail word wins over a road word');
  assert.equal(isTrailWay({ highway: 'path', name: 'Oak Rd' }), false);
  assert.equal(isTrailWay({ highway: 'path', name: 'Private Trail', access: 'private' }), false);
  assert.equal(isTrailWay({ highway: 'path', name: 'Open Trail', access: 'private', foot: 'yes' }), true);
  assert.equal(isTrailWay({ highway: 'path', name: 'Trail Place' }), false);
  assert.equal(isTrailWay({ highway: 'path', name: 'Trail' }), false, 'a name has to say which trail');
  assert.equal(isTrailWay({ highway: 'path', name: 'Nature Trail' }), false);
  assert.equal(isTrailWay({ highway: 'path', name: 'dirt path' }), false);
  assert.equal(isTrailWay({ highway: 'path', name: 'W Campsite Trail' }), false);
  assert.equal(isTrailWay({ highway: 'path', name: 'Campground' }), false);
  assert.equal(isTrailWay({ highway: 'path', name: 'Campground Loop Trail' }), true);
  assert.equal(isTrailWay({ highway: 'path', name: 'Ridge Nature Trail' }), true);
  assert.equal(isTrailWay({ highway: 'path' }), false, 'needs a name');
  assert.equal(isTrailWay({ highway: 'residential', name: 'Some Trail' }), false);
});

test('recognizes hiking routes only', () => {
  assert.equal(isTrailRelation({ type: 'route', route: 'hiking', name: 'A' }), true);
  assert.equal(isTrailRelation({ type: 'superroute', route: 'foot', name: 'A' }), true);
  assert.equal(isTrailRelation({ type: 'route', route: 'bicycle', name: 'A' }), false);
  assert.equal(isTrailRelation({ type: 'route', route: 'hiking' }), false);
  assert.equal(isTrailRelation({ type: 'route', route: 'hiking', name: 'A', state: 'proposed' }), false);
});

test('reads distance tags, which default to kilometers', () => {
  assert.ok(Math.abs(distanceTagMiles('10') - 6.21) < 0.01);
  assert.equal(distanceTagMiles('3.5 mi'), 3.5);
  assert.ok(Math.abs(distanceTagMiles('1609.344 m') - 1) < 1e-9);
  assert.equal(distanceTagMiles('about 3'), undefined);
  assert.equal(distanceTagMiles(undefined), undefined);
});

test('encodes polylines in the standard format', () => {
  assert.equal(encodePolyline([{ lat: 38.5, lon: -120.2 }, { lat: 40.7, lon: -120.95 }, { lat: 43.252, lon: -126.453 }]), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
});

test('simplifying drops points on a straight line and keeps real bends', () => {
  const straight = [{ lat: 36, lon: -85 }, { lat: 36.001, lon: -85 }, { lat: 36.002, lon: -85 }];
  assert.equal(simplifyLine(straight).length, 2);
  const bend = [{ lat: 36, lon: -85 }, { lat: 36.001, lon: -84.99 }, { lat: 36.002, lon: -85 }];
  assert.equal(simplifyLine(bend).length, 3);
});

test('stitches lines that meet in any direction', () => {
  const [a, b, c, far] = [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 }, { lat: 9, lon: 9 }];
  assert.equal(stitchLines([[a, b], [c, b]]).length, 1);
  assert.equal(stitchLines([[a, b], [b, c], [far, { lat: 9, lon: 10 }]]).length, 2);
});

test('joins pieces of a named trail and sums their length', () => {
  const input = sample();
  const first = line(input.coordinates, 100, START, 1);
  const second = line(input.coordinates, 200, { lat: START.lat + MILE, lon: START.lon }, 2);
  second[0] = first[first.length - 1];
  addWay(input, 11, first, { highway: 'path', name: 'Bluff Trail', surface: 'ground' });
  addWay(input, 12, second, { highway: 'path', name: 'Bluff  trail', surface: 'gravel' });
  const rows = buildTrails(input);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'way/11');
  assert.equal(rows[0].kind, 'path');
  assert.equal(lengthOf(rows[0]), 3);
  assert.equal(rows[0].surface, 'gravel', 'the surface covering the most miles');
  assert.equal(rows[0].tile_id, tileId(rows[0].center_lat, rows[0].center_lon));
  assert.ok(rows[0].path && !rows[0].path.includes(' '), 'connected pieces make one line');
});

test('keeps the same name far apart as separate trails, and joins a small gap', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 1), { highway: 'path', name: 'Lake Trail' });
  addWay(input, 2, line(input.coordinates, 200, { lat: START.lat + 1, lon: START.lon }, 1), { highway: 'path', name: 'Lake Trail' });
  assert.equal(buildTrails(input).length, 2);

  const gap = sample();
  addWay(gap, 1, line(gap.coordinates, 100, START, 1), { highway: 'path', name: 'Gap Trail' });
  addWay(gap, 2, line(gap.coordinates, 200, { lat: START.lat + 1.4 * MILE, lon: START.lon }, 1), { highway: 'path', name: 'Gap Trail' });
  const rows = buildTrails(gap);
  assert.equal(rows.length, 1);
  assert.equal(lengthOf(rows[0]), 2, 'the gap itself is not counted as walked');
  assert.ok(rows[0].path.includes(' '), 'a gap keeps two lines');
});

test('drops named scraps under a tenth of a mile', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 0.05), { highway: 'path', name: 'Tiny Trail' });
  assert.equal(buildTrails(input).length, 0);
});

test('a route is measured from its ways, unnamed ones too, and replaces same-named pieces', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 2), { highway: 'path', name: 'Ozone Falls Trail' });
  addWay(input, 2, line(input.coordinates, 200, { lat: START.lat + 2 * MILE, lon: START.lon }, 1), { highway: 'path' });
  input.relations.push({ id: 5, members: [{ type: 'way', ref: 1 }, { type: 'way', ref: 2 }], tags: { type: 'route', route: 'hiking', name: 'Ozone Falls Trail', wikidata: 'Q1', distance: '4.8' } });
  const rows = buildTrails(input);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'relation/5');
  assert.equal(rows[0].kind, 'trail');
  assert.equal(lengthOf(rows[0]), 3);
  assert.equal(rows[0].wikidata, 'Q1');
  assert.ok(Math.abs(rows[0].distanceTag - 2.98) < 0.01);
});

test('a route cut off by the border uses its distance tag, and is left out without one', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 2), { highway: 'path' });
  input.relations.push({ id: 5, members: [{ type: 'way', ref: 1 }, { type: 'way', ref: 999 }], tags: { type: 'route', route: 'hiking', name: 'Border Trail', distance: '40 mi' } });
  input.relations.push({ id: 6, members: [{ type: 'way', ref: 1 }, { type: 'way', ref: 999 }], tags: { type: 'route', route: 'hiking', name: 'American Perimeter Trail' } });
  const rows = buildTrails(input);
  assert.deepEqual(rows.map((row) => [row.name, row.length_mi]), [['Border Trail', 40]]);
});

test('routes too long to be a hike are left out, and their parts stay', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 8), { highway: 'path', name: 'CT - Daddy\'s Creek Trail' });
  input.relations.push({ id: 5, members: [{ type: 'way', ref: 1 }, { type: 'way', ref: 999 }], tags: { type: 'route', route: 'hiking', name: 'Great Eastern Trail', distance: '1600 mi' } });
  assert.deepEqual(buildTrails(input).map((row) => row.name), ['CT - Daddy\'s Creek Trail']);
});

test('short connectors and spurs are left out, but long ones stay', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 0.15), { highway: 'path', name: 'CT - Trailhead Connector' });
  addWay(input, 2, line(input.coordinates, 200, { lat: START.lat + 1, lon: START.lon }, 1), { highway: 'path', name: 'Long Connector' });
  assert.deepEqual(buildTrails(input).map((row) => row.name), ['Long Connector']);
});

test('keeps every access point along a trail, not just at its ends', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 4, 8), { highway: 'path', name: 'Long Trail' });
  input.points.push({ id: 50, lat: START.lat + 2 * MILE, lon: START.lon + 0.001, tags: { highway: 'trailhead' } });
  input.points.push({ id: 51, lat: START.lat - 0.1 * MILE, lon: START.lon, tags: { amenity: 'parking' } });
  input.points.push({ id: 52, lat: START.lat + 2 * MILE, lon: START.lon + 0.1, tags: { amenity: 'parking' } });
  const [row] = buildTrails(input);
  const points = row.access_points.split(' ');
  assert.equal(points.length, 2, 'the far lot is left out');
  assert.equal(points[0], `${(START.lat + 2 * MILE).toFixed(5)},${(START.lon + 0.001).toFixed(5)}`, 'trailheads first');
});

test('a waterfall lists parking near it', () => {
  const input = sample();
  input.points.push({ id: 1, ...START, tags: { waterway: 'waterfall', name: 'Ozone Falls' } });
  input.points.push({ id: 2, lat: START.lat + 0.1 * MILE, lon: START.lon, tags: { amenity: 'parking' } });
  const [row] = buildTrails(input);
  assert.equal(row.access_points.split(' ').length, 1);
});

test('a route made of routes counts each way once and survives a loop in its own parts', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 2), { highway: 'path' });
  addWay(input, 2, line(input.coordinates, 200, { lat: START.lat + 2 * MILE, lon: START.lon }, 3), { highway: 'path' });
  input.relations.push({ id: 7, members: [{ type: 'relation', ref: 8 }, { type: 'way', ref: 1 }], tags: { type: 'superroute', route: 'hiking', name: 'Whole Trail' } });
  input.relations.push({ id: 8, members: [{ type: 'way', ref: 1 }, { type: 'way', ref: 2 }, { type: 'relation', ref: 7 }], tags: { type: 'route', route: 'hiking', name: 'Section' } });
  const whole = buildTrails(input).find((row) => row.name === 'Whole Trail');
  assert.equal(lengthOf(whole), 5);
});

test('parking prefers a trailhead and ignores spots too far or private', () => {
  const end = { lat: 36, lon: -85 };
  const spot = (miles, trailhead) => ({ lat: 36 + miles * MILE, lon: -85, trailhead });
  assert.equal(findParking([end], () => [spot(0.05, false), spot(0.2, true)]).trailhead, true);
  assert.equal(findParking([end], () => [spot(0.05, false)]).trailhead, false);
  assert.equal(findParking([end], () => [spot(0.5, true)]), undefined);

  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 1), { highway: 'path', name: 'Lot Trail' });
  input.points.push({ id: 50, lat: START.lat - 0.1 * MILE, lon: START.lon, tags: { amenity: 'parking' } });
  input.points.push({ id: 51, lat: START.lat - 0.01 * MILE, lon: START.lon, tags: { amenity: 'parking', access: 'private' } });
  const [row] = buildTrails(input);
  assert.ok(Math.abs(row.parking_lat - (START.lat - 0.1 * MILE)) < 1e-9);
});

test('parking lots drawn as areas count, at their middle', () => {
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 1), { highway: 'path', name: 'Lot Trail' });
  input.coordinates.set(300, [START.lat - 0.1 * MILE, START.lon]);
  input.coordinates.set(301, [START.lat - 0.2 * MILE, START.lon]);
  input.parkingWays.push({ refs: [300, 301] });
  const [row] = buildTrails(input);
  assert.ok(Math.abs(milesBetween({ lat: row.parking_lat, lon: row.parking_lon }, START) - 0.15) < 0.01);
});

test('named trailheads and waterfalls become places with no length', () => {
  const input = sample();
  input.points.push({ id: 1, ...START, tags: { highway: 'trailhead', name: 'Ozone Trailhead' } });
  input.points.push({ id: 2, ...START, tags: { waterway: 'waterfall', name: 'Ozone Falls', wikidata: 'Q2' } });
  input.points.push({ id: 3, ...START, tags: { highway: 'trailhead' } });
  input.points.push({ id: 4, ...START, tags: { highway: 'trailhead', name: 'Trailhead' } });
  input.points.push({ id: 5, ...START, tags: { amenity: 'parking', name: 'Ozone Lot' } });
  input.points.push({ id: 6, ...START, tags: { natural: 'waterfall', name: 'Old Tag Falls' } });
  const rows = buildTrails(input);
  assert.deepEqual(rows.map((row) => [row.id, row.kind, row.length_mi, row.path]), [['node/1', 'trailhead', null, null], ['node/2', 'waterfall', null, null], ['node/6', 'waterfall', null, null]]);
  assert.equal(rows[1].wikidata, 'Q2');
});

test('only tiles surrounded by map data count as fully imported', () => {
  const seen = new Set();
  for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) seen.add(`${row}:${column}`);
  assert.deepEqual(interiorTiles(seen), ['1:1']);
  seen.delete('0:0');
  assert.deepEqual(interiorTiles(seen), []);
});

test('rows fit the real migration and can be rewritten', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_trail_schema.sql', import.meta.url), 'utf8'));
  const input = sample();
  addWay(input, 1, line(input.coordinates, 100, START, 1), { highway: 'path', name: 'A Trail', sac_scale: 'hiking' });
  input.points.push({ id: 2, ...START, tags: { natural: 'waterfall', name: 'Falls' } });
  const rows = buildTrails({ ...input, now: 5 });
  writeTrails(db, rows, ['359:-851'], { filledAt: 5, sourceVersion: 'test' });
  writeTrails(db, rows, ['359:-851'], { filledAt: 6, sourceVersion: 'test' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM osm_trails').get().n, 2);
  const stored = db.prepare("SELECT * FROM osm_trails WHERE id = 'way/1'").get();
  assert.equal(stored.source, 'osm');
  assert.equal(stored.sac_scale, 'hiking');
  assert.equal(stored.length_mi, 1);
  assert.equal(db.prepare('SELECT filled_at FROM tiles').get().filled_at, 6);
});

test('measures known distances', () => {
  assert.ok(Math.abs(lineMiles([START, { lat: START.lat + MILE, lon: START.lon }]) - 1) < 0.01);
});
