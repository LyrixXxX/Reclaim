import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import ReclaimIntegrity from '../../modules/reclaim-integrity';
import { AiNutritionResult, validateAiNutritionResult } from '@/lib/nutrition';

const RELAY_URL = 'https://reclaim-nutrition-ai.reclaim-nutrition.workers.dev';
const CLOUD_PROJECT_NUMBER = process.env.EXPO_PUBLIC_RECLAIM_PLAY_INTEGRITY_PROJECT_NUMBER;
const REQUEST_TIMEOUT_MS = 60_000;

export async function parseNutritionText(text: string): Promise<AiNutritionResult> {
  const description = text.trim();
  if (!description) throw new Error('Describe the food or meal first.');
  if (description.length > 4000) throw new Error('Keep the meal description under 4,000 characters.');
  const response = await requestPrivateAiRelay('/v1/parse-food-text', {
    method: 'POST',
    body: JSON.stringify({ text: description, locale: Intl.DateTimeFormat().resolvedOptions().locale }),
  });
  return validateAiNutritionResult(await response.json());
}

export async function parseNutritionLabel(base64: string, mimeType = 'image/jpeg'): Promise<AiNutritionResult> {
  if (!base64) throw new Error('The selected photo could not be prepared for upload.');
  const response = await requestPrivateAiRelay('/v1/parse-nutrition-label', {
    method: 'POST',
    body: JSON.stringify({ imageDataUrl: `data:${mimeType};base64,${base64}` }),
  });
  return validateAiNutritionResult(await response.json());
}

export async function requestPrivateAiRelay(path: string, init: RequestInit) {
  if (Platform.OS !== 'android' || !ReclaimIntegrity) throw new Error('AI requires the Android app installed through Google Play. Manual entry remains available.');
  if (!CLOUD_PROJECT_NUMBER || !/^\d+$/.test(CLOUD_PROJECT_NUMBER)) throw new Error('AI is not ready in this build. Manual entry remains available.');
  if (init.method !== 'POST' || typeof init.body !== 'string') throw new Error('The AI request is invalid.');

  const requestHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${path}\n${init.body}`);
  let integrityToken: string;
  try { integrityToken = await ReclaimIntegrity.token(CLOUD_PROJECT_NUMBER, requestHash); }
  catch { throw new Error('Google Play could not verify this app install for AI. Manual entry remains available.'); }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${RELAY_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Play-Integrity': integrityToken,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      let message = response.status === 429 ? 'AI is temporarily busy. Try again shortly.' : 'AI could not process this request.';
      try {
        const error = await response.json() as { error?: string };
        if (error.error) message = error.error;
      } catch { /* use the safe status message */ }
      throw new Error(message);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI took too long to respond. Try again or enter the information manually.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
