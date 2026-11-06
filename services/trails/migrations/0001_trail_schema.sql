-- Trail database, Phase 1. See docs/plans/trail-database.md.
-- No table here holds anything about a person. Licensing rule: OpenStreetMap-derived data (ODbL)
-- stays in osm_* tables, and Forest Service or later user data never copies its geometry or values.

-- Area bookkeeping
CREATE TABLE tiles (
  tile_id TEXT PRIMARY KEY,          -- "lat10:lon10", e.g. "359:-850"
  filled_at INTEGER NOT NULL,        -- unix seconds
  source_versions TEXT               -- e.g. OSM extract date
);

-- OpenStreetMap-derived (ODbL)
CREATE TABLE osm_trails (
  id TEXT PRIMARY KEY,               -- "relation/123" or a merged "way/..." group id; matches app ids
  source TEXT NOT NULL DEFAULT 'osm' CHECK (source = 'osm'),
  tile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('trail', 'path', 'trailhead', 'waterfall')),
  path TEXT,                         -- encoded polylines (precision 5), space-separated pieces
  length_mi REAL,
  climb_ft INTEGER,                  -- total ascent, smoothed
  sac_scale TEXT,
  surface TEXT,
  parking_lat REAL,
  parking_lon REAL,
  access_points TEXT,                -- every parking lot or trailhead along it: "lat,lon lat,lon"
  center_lat REAL NOT NULL,
  center_lon REAL NOT NULL,
  wikidata TEXT,
  wikipedia TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX osm_trails_tile ON osm_trails(tile_id);

-- Forest Service (public domain)
CREATE TABLE usfs_trails (
  trail_cn TEXT PRIMARY KEY,
  tile_id TEXT NOT NULL,
  name TEXT,
  trail_no TEXT,
  miles REAL,
  trail_class TEXT,
  grade TEXT,
  surface TEXT,
  hiker_allowed INTEGER,
  center_lat REAL NOT NULL,
  center_lon REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX usfs_trails_tile ON usfs_trails(tile_id);

-- Links between the two, filled by name + distance matching
CREATE TABLE trail_links (
  osm_id TEXT NOT NULL,
  usfs_cn TEXT NOT NULL,
  PRIMARY KEY (osm_id, usfs_cn)
);
