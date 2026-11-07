# Trail database: Phase 1 plan

Status, November 5, 2026: the Worker skeleton and the Tennessee import run on the PC, and the new Find trails screens use them in development builds through a test server. The relay is deployed with Tennessee loaded; release builds use it first and keep today's trail sources elsewhere. 

Decided: map-measured lengths show as "about X mi". In 8 trails checked against published figures, 3 were close and 5 were off by 13% or more.

## Goal

Give every Find trails result real **length**, **climb**, **difficulty** and a **parking spot for directions**, from free public data, with no user data collected. Users' hike summaries (Phase 2) and photos and conditions (Phase 3) build on this later.

Today a result is a name, a type and a straight-line distance. After Phase 1, a typical card reads:

> **Ozone Falls Trail** · 0.8 mi · 180 ft climb · Easy · Parking 0.1 mi away · Directions

## Out of scope for Phase 1

- No user-submitted data, accounts or photos. Photos stay as they are today (Wikimedia, when a trail links to it).
- No Google Places. It can be added later for photos only.
- No change to how Routes records hikes.

## Data sources

| Source | What we use | License | Access |
|---|---|---|---|
| OpenStreetMap | Trail paths (`highway=path/footway`, `route=hiking`), names, `sac_scale`, `surface`, trailheads, parking | **ODbL, share-alike** | Regional extracts (Geofabrik) processed offline, or Overpass for areas not imported yet |
| US Forest Service, `EDW_TrailNFSPublish_01` MapServer | `trail_name`, `trail_no`, `gis_miles`, `trail_class` (TC1–TC5), `typical_trail_grade`, `trail_surface`, allowed uses (hiker, bike, horse…) | Public domain | ArcGIS REST, polylines, 2,000 records per query |
| National Park Service API | Park boundaries and visitor info; hikes if `thingstodo` has them (not confirmed, check before relying on it) | Public domain | Free key, 1,000 requests an hour |
| Elevation: Stadia Elevation API (`/elevation/v1`) | Heights along a trail path, sent as an encoded polyline | Covered by our existing Stadia key | One request per trail; check credit cost per request |
| Wikimedia Commons | Photos, as today | CC with credit | Unchanged |

USGS 3DEP elevation (public domain) is a free fallback if Stadia elevation credits get expensive.

### Licensing rule (ODbL)

If we publish or share a database built from OpenStreetMap, the combined database must be offered under ODbL. To keep our own data free of that:

- Store OpenStreetMap-derived rows in **their own tables** (`osm_trails`, `osm_points`), marked with `source = 'osm'`.
- Keep Forest Service, Park Service and, later, user data in **separate tables** that don't copy OpenStreetMap geometry into them.
- Values computed from OpenStreetMap geometry, like length and climb, count as derived data and stay in the OpenStreetMap tables.
- Credit "© OpenStreetMap contributors" wherever OpenStreetMap data shows (already done in the app).

## Architecture

A new Cloudflare Worker, `services/trails`, built like `services/nutrition-ai`:

