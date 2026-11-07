/**
 * Serves a locally built trail database, so the dev app can show real data without anything on
 * Cloudflare. For testing on this PC only: it has no Play Integrity check, so it listens on this
 * machine alone and the phone reaches it through `adb reverse tcp:8788 tcp:8788`.
 *
 *   node services/trails/import/dev-server.mjs services/trails/.data/tennessee.sqlite
 */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

import { findTrails, parseSearch } from '../worker.mjs';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node dev-server.mjs <database.sqlite>');
  process.exit(1);
}
const PORT = 8788;
const sqlite = new DatabaseSync(file, { readOnly: true });

/** The part of D1's API that findTrails uses. */
const db = {
  prepare: (sql) => ({ bind: (...params) => ({ run: () => ({ results: sqlite.prepare(sql).all(...params) }) }) }),
  batch: async (statements) => statements.map((statement) => statement.run()),
};

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const send = (status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'GET' || url.pathname !== '/v1/trails') return send(404, { error: 'Not found.' });
  const search = parseSearch(url.searchParams);
  if (!search) return send(400, { error: 'Send lat, lon and a radius of up to 50 miles.' });
  try {
    const found = await findTrails(db, search);
    console.log(`${found.trails.length} trails, coverage ${found.coverage}`);
    return send(200, found);
  } catch (error) {
    console.error(error);
    return send(503, { error: 'Trail search failed.' });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Trail test data on http://localhost:${PORT}/v1/trails`));
