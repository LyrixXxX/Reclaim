import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { AppLockConfig, canApplyUnlockResult, canResumeWithoutUnlock, PinAttemptState, pinValidationMessage, registerFailedPinAttempt, remainingPinCooldown } from '@/lib/app-lock';
import { createAppLockConfig, deleteAppLockConfig, loadAppLockConfig, saveAppLockConfig, verifyAppLockPin } from '@/lib/app-lock-storage';

type Result = { ok: true } | { ok: false; message: string };

type AppLockContextValue = {
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricLabel: string;
  enableAppLock: (pin: string, useBiometrics: boolean) => Promise<Result>;
  disableAppLock: (pin: string) => Promise<Result>;
  changePin: (currentPin: string, newPin: string) => Promise<Result>;
  setBiometricEnabled: (enabled: boolean) => Promise<Result>;
  unlockWithPin: (pin: string) => Promise<Result>;
  unlockWithBiometrics: () => Promise<Result>;
  lockNow: () => void;
};

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined);

export function AppLockProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<AppLockConfig>();
  const [locked, setLocked] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [pinAttempts, setPinAttempts] = useState<PinAttemptState>({ failedAttempts: 0 });
  const configRef = useRef<AppLockConfig | undefined>(undefined);
  const authenticatingRef = useRef(false);
  const unlockAttemptRef = useRef(0);
  const lockedRef = useRef(true);
  const backgroundedAtRef = useRef<number | undefined>(undefined);
  const resumeEligibleRef = useRef(false);

  const updateLocked = (next: boolean) => {
    lockedRef.current = next;
    setLocked(next);
  };

  useEffect(() => {
    let active = true;
    Promise.all([loadAppLockConfig(), biometricDetails().catch(() => ({ available: false, label: 'Biometrics' }))])
      .then(([saved, biometrics]) => {
        if (!active) return;
        configRef.current = saved;
        setConfig(saved);
        updateLocked(Boolean(saved));
        setBiometricAvailable(biometrics.available);
        setBiometricLabel(biometrics.label);
      })
      .catch(() => {
        if (!active) return;
        configRef.current = undefined;
        setConfig(undefined);
        updateLocked(false);
      })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // Cover private content in Android's recent-apps preview immediately.
        // Only an already-unlocked session can use the short return grace period.
        if (backgroundedAtRef.current === undefined) {
          backgroundedAtRef.current = Date.now();
          resumeEligibleRef.current = Boolean(configRef.current) && !lockedRef.current;
        }
        unlockAttemptRef.current += 1;
        if (authenticatingRef.current) {
          authenticatingRef.current = false;
          void LocalAuthentication.cancelAuthenticate().catch(() => undefined);
        }
        if (configRef.current) updateLocked(true);
      } else if (state === 'active' && backgroundedAtRef.current !== undefined) {
        const resume = resumeEligibleRef.current && canResumeWithoutUnlock(backgroundedAtRef.current);
        backgroundedAtRef.current = undefined;
        resumeEligibleRef.current = false;
        if (resume && configRef.current) updateLocked(false);
      }
    });
    return () => subscription.remove();
  }, []);

  const replaceConfig = (next: AppLockConfig | undefined) => {
    configRef.current = next;
    setConfig(next);
  };

  const checkPin = async (pin: string) => {
    const saved = configRef.current;
    if (!saved) return { ok: false, message: 'App lock is not configured.' } as const;
    const wait = remainingPinCooldown(pinAttempts);
    if (wait > 0) return { ok: false, message: `Too many attempts. Try again in ${Math.ceil(wait / 1000)} seconds.` } as const;
    if (await verifyAppLockPin(saved, pin)) {
      setPinAttempts({ failedAttempts: 0 });
      return { ok: true } as const;
    }
    const next = registerFailedPinAttempt(pinAttempts);
    setPinAttempts(next);
    return {
      ok: false,
      message: next.blockedUntil ? 'Too many attempts. Try again in 30 seconds.' : 'That PIN is incorrect.',
    } as const;
  };

  const unlockWithPin = async (pin: string): Promise<Result> => {
    const attempt = unlockAttemptRef.current + 1;
    unlockAttemptRef.current = attempt;
    const result = await checkPin(pin);
    if (result.ok) {
      if (!canApplyUnlockResult(attempt, unlockAttemptRef.current, AppState.currentState === 'active' ? 'active' : 'unknown')) {
        return { ok: false, message: 'Unlock was interrupted. Try again.' };
      }
      updateLocked(false);
    }
    return result;
  };

  const unlockWithBiometrics = async (): Promise<Result> => {
    if (!configRef.current?.biometricEnabled) return { ok: false, message: 'Biometric unlock is not enabled.' };
    if (!biometricAvailable) return { ok: false, message: 'Biometric unlock is not available. Use your PIN.' };
    if (AppState.currentState !== 'active') return { ok: false, message: 'Return to Reclaim to use biometric unlock.' };
    const attempt = unlockAttemptRef.current + 1;
    unlockAttemptRef.current = attempt;
    authenticatingRef.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Reclaim',
        promptSubtitle: 'Protect your private health information',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
        requireConfirmation: true,
      });
      if (!canApplyUnlockResult(attempt, unlockAttemptRef.current, AppState.currentState === 'active' ? 'active' : 'unknown')) {
        return { ok: false, message: 'Biometric unlock was interrupted. Try again or use your PIN.' };
      }
      if (!result.success) return { ok: false, message: biometricMessage(result.error) };
      setPinAttempts({ failedAttempts: 0 });
      updateLocked(false);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Biometric unlock could not be started. Use your PIN.' };
    } finally {
      if (attempt === unlockAttemptRef.current) authenticatingRef.current = false;
    }
  };

  const enableAppLock = async (pin: string, useBiometrics: boolean): Promise<Result> => {
    const validation = pinValidationMessage(pin);
    if (validation) return { ok: false, message: validation };
    if (useBiometrics) {
      if (!biometricAvailable) return { ok: false, message: 'Biometrics are not available or enrolled on this phone.' };
      const proof = await authenticateForSettings('Confirm biometrics for Reclaim');
      if (!proof.ok) return proof;
    }
    try {
      const next = await createAppLockConfig(pin, useBiometrics);
      await saveAppLockConfig(next);
      replaceConfig(next);
      updateLocked(false);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Reclaim could not save the app lock securely on this device.' };
    }
  };

  const disableAppLock = async (pin: string): Promise<Result> => {
    const verified = await checkPin(pin);
    if (!verified.ok) return verified;
    try {
      await deleteAppLockConfig();
      replaceConfig(undefined);
      updateLocked(false);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Reclaim could not remove the app lock.' };
    }
  };

  const changePin = async (currentPin: string, newPin: string): Promise<Result> => {
    const validation = pinValidationMessage(newPin);
    if (validation) return { ok: false, message: validation };
    const verified = await checkPin(currentPin);
    if (!verified.ok) return verified;
    try {
      const current = configRef.current;
      if (!current) return { ok: false, message: 'App lock is not configured.' };
      const next = await createAppLockConfig(newPin, current.biometricEnabled);
      await saveAppLockConfig(next);
      replaceConfig(next);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Reclaim could not update the PIN.' };
    }
  };

  const setBiometricEnabled = async (enabled: boolean): Promise<Result> => {
    const current = configRef.current;
    if (!current) return { ok: false, message: 'Set up a PIN before enabling biometrics.' };
    if (enabled) {
      if (!biometricAvailable) return { ok: false, message: 'Biometrics are not available or enrolled on this phone.' };
      const proof = await authenticateForSettings('Confirm biometric unlock');
      if (!proof.ok) return proof;
    }
    try {
      const next = { ...current, biometricEnabled: enabled };
      await saveAppLockConfig(next);
      replaceConfig(next);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Reclaim could not update biometric unlock.' };
    }
  };

  const authenticateForSettings = async (promptMessage: string): Promise<Result> => {
    authenticatingRef.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
        requireConfirmation: true,
      });
      return result.success ? { ok: true } : { ok: false, message: biometricMessage(result.error) };
    } catch {
      return { ok: false, message: 'Biometric confirmation could not be started.' };
    } finally {
      authenticatingRef.current = false;
    }
  };

  return <AppLockContext.Provider value={{
    ready,
    enabled: Boolean(config),
    locked,
    biometricAvailable,
    biometricEnabled: Boolean(config?.biometricEnabled),
    biometricLabel,
    enableAppLock,
    disableAppLock,
    changePin,
    setBiometricEnabled,
    unlockWithPin,
    unlockWithBiometrics,
    lockNow: () => { resumeEligibleRef.current = false; updateLocked(true); },
  }}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) throw new Error('useAppLock must be used inside AppLockProvider');
  return context;
}

async function biometricDetails() {
  const [hardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  return {
    available: hardware && enrolled,
    label: hasFace && hasFingerprint ? 'Face or fingerprint' : hasFace ? 'Face unlock' : hasFingerprint ? 'Fingerprint' : 'Biometrics',
  };
}

function biometricMessage(error?: LocalAuthentication.LocalAuthenticationError) {
  if (error === 'user_cancel' || error === 'system_cancel' || error === 'app_cancel') return 'Biometric unlock was canceled. Use your PIN.';
  if (error === 'lockout') return 'Biometrics are temporarily locked. Use your PIN.';
  if (error === 'not_enrolled') return 'No biometrics are enrolled. Use your PIN.';
  return 'Biometric unlock was not successful. Use your PIN.';
}
