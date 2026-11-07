import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32, deflateSync } from 'node:zlib';

import { milesBetween } from '../worker.mjs';
import { ascentMeters, decodeTerrainPng, heightAt, resampleLine, smooth, tileKey, tilePosition, trailClimbFeet } from './elevation.mjs';

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** A real PNG: `rows` of [r, g, b] pixels, with one PNG filter per row. */
function png(rows, filters = rows.map(() => 0)) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(rows[0].length, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = 8;
  header[9] = 2;
  const stride = rows[0].length * 3;
  const flat = rows.map((row) => Buffer.from(row.flat()));
  const raw = [];
  flat.forEach((line, y) => {
    const filter = filters[y];
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= 3 ? line[i - 3] : 0;
      const b = y > 0 ? flat[y - 1][i] : 0;
      const c = y > 0 && i >= 3 ? flat[y - 1][i - 3] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const predicted = [0, a, b, (a + b) >> 1, paeth][filter];
      out[i] = (line[i] - predicted) & 0xff;
    }
    raw.push(Buffer.from([filter]), out);
  });
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(raw))), chunk('IEND', Buffer.alloc(0))]);
}

/** Terrarium encoding: height = r * 256 + g + b / 256 - 32768. */
const color = (meters) => {
  const value = meters + 32768;
  return [Math.floor(value / 256), Math.floor(value) % 256, Math.round((value % 1) * 256)];
};

test('decodes Terrarium heights through every PNG filter', () => {
  const rows = [0, 1, 2, 3, 4].map((y) => [100, 250.5, 1000, -5].map((meters) => color(meters + y * 10)));
  const tile = decodeTerrainPng(png(rows, [0, 1, 2, 3, 4]));
  assert.equal(tile.width, 4);
  assert.equal(tile.height, 5);
  assert.equal(tile.heights[0], 100);
  assert.equal(tile.heights[1], 250.5);
  assert.equal(tile.heights[4 * 4 + 2], 1040);
  assert.equal(tile.heights[4 * 4 + 3], 35);
});

test('refuses files that are not usable terrain tiles', () => {
  assert.throws(() => decodeTerrainPng(Buffer.from('<html>not found</html>')), /Not a PNG/);
  const damaged = png([[color(1)]]);
  assert.throws(() => decodeTerrainPng(Buffer.concat([damaged.subarray(0, 8), chunk('IHDR', damaged.subarray(16, 29)), chunk('IDAT', deflateSync(Buffer.from([0]))), chunk('IEND', Buffer.alloc(0))])), /Damaged/);
});

test('finds tiles the standard way', () => {
  assert.deepEqual(tilePosition({ lat: 0, lon: 0 }, 1), { x: 1, y: 1 });
  assert.equal(tileKey({ lat: 35.95, lon: -85.03 }, 14), '14/4322/6436');
});

test('blends heights between pixels, and reports a missing tile', () => {
  const tile = { width: 2, height: 2, heights: Float32Array.from([0, 10, 20, 30]) };
  const key = tileKey({ lat: 35.95, lon: -85.03 });
  const position = tilePosition({ lat: 35.95, lon: -85.03 });
  // The exact middle of the tile, which is halfway between all four pixels.
  const n = 2 ** 14;
  const lon = (Math.floor(position.x) + 0.5) / n * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (Math.floor(position.y) + 0.5) / n))) * 180 / Math.PI;
  assert.ok(Math.abs(heightAt({ lat, lon }, () => tile) - 15) < 0.01);
  assert.equal(heightAt({ lat, lon }, () => null), undefined);
  assert.equal(tileKey({ lat, lon }), key);
});

test('resamples a line evenly and keeps both ends', () => {
  const line = [{ lat: 35, lon: -85 }, { lat: 35.001, lon: -85 }, { lat: 35.002, lon: -85 }];
  const out = resampleLine(line, 30);
  assert.equal(out[0], line[0]);
  assert.equal(out[out.length - 1], line[2]);
  assert.ok(out.length >= 7 && out.length <= 9, `got ${out.length}`);
  for (let i = 2; i < out.length - 1; i += 1) assert.ok(Math.abs(milesBetween(out[i - 1], out[i]) * 1609.344 - 30) < 0.5);
});

test('smoothing averages neighbors and keeps the length', () => {
  assert.deepEqual(smooth([0, 0, 10, 0, 0], 3), [0, 10 / 3, 10 / 3, 10 / 3, 0]);
  assert.deepEqual(smooth([5], 5), [5]);
});

test('counts real climbing and ignores wobble', () => {
  assert.equal(ascentMeters([0, 1, 0, 1, 0, 1, 0]), 0, 'noise under the threshold');
  assert.equal(ascentMeters([0, 10, 20, 30]), 30);
  assert.equal(ascentMeters([100, 50, 80]), 30, 'only the rise, not the drop');
  assert.equal(ascentMeters([0, 20, 5, 25]), 40, 'each climb of an up and down counts');
  assert.equal(ascentMeters(Array.from({ length: 101 }, (_, i) => i * 0.5)), 48, 'a long gentle climb counts, up to the last full step');
  assert.equal(ascentMeters([]), 0);
});

test('measures a whole trail in feet, across pieces', () => {
  // Height follows latitude, in a tile big enough to hold the test line.
  const from = { lat: 35.95, lon: -85.03 };
  const n = 2 ** 14;
  const southOfTile = Math.atan(Math.sinh(Math.PI * (1 - 2 * (Math.floor(tilePosition(from).y) + 1) / n))) * 180 / Math.PI;
  const size = 256;
  const heights = new Float32Array(size * size);
  for (let row = 0; row < size; row += 1) heights.fill((size - row) * 2, row * size, (row + 1) * size); // 2 m per pixel, rising north.
  const tile = { width: size, height: size, heights };
  const line = (lat) => [{ lat, lon: from.lon }, { lat: lat + 0.005, lon: from.lon }];
  const one = trailClimbFeet([line(southOfTile + 0.002)], () => tile);
  assert.ok(one > 200, `got ${one}`);
  const two = trailClimbFeet([line(southOfTile + 0.002), line(southOfTile + 0.002)], () => tile);
  assert.ok(Math.abs(two - one * 2) <= 1);
  const reversed = [{ lat: southOfTile + 0.007, lon: from.lon }, { lat: southOfTile + 0.002, lon: from.lon }];
  assert.ok(Math.abs(trailClimbFeet([reversed], () => tile) - one) <= 1, 'a line mapped downhill still counts the climb back');
  assert.equal(trailClimbFeet([line(35)], () => null), undefined, 'no terrain, no number');
});
