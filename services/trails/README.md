# Reclaim trails relay

A Cloudflare Worker that answers Find trails searches from a D1 database of public trail data. It stores nothing about the person searching: requests carry only a search area, and the query string is redacted from logs. See `docs/plans/trail-database.md` for the full plan.

**Nothing has been deployed or created yet.** The Worker's database starts empty. The import below builds a database on this PC only, and uploading it is a later step.

## API

`GET /v1/trails?lat=&lon=&radius=` with a Play Integrity token in `X-Play-Integrity`. `radius` is in miles, up to 50.

The token's request hash must be the SHA-256 of `` `${path}?${query}\n` ``, using the exact path and query string sent, which binds it to that search. There is no shared-token route.

```json
{ "trails": [], "coverage": "none", "attribution": "© OpenStreetMap contributors" }
```

- `trails` is the 60 closest, in the app's `TrailResult` shape plus `climbFt`, `difficultySource`, `parking` and `path`. Unknown values are left out, as is a `path` over 8,000 characters. `distanceMiles` is to the nearest point of the trail.
- The lowest `sac_scale` value, `hiking`, isn't shown as a difficulty: it gets put on most trails, hard ones too.
- `coverage` is `full`, `partial` or `none`: how many of the searched tiles have been imported. The app should use its current sources unless it's `full`, since an empty list can mean "not imported yet".

Limits are the same as the nutrition relay: 6 requests per address per minute and 30 per Cloudflare location per minute. Both are approximate and location-local.

## Importing a region

`import/` builds a local SQLite database from a Geofabrik extract. It has its own `package.json`, so the app's dependencies don't change.

```powershell
npm install --prefix services/trails/import --ignore-scripts
node services/trails/import/import-region.mjs services/trails/.data/tennessee-latest.osm.pbf services/trails/.data/tennessee.sqlite
```

- To try a database in the dev app, run `dev-server.mjs` (the `trails-test-data` entry in `.claude/launch.json`) and `adb reverse tcp:8788 tcp:8788`. It has no Play Integrity check, listens on this PC only, and only development builds call it. Stop it before re-importing, since Windows won't replace an open database.
- `services/trails/.data/` is gitignored and holds extracts and built databases. Tennessee takes about a minute and makes a 1 MB database.
- `osm-pbf-parser-node` is pinned because npm marks it as no longer supported. Its code was read before use: it only reads the file and decompresses it. Re-check it before changing versions.
- `path` holds encoded polylines, with spaces between the pieces of a trail that doesn't connect.
- Only tiles surrounded by other tiles with map data are marked filled. A border tile may be cut off, so it stays unfilled until the neighboring region is imported.
- Not done yet: climb, estimated difficulty, the Forest Service merge, parking from the nearest road, and uploading to D1.

## Licensing

OpenStreetMap data is ODbL, so derived rows stay in `osm_trails`. Forest Service data stays in `usfs_trails` and never copies OpenStreetMap geometry or computed values. `trail_links` only holds ids.

## Testing

```powershell
npm run test:trails
```

Tests run the real migration in Node's built-in SQLite, so no Cloudflare account is needed.

## Deployment (not done yet)

Each of these creates or changes something on the Cloudflare account:

```powershell
npx wrangler@latest d1 create reclaim-trails          # then put the id in wrangler.jsonc
npx wrangler@latest d1 migrations apply reclaim-trails --remote
npx wrangler@latest secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler@latest deploy
```

`GOOGLE_SERVICE_ACCOUNT_JSON` can be the same service account the nutrition relay uses. Never put it, or any other key, in the app or repository.
