import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const KEY = 'reclaim:route-mile-alerts:v1';
const CHANNEL_ID = 'route-mile-markers-v1';
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
    description: 'Optional vibration when a recorded route reaches another mile.',
     
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: true,
    vibrationPattern: [0, 350, 150, 350],
  });
   
  if (channel?.importance === Notifications.AndroidImportance.NONE) {
    throw new Error('Route mile-marker notifications are blocked in Android settings.');
  }
}

export async function notifyRouteMile(mile: number, routeId: string, test = false): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) throw new Error('Allow Reclaim notifications in Android settings to receive mile alerts.');
  await ensureRouteMileChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title: test ? 'Test mile alert' : `${mile} ${mile === 1 ? 'mile' : 'miles'} complete`, body: test ? 'Mile-marker notifications are ready.' : 'Your route is still recording.', sound: false, data: { kind: 'route-mile', routeId, mile, test } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}
