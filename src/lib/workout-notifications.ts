import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export async function cancelWorkoutRest(id?: string) { if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined); }
export async function scheduleWorkoutRest(seconds: number): Promise<string | undefined> {
  if (seconds <= 0) return undefined;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('workout-rest', { name: 'Workout rest', importance: Notifications.AndroidImportance.DEFAULT });
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return undefined;
  return Notifications.scheduleNotificationAsync({ content: { title: 'Rest complete', body: 'Ready for your next set?', data: { kind: 'workout-rest' } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, seconds), channelId: Platform.OS === 'android' ? 'workout-rest' : undefined } });
}
