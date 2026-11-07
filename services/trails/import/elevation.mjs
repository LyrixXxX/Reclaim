/**
 * Climb from terrain tiles (Terrarium format: a PNG whose pixel colors encode height). No file or
 * network code lives here, so all of it can be tested with small samples.
 */
import { inflateSync } from 'node:zlib';

import { milesBetween } from '../worker.mjs';

export const TERRAIN_ZOOM = 14;
export const TILE_SIZE = 256;
/** Past this, a trail's climb and difficulty say little: nobody hikes all of a long-distance route at once. */
export const MAX_CLIMB_MILES = 60;
const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const SAMPLE_METERS = 30;
const SMOOTH_POINTS = 5;
/** Smaller rises are mostly noise in the terrain data, not climbing. */
const CLIMB_THRESHOLD_METERS = 3;

const PNG_SIGNATURE = '89504e470d0a1a0a';

/** Heights in meters from a Terrarium PNG: 8-bit RGB or RGBA, not interlaced. */
export function decodeTerrainPng(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) throw new Error('Not a PNG.');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [bitDepth, colorType, , , interlace] = data.subarray(8, 13);
      channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
      if (bitDepth !== 8 || !channels || interlace !== 0) throw new Error('Unsupported PNG format.');
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  if (!width || raw.length !== (stride + 1) * height) throw new Error('Damaged PNG.');

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const out = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? pixels[out + i - channels] : 0;
      const b = y > 0 ? pixels[out + i - stride] : 0;
      const c = y > 0 && i >= channels ? pixels[out + i - stride - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error('Damaged PNG.');
      pixels[out + i] = (raw[line + i] + predicted) & 0xff;
    }
  }

  const heights = new Float32Array(width * height);
  for (let i = 0; i < heights.length; i += 1) {
    const at = i * channels;
    heights[i] = pixels[at] * 256 + pixels[at + 1] + pixels[at + 2] / 256 - 32768;
  }
  return { width, height, heights };
}

/** Which tile a point falls in, as fractions, so the part after the point locates it in the tile. */
export function tilePosition({ lat, lon }, zoom = TERRAIN_ZOOM) {
  const n = 2 ** zoom;
  const radians = lat * Math.PI / 180;
  return { x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * n };
}

export function tileKey(point, zoom = TERRAIN_ZOOM) {
  const { x, y } = tilePosition(point, zoom);
  return `${zoom}/${Math.floor(x)}/${Math.floor(y)}`;
}

/** Height at a point, blended from the four nearest pixels. Undefined when its tile is missing. */
export function heightAt(point, getTile, zoom = TERRAIN_ZOOM) {
  const tile = getTile(tileKey(point, zoom));
  if (!tile) return undefined;
  const { x, y } = tilePosition(point, zoom);
  // Pixel centers sit half a pixel in. Past the outer half pixel, the edge pixel is close enough.
  const px = Math.max(0, Math.min(tile.width - 1, (x - Math.floor(x)) * tile.width - 0.5));
  const py = Math.max(0, Math.min(tile.height - 1, (y - Math.floor(y)) * tile.height - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, tile.width - 1), y1 = Math.min(y0 + 1, tile.height - 1);
  const fx = px - x0, fy = py - y0;
  const at = (col, row) => tile.heights[row * tile.width + col];
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

/** Points along a line, evenly spaced, with both ends kept. */
export function resampleLine(points, meters = SAMPLE_METERS) {
  if (points.length < 2) return [...points];
  const out = [points[0]];
  let sinceLast = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const segment = milesBetween(a, b) * METERS_PER_MILE;
    let along = meters - sinceLast;
    while (along < segment) {
      const t = along / segment;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
      along += meters;
    }
    sinceLast = segment - (along - meters);
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function smooth(values, size = SMOOTH_POINTS) {
  const reach = Math.floor(size / 2);
  return values.map((_, index) => {
    const from = Math.max(0, index - reach);
    const to = Math.min(values.length - 1, index + reach);
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += values[i];
    return sum / (to - from + 1);
  });
}

/**
 * Total ascent in meters. A rise only counts once it passes the threshold, measured from the lowest
 * point since the last counted rise, so a long gentle climb counts and wobbles don't.
 */
export function ascentMeters(heights, threshold = CLIMB_THRESHOLD_METERS) {
  if (!heights.length) return 0;
  let total = 0;
  let base = heights[0];
  for (const height of heights) {
    if (height < base) base = height;
    else if (height - base >= threshold) { total += height - base; base = height; }
  }
  return total;
}

/**
 * Feet of climb along a trail's lines. A map line can point either way, and a trail into a gorge is
 * mostly downhill on paper but a hard climb back out, so each line counts its harder direction.
 * Undefined if any part has no terrain data.
 */
export function trailClimbFeet(lines, getTile, zoom = TERRAIN_ZOOM) {
  let meters = 0;
  for (const line of lines) {
    const heights = [];
    for (const point of resampleLine(line)) {
      const height = heightAt(point, getTile, zoom);
      if (height === undefined) return undefined;
      heights.push(height);
    }
    const smoothed = smooth(heights);
    meters += Math.max(ascentMeters(smoothed), ascentMeters([...smoothed].reverse()));
  }
  return Math.round(meters * FEET_PER_METER);
}

/** Every tile a trail's samples fall in. */
export function tilesForLines(lines, zoom = TERRAIN_ZOOM) {
  const keys = new Set();
  for (const line of lines) for (const point of resampleLine(line)) keys.add(tileKey(point, zoom));
  return keys;
}
