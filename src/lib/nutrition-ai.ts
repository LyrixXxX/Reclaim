import * as SecureStore from 'expo-secure-store';

import { AiNutritionResult, validateAiNutritionResult } from '@/lib/nutrition';

const CONFIG_KEY = 'reclaim.nutrition-ai.v1';
const REQUEST_TIMEOUT_MS = 60_000;

export type NutritionAiConfig = {
  endpoint: string;
  accessToken: string;
  consentedAt: string;
};

export async function loadNutritionAiConfig(): Promise<NutritionAiConfig | undefined> {
  const raw = await SecureStore.getItemAsync(CONFIG_KEY);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<NutritionAiConfig>;
    if (!value.endpoint || !value.accessToken || !value.consentedAt) return undefined;
    return { endpoint: value.endpoint, accessToken: value.accessToken, consentedAt: value.consentedAt };
  } catch {
    return undefined;
  }
}

export async function saveNutritionAiConfig(endpoint: string, accessToken: string) {
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized.startsWith('https://') && !normalized.startsWith('http://localhost')) throw new Error('Enter a secure HTTPS relay address.');
  if (accessToken.trim().length < 20) throw new Error('Enter the full relay access token.');
  const config: NutritionAiConfig = { endpoint: normalized, accessToken: accessToken.trim(), consentedAt: new Date().toISOString() };
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return config;
}

export async function clearNutritionAiConfig() {
  await SecureStore.deleteItemAsync(CONFIG_KEY);
}

export async function testNutritionAiConnection(config?: NutritionAiConfig) {
  const resolved = config ?? await requireConfig();
  const response = await request(resolved, '/v1/health', { method: 'GET' });
  const value = await response.json() as { ok?: boolean; model?: string };
  if (!value.ok) throw new Error('The relay did not confirm a healthy connection.');
  return value;
}

export async function parseNutritionText(text: string): Promise<AiNutritionResult> {
  const description = text.trim();
  if (!description) throw new Error('Describe the food or meal first.');
  if (description.length > 4000) throw new Error('Keep the meal description under 4,000 characters.');
  const config = await requireConfig();
  const response = await request(config, '/v1/parse-food-text', {
    method: 'POST',
    body: JSON.stringify({ text: description, locale: Intl.DateTimeFormat().resolvedOptions().locale }),
  });
  return validateAiNutritionResult(await response.json());
}

export async function parseNutritionLabel(base64: string, mimeType = 'image/jpeg'): Promise<AiNutritionResult> {
  if (!base64) throw new Error('The selected photo could not be prepared for upload.');
  const config = await requireConfig();
  const response = await request(config, '/v1/parse-nutrition-label', {
    method: 'POST',
    body: JSON.stringify({ imageDataUrl: `data:${mimeType};base64,${base64}` }),
  });
  return validateAiNutritionResult(await response.json());
}

export async function requestPrivateAiRelay(path: string, init: RequestInit) {
  return request(await requireConfig(), path, init);
}

async function requireConfig() {
  const config = await loadNutritionAiConfig();
  if (!config) throw new Error('Private AI is not connected. Open Private AI Setup from Settings first.');
  return config;
}

async function request(config: NutritionAiConfig, path: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.endpoint}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      let message = response.status === 429 ? 'The private AI relay is temporarily rate-limited. Try again shortly.' : 'Private AI could not process this request.';
      try {
        const error = await response.json() as { error?: string };
        if (error.error) message = error.error;
      } catch { /* use the safe status message */ }
      throw new Error(message);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Private AI took too long to respond. Try again or enter the information manually.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeEndpoint(value: string) {
  return value.trim().replace(/\/+$/, '');
}
