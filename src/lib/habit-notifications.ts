import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Tracker } from '@/models/tracker';

const CHANNEL_ID = 'good-habit-reminders';

export async function cancelHabitReminder(id?: string) {
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

export async function scheduleHabitReminder(tracker: Tracker): Promise<string | undefined> {
  if (tracker.mode !== 'habit' || tracker.archived || !tracker.habitReminderTime) return undefined;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Good habit reminders',
    description: 'Optional daily nudges for positive habits.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) throw new Error('Notifications are off. Your habit was saved without a reminder; enable notifications in device settings to use daily nudges.');
  const [hour, minute] = tracker.habitReminderTime.split(':').map(Number);
  return Notifications.scheduleNotificationAsync({
    content: { title: tracker.displayName || tracker.name, body: 'A little nudge for your good habit.', data: { kind: 'good-habit-reminder', trackerId: tracker.id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined },
  });
}
