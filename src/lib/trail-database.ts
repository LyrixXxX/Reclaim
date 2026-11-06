import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import ReclaimIntegrity from '../../modules/reclaim-integrity';
import { parseTrailDatabase, TrailDatabaseResponse } from '@/lib/trails';

/**
 * Development builds use the test server on this PC (services/trails/import/dev-server.mjs, through
 * `adb reverse tcp:8788 tcp:8788`). Release builds only use the relay once its address is set.
 */
const DEVELOPMENT_URL = 'http://localhost:8788';
const RELEASE_URL = process.env.EXPO_PUBLIC_RECLAIM_TRAILS_URL;
const CLOUD_PROJECT_NUMBER = process.env.EXPO_PUBLIC_RECLAIM_PLAY_INTEGRITY_PROJECT_NUMBER;
const TIMEOUT_MS = 5_000;

/** A token that proves this search came from the Play install. Signed for this exact search. */
async function integrityHeaders(path: string): Promise<Record<string, string> | null> {
  if (Platform.OS !== 'android' || !ReclaimIntegrity || !CLOUD_PROJECT_NUMBER || !/^\d+$/.test(CLOUD_PROJECT_NUMBER)) return null;
  const requestHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${path}\n`);
  return { 'X-Play-Integrity': await ReclaimIntegrity.token(CLOUD_PROJECT_NUMBER, requestHash) };
}

/**
 * Trails from the database, or null when it can't answer. Any failure just means the other trail
 * sources are used, so nothing here is shown to the person as an error.
 */
export async function searchTrailDatabase(latitude: number, longitude: number, radiusMiles: number): Promise<TrailDatabaseResponse | null> {
  const base = __DEV__ ? DEVELOPMENT_URL : RELEASE_URL;
  if (!base || (!__DEV__ && !base.startsWith('https://'))) return null;
  const path = `/v1/trails?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}&radius=${radiusMiles}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = __DEV__ ? {} : await integrityHeaders(path);
    if (!headers) return null;
    const response = await fetch(`${base}${path}`, { headers, signal: controller.signal });
    return response.ok ? parseTrailDatabase(await response.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
