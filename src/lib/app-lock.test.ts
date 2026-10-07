import {
  APP_LOCK_VERSION,
  MAX_PIN_ATTEMPTS,
  PIN_COOLDOWN_MS,
  canApplyUnlockResult,
  canStartBiometricUnlock,
  parseAppLockConfig,
  pinValidationMessage,
  registerFailedPinAttempt,
  remainingPinCooldown,
  secureStringEqual,
} from './app-lock';

describe('app lock', () => {
  test('accepts a 4–8 digit PIN and rejects weak input shapes', () => {
    expect(pinValidationMessage('1234')).toBeUndefined();
    expect(pinValidationMessage('12345678')).toBeUndefined();
    expect(pinValidationMessage('123')).toBe('Use 4–8 digits.');
    expect(pinValidationMessage('123456789')).toBe('Use 4–8 digits.');
    expect(pinValidationMessage('12a4')).toBe('Use numbers only.');
  });

  test('parses only complete supported secure-store records', () => {
    const valid = { version: APP_LOCK_VERSION, pinSalt: 'salt', pinHash: 'hash', biometricEnabled: true };
    expect(parseAppLockConfig(JSON.stringify(valid))).toEqual(valid);
    expect(parseAppLockConfig('{broken')).toBeUndefined();
    expect(parseAppLockConfig(JSON.stringify({ ...valid, pinHash: '' }))).toBeUndefined();
    expect(parseAppLockConfig(JSON.stringify({ ...valid, version: 99 }))).toBeUndefined();
  });

  test('compares stored PIN hashes without returning early for matching lengths', () => {
    expect(secureStringEqual('abcdef', 'abcdef')).toBe(true);
    expect(secureStringEqual('abcdef', 'abcdeg')).toBe(false);
    expect(secureStringEqual('short', 'longer')).toBe(false);
  });

  test('temporarily blocks PIN entry after repeated failures', () => {
    const startedAt = 1_000;
    let state = { failedAttempts: 0 };
    for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
      state = registerFailedPinAttempt(state, startedAt);
    }
    expect(state).toEqual({ failedAttempts: 0, blockedUntil: startedAt + PIN_COOLDOWN_MS });
    expect(remainingPinCooldown(state, startedAt + 10_000)).toBe(20_000);
    expect(remainingPinCooldown(state, startedAt + PIN_COOLDOWN_MS)).toBe(0);
  });

  test('starts automatic biometrics only while the app is active', () => {
    const ready = { available: true, attempted: false, enabled: true, loading: false };
    expect(canStartBiometricUnlock({ ...ready, appState: 'active' })).toBe(true);
    expect(canStartBiometricUnlock({ ...ready, appState: 'background' })).toBe(false);
    expect(canStartBiometricUnlock({ ...ready, appState: 'inactive' })).toBe(false);
    expect(canStartBiometricUnlock({ ...ready, appState: 'active', attempted: true })).toBe(false);
  });

  test('ignores interrupted or stale biometric results', () => {
    expect(canApplyUnlockResult(3, 3, 'active')).toBe(true);
    expect(canApplyUnlockResult(2, 3, 'active')).toBe(false);
    expect(canApplyUnlockResult(3, 3, 'background')).toBe(false);
  });
});