- **Play Integrity** on requests, using the shared `play-integrity.mjs` code, plus the same per-address and global rate limits.
- **D1** (Cloudflare's SQL database) holds the trail data.
- **Cron Trigger** refreshes areas in the background.
- **No user data stored.** Requests only carry the search area, which Find trails already sends today.

```
App (Find trails)
  └─ GET /v1/trails?lat=&lon=&radius=   (Play Integrity token in header)
        └─ Worker
             ├─ looks up area tiles in D1 → returns trails
             └─ missing or stale tile → fills it (Overpass + Forest Service + elevation), then returns
```

### Area tiles

- The world is split into tiles of 0.1° × 0.1° (about 7 × 5.5 miles in Tennessee). A search covers every tile its circle touches.
- Each tile is filled once and refreshed **every 30 days**, or sooner if someone searches it after it's older than that.
- Filling a tile happens in the background where possible: the first search returns what's already stored and the rest fills in. For a brand-new tile, we either wait (up to about 10 seconds) or return Stadia-only results like today.

### Getting the data in

Two ways, used together:

1. **Bulk import by state, for areas we know matter (start with Tennessee).** A script on the PC (Node with `osmium` or `osm-pbf-parser`) reads the Geofabrik Tennessee extract, builds trails, computes length and climb, and uploads to D1 with `wrangler d1 execute`. This avoids the public Overpass servers entirely. Re-run monthly.
2. **On demand everywhere else.** The Worker fills an unknown tile from Overpass, with a small query limited to that tile, and from the Forest Service service. A Worker's address isn't the home network that got throttled, but Overpass etiquette still applies: identify ourselves, keep queries small, cache 30 days.

## Data model (D1)

```sql
-- Area bookkeeping
CREATE TABLE tiles (
  tile_id TEXT PRIMARY KEY,          -- "lat10:lon10", e.g. "359:-850"
  filled_at INTEGER NOT NULL,        -- unix seconds
  source_versions TEXT               -- e.g. OSM extract date
);

-- OpenStreetMap-derived (ODbL)
CREATE TABLE osm_trails (
  id TEXT PRIMARY KEY,               -- "relation/123" or a merged "way/…" group id; matches app ids
  tile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                -- trail | path | trailhead | waterfall
  path TEXT,                         -- encoded polyline (precision 5)
  length_mi REAL,
  climb_ft INTEGER,                  -- total ascent, smoothed
  sac_scale TEXT,
  surface TEXT,
  parking_lat REAL, parking_lon REAL,
  center_lat REAL NOT NULL, center_lon REAL NOT NULL,
  wikidata TEXT, wikipedia TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX osm_trails_tile ON osm_trails(tile_id);

-- Forest Service (public domain)
CREATE TABLE usfs_trails (
  trail_cn TEXT PRIMARY KEY,
  tile_id TEXT NOT NULL,
  name TEXT, trail_no TEXT,
  miles REAL, trail_class TEXT, grade TEXT, surface TEXT,
  hiker_allowed INTEGER,
  center_lat REAL NOT NULL, center_lon REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX usfs_trails_tile ON usfs_trails(tile_id);

-- Links between the two, filled by name + distance matching
CREATE TABLE trail_links (osm_id TEXT, usfs_cn TEXT, PRIMARY KEY (osm_id, usfs_cn));
```

The API response merges these into the same `TrailResult` shape the app uses now, plus `climbFt`, `difficultySource` (`official` | `osm` | `estimated`) and `parking`.

## Computing the numbers

**Length.**
- Join the pieces of a trail: one hiking route, or path pieces with the same name that touch.
- Add up the distance between consecutive points (the haversine formula, already in `src/lib/trails.ts`).
- Prefer the Forest Service's `gis_miles` when a trail is matched to it.

**Climb.**
1. Resample the path every 30 m.
2. Get elevations in one Stadia request.
3. Smooth with a 5-point moving average.
4. Add up the rises larger than 3 m, so noise doesn't count as climbing.
5. Store the total ascent in feet.

Each piece of a trail counts its harder direction, since a map line can point either way and a hike into a gorge needs the climb back out. Label it "climb", not "elevation gain round trip".

Terrain data is the free USGS tile set on AWS Open Data, chosen over Stadia Elevation (5 credits per request) because it has no ongoing cost and runs on the PC.

**Difficulty,** using the first source available:
1. **Forest Service `trail_class`:**
   - TC1 or TC2 → Difficult (primitive tread)
   - TC3 → Moderate
   - TC4 or TC5 → Easy (developed)

   Check this mapping against Forest Service definitions; class describes how developed the tread is, not steepness, so it only applies when no climb data exists.
2. **OpenStreetMap `sac_scale`:** already mapped in the app (hiking → Easy, mountain_hiking → Moderate…).
3. **Estimated with the Shenandoah formula:** rating = √(climb_ft × 2 × miles).
   - Under 50 → Easy
   - 50–100 → Moderate
   - 100–150 → Moderately strenuous
   - 150–200 → Strenuous
   - Over 200 → Very strenuous

   Shown as "(estimated)".

**Parking spot.**
- Use the nearest `highway=trailhead` or `amenity=parking` within 0.3 mi of either end of the trail.
- If there's none, use the trail end closest to a road.
- Directions use this point instead of the trail's middle.

## App changes

- `src/lib/trails.ts`: add `searchTrailDatabase()` that calls the Worker. Find trails asks the Worker first and falls back to today's Stadia search and Overpass if the Worker fails or takes more than 5 seconds.
- **List row:** "0.8 mi · 180 ft climb · Easy". Hide anything we don't know instead of showing blanks.
- **Details sheet:** draw the trail's path on the map preview, not just a pin, and add a small elevation profile. The data is already there once `path` and heights exist.
- **Directions** go to `parking` when it's known.
- **Saved trails** keep working: ids stay the same OpenStreetMap ids.
- **Privacy text** (in-app and lyrixstudios.com): trail searches go through the Lyrix Studios relay, which looks up the area and stores nothing about the person.

## Cost (rough, to confirm)

- **Workers Paid plan,** about $5 a month, which includes D1 storage and reads well beyond Phase 1's needs.
- **D1 size:** Tennessee has on the order of tens of thousands of named trail pieces, which fits in a few hundred MB at most.
- **Stadia elevation:** one request per trail when it's added or refreshed, not per search. Check the credit cost per request on our plan before the bulk import.
- **Overpass and Forest Service:** free, with polite use.

## Milestones

1. **Worker skeleton.** `services/trails` with Play Integrity, rate limits, D1 schema and a `/v1/trails` endpoint returning the current Stadia-style results from D1. Tests use `worker.test.mjs` like nutrition-ai.
2. **Tennessee import script.** From the Geofabrik extract to D1: trails, length, parking. Check counts and spot-check 20 trails near Crossville against known lengths.
3. **Climb and difficulty.** Elevation through Stadia, climb smoothing and the difficulty rules. Spot-check against published values for Ozone Falls, Virgin Falls and Black Mountain.
4. **Forest Service merge.** Match by name and distance, then prefer official miles and class.
5. **App switch-over.** Call the Worker first, fall back to the current sources, update the row and details sheet, update privacy text.
6. **On-demand tiles** for areas outside the imported states, with the 30-day refresh.

## Driving distance

The list shows straight-line miles to the closest way onto a trail. The app doesn't show drive times: an earlier version looked them up from Stadia Routing when a trail was opened, but they didn't always match Google Maps, which gives the time anyway once you press Directions.

## Later idea: lengths from walked routes (not started)

When someone records a hike that starts at a known trail, their route could give a more accurate length than the map. Two stages:

1. **On the phone only.** Match the recorded route to the trail and show "You walked 4.1 mi" on that trail's details. Nothing leaves the device.
2. **Shared, opt-in.** Send only the trail id, miles and climb, never the GPS track, and show a shared figure once several people's hikes agree. This needs clear consent and updated privacy text, since Find trails currently stores nothing about a person.

A hike only counts when the route stays on the trail for most of its length. The start alone doesn't show which trail was walked or how far. Shortcuts, turnarounds and GPS drift need filtering, and one-way and round-trip hikes must be told apart.

## Open questions

- Should Phase 1 launch with Tennessee only (imported) plus the current behavior elsewhere, or wait for on-demand tiles?
- Does the NPS `thingstodo` endpoint include hike length and difficulty? If yes, it's worth adding for national parks.
- What does Stadia charge per elevation request on our plan? This decides Stadia vs USGS for climb.
- Is the Forest Service `trail_class` to difficulty mapping good enough to show without "(estimated)"?
