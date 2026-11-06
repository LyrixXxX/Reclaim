import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import ReclaimIntegrity from '../../modules/reclaim-integrity';
import { parseTrailDatabase, TrailDatabaseResponse } from '@/lib/trails';

/**
 * Development builds use the test server on this PC (services/trails/import/dev-server.mjs, through
 * `adb reverse tcp:8788 tcp:8788`), since the relay only answers Google Play installs.
 */
const DEVELOPMENT_URL = 'http://localhost:8788';
const RELEASE_URL = 'https://reclaim-trails.reclaim-nutrition.workers.dev';
const CLOUD_PROJECT_NUMBER = process.env.EXPO_PUBLIC_RECLAIM_PLAY_INTEGRITY_PROJECT_NUMBER;
/** The first token after opening the app can take several seconds, so it gets its own limit. */
const TOKEN_TIMEOUT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 8_000;

/** A token that proves this search came from the Play install. Signed for this exact search. */
async function integrityHeaders(path: string): Promise<Record<string, string> | null> {
  if (Platform.OS !== 'android' || !ReclaimIntegrity || !CLOUD_PROJECT_NUMBER || !/^\d+$/.test(CLOUD_PROJECT_NUMBER)) return null;
  const requestHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${path}\n`);
  const token = ReclaimIntegrity.token(CLOUD_PROJECT_NUMBER, requestHash);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS); });
  try {
    const value = await Promise.race([token, timeout]);
    return value ? { 'X-Play-Integrity': value } : null;
  } finally {
    clearTimeout(timer);
    token.catch(() => undefined); // A token that fails after the limit has nobody left to tell.
  }
}

/**
 * Trails from the database, or null when it can't answer. Any failure just means the other trail
 * sources are used, so nothing here is shown to the person as an error.
 */
export async function searchTrailDatabase(latitude: number, longitude: number, radiusMiles: number): Promise<TrailDatabaseResponse | null> {
  const path = `/v1/trails?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}&radius=${radiusMiles}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const headers = __DEV__ ? {} : await integrityHeaders(path);
    if (!headers) return null;
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(`${__DEV__ ? DEVELOPMENT_URL : RELEASE_URL}${path}`, { headers, signal: controller.signal });
    return response.ok ? parseTrailDatabase(await response.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
