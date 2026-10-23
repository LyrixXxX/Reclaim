import { PermissionsAndroid, Platform } from 'react-native';

import NativeSteps from '../../modules/reclaim-steps';
import type { WalkingInterval } from './walking-minutes';
import { waitForStepServiceStartup } from './step-startup';

export type StepResult = {
  status: 'unsupported' | 'permission-needed' | 'available' | 'interrupted' | 'error';
  count?: number;
  message?: string;
  incomplete?: boolean;
  lastSampleAt?: number;
};

export async function readTodaySteps(askPermission = false): Promise<StepResult> {
  if (Platform.OS !== 'android') return { status: 'unsupported', message: 'Phone step tracking is currently available on Android.' };
  if (!NativeSteps) return { status: 'unsupported', message: 'This build does not include the phone step counter.' };
  const stepModule = NativeSteps;
  try {
    const permissionName = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
    let granted = Number(Platform.Version) < 29 || await PermissionsAndroid.check(permissionName);
    if (!granted && askPermission) granted = await PermissionsAndroid.request(permissionName) === PermissionsAndroid.RESULTS.GRANTED;
    if (!granted) return { status: 'permission-needed', message: 'Allow physical activity access to count steps.' };
    if (askPermission) {
      if (Number(Platform.Version) >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      await stepModule.start();
    }
    const result = askPermission
      ? await waitForStepServiceStartup(() => stepModule.getStatus())
      : await stepModule.getStatus();
    if (!result.available) return { status: 'unsupported', message: 'This phone does not have a hardware step counter.' };
    if (!result.enabled) return { status: 'permission-needed', message: 'Turn on step tracking to count steps throughout the day.' };
    return {
      status: result.running ? 'available' : 'interrupted',
      count: result.count,
      incomplete: result.incomplete,
      lastSampleAt: result.lastSampleAt,
      message: result.running ? undefined : 'Step tracking was interrupted. Reopen Activity to restart it.',
    };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not read the phone step counter.' };
  }
}

export async function stopStepTracking() {
  if (NativeSteps) await NativeSteps.stop();
}

export async function readWalkingIntervals(date: string): Promise<WalkingInterval[] | null> {
  if (Platform.OS !== 'android' || !NativeSteps) return null;
  try {
    const status = await NativeSteps.getStatus();
    if (!status.enabled || !status.available || !await NativeSteps.hasStepDetector()) return null;
    return await NativeSteps.getWalkingIntervals(date);
  } catch { return null; }
}

export async function readWalkingHistory(): Promise<{ date: string; intervals: WalkingInterval[] }[]> {
  if (Platform.OS !== 'android' || !NativeSteps) return [];
  try { return await NativeSteps.getWalkingHistory(); } catch { return []; }
}
