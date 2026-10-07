import * as SecureStore from 'expo-secure-store';
import { OfflineManager } from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { rasterMapStyle, rasterTileCoordinates, rasterTileUrl } from './activity-map-style';

const KEY = 'reclaim-stadia-map-key';
// Expo embeds EXPO_PUBLIC_ variables in the release bundle. Keep the value out
// of source control; a mobile bundle does not make an API key secret.
export async function getMapKey() { return process.env.EXPO_PUBLIC_STADIA_MAPS_KEY?.trim() || (await SecureStore.getItemAsync(KEY)) || ''; }
export async function setMapKey(key: string) { await SecureStore.setItemAsync(KEY, key.trim()); }
export function mapStyle(key: string) { return `https://tiles.stadiamaps.com/styles/outdoors.json?api_key=${encodeURIComponent(key)}`; }

export async function loadMapStyle(key: string, longitude: number, latitude: number): Promise<StyleSpecification> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const { x, y } = rasterTileCoordinates(longitude, latitude, 12);
    const response = await fetch(rasterTileUrl(key).replace('{z}', '12').replace('{x}', String(x)).replace('{y}', String(y)), { signal: controller.signal });
    if (!response.ok) throw new Error(`Map imagery request failed (${response.status}). Check the Stadia Maps key, account status, and connection.`);
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.startsWith('image/')) throw new Error('Map service did not return an image tile. Check Stadia Maps access.');
    return rasterMapStyle(key);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Map service timed out. Check mobile data or Wi-Fi and try again.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function downloadedAreas() {
  const packs = await OfflineManager.getPacks();
  return Promise.all(packs.filter((pack) => pack.metadata.reclaimActivity === true).map(async (pack) => ({ pack, status: await pack.status() })));
}

export async function downloadArea(key: string, latitude: number, longitude: number, radiusMiles: number, onProgress: (percent: number) => void) {
  if (![3, 6].includes(radiusMiles)) throw new Error('Choose a 3 or 6 mile area.');
  if ((await downloadedAreas()).length) throw new Error('Remove the existing downloaded area before choosing a new one.');
  await OfflineManager.setMaximumAmbientCacheSize(5_000_000);
  const radiusKm = radiusMiles * 1.609344;
  const northSouth = radiusKm / 111;
  const eastWest = radiusKm / (111 * Math.max(0.1, Math.cos(latitude * Math.PI / 180)));
  const pack = await OfflineManager.createPack({
    mapStyle: mapStyle(key),
    bounds: [longitude - eastWest, latitude - northSouth, longitude + eastWest, latitude + northSouth],
    minZoom: 9,
    maxZoom: 14,
    metadata: { reclaimActivity: true, label: `${radiusMiles} mi around ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`, createdAt: new Date().toISOString() },
  }, (offlinePack, status) => {
    onProgress(status.percentage);
    if (status.completedResourceSize + status.completedTileSize > 75_000_000) void offlinePack.pause();
  }, () => undefined);
  return pack;
}
