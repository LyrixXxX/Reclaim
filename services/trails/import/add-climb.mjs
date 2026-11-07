/**
 * Adds climb to a database made by import-region.mjs, from free USGS terrain tiles on AWS Open Data.
 * Tiles stay in a cache folder, so re-running after an import downloads nothing new.
 *
 *   node services/trails/import/add-climb.mjs services/trails/.data/tennessee.sqlite services/trails/.data/terrain
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { decodePath } from '../worker.mjs';
import { decodeTerrainPng, MAX_CLIMB_MILES, tilesForLines, trailClimbFeet } from './elevation.mjs';

const [target, cache] = process.argv.slice(2);
if (!target || !cache) {
  console.error('Usage: node add-climb.mjs <database.sqlite> <terrain cache folder>');
  process.exit(1);
}
const TILE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium';
const CONCURRENT_DOWNLOADS = 6;
const USER_AGENT = 'Reclaim trail import (https://lyrixstudios.com)';

const started = Date.now();
const log = (message) => console.log(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s] ${message}`);

const db = new DatabaseSync(target);
const toLines = (path) => path.split(' ').map(decodePath).filter((line) => line.length > 1);
const trails = db.prepare('SELECT id, path FROM osm_trails WHERE path IS NOT NULL AND length_mi IS NOT NULL AND length_mi <= ?').all(MAX_CLIMB_MILES)
  .map((row) => ({ id: row.id, lines: toLines(row.path) }));

const needed = new Set();
for (const trail of trails) for (const key of tilesForLines(trail.lines)) needed.add(key);
const fileFor = (key) => join(cache, `${key}.png`);
const missing = [...needed].filter((key) => !existsSync(fileFor(key)));
log(`${trails.length.toLocaleString()} trails need ${needed.size.toLocaleString()} tiles, ${missing.length.toLocaleString()} not downloaded yet`);

let downloaded = 0;
let bytes = 0;
const failed = new Set();
async function download(key) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${TILE_URL}/${key}.png`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
      if (response.status === 404) break;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      decodeTerrainPng(body); // Never cache a damaged or unexpected file.
      const file = fileFor(key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, body);
      renameSync(`${file}.tmp`, file);
      downloaded += 1;
      bytes += body.length;
      if (downloaded % 250 === 0) log(`Downloaded ${downloaded.toLocaleString()} tiles, ${(bytes / 1e6).toFixed(0)} MB`);
      return;
    } catch {
      // Try again below.
    }
  }
  failed.add(key);
}
const queue = [...missing];
await Promise.all(Array.from({ length: CONCURRENT_DOWNLOADS }, async () => {
  while (queue.length) await download(queue.pop());
}));
log(`Downloaded ${downloaded.toLocaleString()} tiles, ${(bytes / 1e6).toFixed(0)} MB. Failed or missing: ${failed.size}`);

// Decoded tiles are large, so only recent ones stay in memory.
const MAX_LOADED = 256;
const loaded = new Map();
const getTile = (key) => {
  if (loaded.has(key)) return loaded.get(key);
  if (loaded.size >= MAX_LOADED) loaded.delete(loaded.keys().next().value);
  const file = fileFor(key);
  const tile = existsSync(file) ? decodeTerrainPng(readFileSync(file)) : null;
  loaded.set(key, tile);
  return tile;
};

const update = db.prepare('UPDATE osm_trails SET climb_ft = ? WHERE id = ?');
let measured = 0;
db.exec('BEGIN');
for (const trail of trails) {
  const feet = trailClimbFeet(trail.lines, getTile);
  if (feet === undefined) continue;
  update.run(feet, trail.id);
  measured += 1;
}
db.exec('COMMIT');
db.close();
log(`Measured climb on ${measured.toLocaleString()} of ${trails.length.toLocaleString()} trails`);
if (failed.size) console.log(`Re-run to retry the ${failed.size} tiles that failed.`);
