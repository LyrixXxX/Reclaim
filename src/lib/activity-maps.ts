import * as SecureStore from 'expo-secure-store';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { rasterMapStyle, rasterTileCoordinates, rasterTileUrl } from './activity-map-style';

const KEY = 'reclaim-stadia-map-key';
// Expo embeds EXPO_PUBLIC_ variables in the release bundle. Keep the value out
// of source control; a mobile bundle does not make an API key secret.
export async function getMapKey() { return process.env.EXPO_PUBLIC_STADIA_MAPS_KEY?.trim() || (await SecureStore.getItemAsync(KEY)) || ''; }
export async function setMapKey(key: string) { await SecureStore.setItemAsync(KEY, key.trim()); }

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
