export const APP_LOCK_VERSION = 1;
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_COOLDOWN_MS = 30_000;

export type AppLockConfig = {
  version: typeof APP_LOCK_VERSION;
  pinSalt: string;
  pinHash: string;
  biometricEnabled: boolean;
};

export type PinAttemptState = {
  failedAttempts: number;
  blockedUntil?: number;
};

export type AppLockLifecycleState = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export function canStartBiometricUnlock({
  appState,
  available,
  attempted,
  enabled,
  loading,
}: {
  appState: AppLockLifecycleState;
  available: boolean;
  attempted: boolean;
  enabled: boolean;
  loading: boolean;
}) {
  return appState === 'active' && available && enabled && !attempted && !loading;
}

export function canApplyUnlockResult(attempt: number, currentAttempt: number, appState: AppLockLifecycleState) {
  return attempt === currentAttempt && appState === 'active';
}

export function pinValidationMessage(pin: string) {
  if (!/^\d+$/.test(pin)) return 'Use numbers only.';
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    return `Use ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`;
  }
  return undefined;
}

export function parseAppLockConfig(value: string | null): AppLockConfig | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<AppLockConfig>;
    if (
      parsed.version !== APP_LOCK_VERSION
      || typeof parsed.pinSalt !== 'string'
      || !parsed.pinSalt
      || typeof parsed.pinHash !== 'string'
      || !parsed.pinHash
      || typeof parsed.biometricEnabled !== 'boolean'
    ) return undefined;
    return parsed as AppLockConfig;
  } catch {
    return undefined;
  }
}

export function secureStringEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function registerFailedPinAttempt(state: PinAttemptState, now = Date.now()): PinAttemptState {
  if (state.blockedUntil && state.blockedUntil > now) return state;
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts < MAX_PIN_ATTEMPTS) return { failedAttempts };
  return { failedAttempts: 0, blockedUntil: now + PIN_COOLDOWN_MS };
}

export function remainingPinCooldown(state: PinAttemptState, now = Date.now()) {
  return Math.max(0, (state.blockedUntil ?? 0) - now);
}
