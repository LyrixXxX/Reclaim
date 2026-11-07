import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';

const KEY = 'reclaim:route-mile-alerts:v1';
// Android fixes a channel's settings the first time it is created, so a changed channel needs a new id.
const CHANNEL_ID = 'route-mile-markers-v2';
/** Two firm buzzes. Played by the app itself, so it doesn't depend on the notification channel's vibration setting. */
export const MILE_VIBRATION_PATTERN = [0, 400, 180, 400];

export function vibrateForMile() {
  if (Platform.OS === 'android') Vibration.vibrate(MILE_VIBRATION_PATTERN);
}
const METERS_PER_MILE = 1609.344;

export function completedMile(distanceMeters: number): number {
  return Number.isFinite(distanceMeters) && distanceMeters > 0 ? Math.floor(distanceMeters / METERS_PER_MILE) : 0;
}

export function nextMileAlert(distanceMeters: number, lastAlertedMile: number): number | null {
  const mile = completedMile(distanceMeters);
  return mile > lastAlertedMile ? mile : null;
}

export async function readRouteMileAlertsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === 'true';
}

export async function setRouteMileAlertsEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) throw new Error('Allow notifications to receive mile alerts. You can change this in Android settings.');
    await ensureRouteMileChannel();
  }
  await AsyncStorage.setItem(KEY, String(enabled));
}

async function ensureRouteMileChannel() {
  if (Platform.OS !== 'android') return;
  const channel = await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Route mile markers',
    description: 'A notice each time a recorded route reaches another mile. The app vibrates on its own.',
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    // The app plays the buzz itself; vibrating here too would double it.
    enableVibrate: false,
  });
   
  if (channel?.importance === Notifications.AndroidImportance.NONE) {
    throw new Error('Route mile-marker notifications are blocked in Android settings.');
  }
}

export async function notifyRouteMile(mile: number, routeId: string): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) throw new Error('Allow Reclaim notifications in Android settings to receive mile alerts.');
  await ensureRouteMileChannel();
  vibrateForMile();
  await Notifications.scheduleNotificationAsync({
    content: { title: `${mile} ${mile === 1 ? 'mile' : 'miles'} complete`, body: 'Your route is still recording.', sound: false, data: { kind: 'route-mile', routeId, mile } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}
