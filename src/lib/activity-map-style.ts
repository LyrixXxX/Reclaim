import type { StyleSpecification } from '@maplibre/maplibre-react-native';

export function rasterTileUrl(key: string) { return `https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png?api_key=${encodeURIComponent(key)}`; }

// Stadia's raster tiles stop at zoom 20; past that MapLibre enlarges level-20 tiles instead of
// requesting deeper ones, which Stadia rejects with HTTP 400.
export const RASTER_MAX_ZOOM = 20;

export function rasterMapStyle(key: string): StyleSpecification {
  return {
    version: 8,
    sources: { stadia: { type: 'raster', tiles: [rasterTileUrl(key)], tileSize: 256, maxzoom: RASTER_MAX_ZOOM, attribution: '<a href="https://stadiamaps.com/attribution/">© Stadia Maps</a> <a href="https://openmaptiles.org/">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>' } },
    layers: [{ id: 'stadia-base', type: 'raster', source: 'stadia' }],
  };
}

export function rasterTileCoordinates(longitude: number, latitude: number, zoom: number) {
  const scale = 2 ** zoom;
  const x = Math.floor((longitude + 180) / 360 * scale);
  const latitudeRadians = Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2 * scale);
  return { x: Math.max(0, Math.min(scale - 1, x)), y: Math.max(0, Math.min(scale - 1, y)) };
}
