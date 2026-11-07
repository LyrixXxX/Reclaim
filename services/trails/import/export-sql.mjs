/**
 * Writes a built database as SQL for `wrangler d1 execute --remote --file`. It replaces a region's
 * rows rather than the whole table, so regions can be loaded one at a time.
 *
 *   node services/trails/import/export-sql.mjs services/trails/.data/tennessee.sqlite services/trails/.data/tennessee.sql
 */
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error('Usage: node export-sql.mjs <database.sqlite> <output.sql>');
  process.exit(1);
}

export const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
};

const db = new DatabaseSync(source, { readOnly: true });
const lines = [];
for (const table of ['osm_trails', 'tiles']) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  for (const row of rows) {
    const columns = Object.keys(row);
    lines.push(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => sqlValue(row[column])).join(', ')});`);
  }
  console.log(`${table}: ${rows.length.toLocaleString()} rows`);
}
db.close();
writeFileSync(target, `${lines.join('\n')}\n`);
console.log(`${target}: ${(lines.join('\n').length / 1e6).toFixed(1)} MB`);
