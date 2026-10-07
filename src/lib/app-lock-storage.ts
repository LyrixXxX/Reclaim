import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { APP_LOCK_VERSION, AppLockConfig, parseAppLockConfig, secureStringEqual } from '@/lib/app-lock';

const APP_LOCK_KEY = 'reclaim.app-lock.v1';
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadAppLockConfig() {
  if (!(await SecureStore.isAvailableAsync())) return undefined;
  return parseAppLockConfig(await SecureStore.getItemAsync(APP_LOCK_KEY, secureStoreOptions));
}

export async function createAppLockConfig(pin: string, biometricEnabled: boolean): Promise<AppLockConfig> {
  const pinSalt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  return {
    version: APP_LOCK_VERSION,
    pinSalt,
    pinHash: await hashPin(pin, pinSalt),
    biometricEnabled,
  };
}

export async function saveAppLockConfig(config: AppLockConfig) {
  if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure storage is unavailable on this device.');
  await SecureStore.setItemAsync(APP_LOCK_KEY, JSON.stringify(config), secureStoreOptions);
}

export async function deleteAppLockConfig() {
  await SecureStore.deleteItemAsync(APP_LOCK_KEY, secureStoreOptions);
}

export async function verifyAppLockPin(config: AppLockConfig, pin: string) {
  return secureStringEqual(config.pinHash, await hashPin(pin, config.pinSalt));
}

async function hashPin(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
