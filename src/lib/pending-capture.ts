import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@reclaim/pending-camera/v1';
export type PendingCaptureTarget = 'cpap' | 'labs' | `labs:${string}` | 'nutrition';

export async function setPendingCaptureTarget(target: PendingCaptureTarget) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ target, createdAt: Date.now() }));
}

export async function clearPendingCaptureTarget() {
  await AsyncStorage.removeItem(KEY);
}

export async function consumePendingCaptureTarget(): Promise<PendingCaptureTarget | undefined> {
  const raw = await AsyncStorage.getItem(KEY);
  await AsyncStorage.removeItem(KEY);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as { target?: PendingCaptureTarget; createdAt?: number };
    if (!value.createdAt || Date.now() - value.createdAt > 30 * 60 * 1000) return undefined;
    return value.target;
  } catch { return undefined; }
}
