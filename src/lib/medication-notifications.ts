import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { medicationReminderChannelId, medicationReminderChannelName, medicationReminderPreferences, MedicationReminderPreferences } from '@/lib/medication-reminder-config';
import { medicationNotificationSlots } from '@/lib/medications';
import { Medication } from '@/models/tracker';

const CHANNEL_GROUP_ID = 'medication-reminders';

export type MedicationReminderStatus = {
  permission: 'granted' | 'denied' | 'not_requested';
  canAskAgain: boolean;
  scheduledCount: number;
  normalChannel: 'ready' | 'blocked' | 'unavailable';
  audibleChannel: 'ready' | 'blocked' | 'unavailable';
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function ensureMedicationChannel(preferences: MedicationReminderPreferences) {
  if (Platform.OS !== 'android') return undefined;
  await Notifications.setNotificationChannelGroupAsync(CHANNEL_GROUP_ID, { name: 'Medication reminders', description: 'Reminder channels used for scheduled medications.' });
  const channelId = medicationReminderChannelId(preferences);
  await Notifications.setNotificationChannelAsync(channelId, {
    name: medicationReminderChannelName(preferences),
    description: preferences.mode === 'audible'
      ? 'High-priority reminder. Android sound, mute, and Do Not Disturb settings still apply.'
      : 'Standard medication reminder controlled by Android notification settings.',
    groupId: CHANNEL_GROUP_ID,
    importance: preferences.mode === 'audible' ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
    sound: preferences.sound ? 'default' : null,
    audioAttributes: { usage: Notifications.AndroidAudioUsage.NOTIFICATION, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
    enableVibrate: preferences.vibration,
    vibrationPattern: preferences.vibration ? [0, 300, 180, 300] : null,
    bypassDnd: false,
    showBadge: false,
  });
  return channelId;
}

export async function requestMedicationNotificationPermission(preferences: MedicationReminderPreferences = { mode: 'normal', sound: true, vibration: true }) {
  await ensureMedicationChannel(preferences);
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function rescheduleMedication(medication: Medication) {
  const preferences = medicationReminderPreferences(medication);
  const channelId = await ensureMedicationChannel(preferences);
  if (medication.remindersEnabled && !medication.archived && medication.schedule.type !== 'as_needed' && !(await requestMedicationNotificationPermission(preferences))) throw new Error('Notification permission was not granted.');
  await cancelMedicationNotifications(medication.notificationIds);
  if (!medication.remindersEnabled || medication.archived || medication.schedule.type === 'as_needed') return [];
  const title = medication.discreetName || medication.name;
  const body = medication.strength ? `Scheduled reminder · ${medication.strength}` : `Scheduled ${medication.kind === 'supplement' ? 'supplement' : 'medication'} reminder`;
  const content: Notifications.NotificationContentInput = { title, body, sound: preferences.sound ? 'default' : undefined, data: { medicationId: medication.id, kind: 'medication-reminder', reminderMode: preferences.mode } };
  const ids: string[] = [];
  if (medication.schedule.type === 'interval') {
    ids.push(await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: (medication.schedule.intervalHours ?? 24) * 3600, repeats: true, channelId } }));
    return ids;
  }
  for (const time of medicationNotificationSlots(medication)) {
    if (medication.schedule.type === 'daily') ids.push(await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute, channelId } }));
    else for (const weekday of medication.schedule.weekdays ?? []) ids.push(await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour: time.hour, minute: time.minute, channelId } }));
  }
  return ids;
}

export async function cancelMedicationNotifications(ids: string[]) { await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined))); }

export async function sendMedicationTestReminder(preferences: MedicationReminderPreferences = { mode: 'normal', sound: true, vibration: true }) {
  if (!(await requestMedicationNotificationPermission(preferences))) return false;
  const channelId = await ensureMedicationChannel(preferences);
  await Notifications.scheduleNotificationAsync({
    content: { title: preferences.mode === 'audible' ? 'Reclaim audible reminder test' : 'Reclaim reminder test', body: preferences.mode === 'audible' ? 'High-priority medication channel test. System sound settings still apply.' : 'Normal medication reminders are enabled.', sound: preferences.sound ? 'default' : undefined, data: { kind: 'medication-test' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId },
  });
  return true;
}

export async function getMedicationReminderStatus(): Promise<MedicationReminderStatus> {
  const permission = await Notifications.getPermissionsAsync();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const channels = Platform.OS === 'android' ? await Notifications.getNotificationChannelsAsync() ?? [] : [];
  return {
    permission: permission.granted ? 'granted' : permission.status === Notifications.PermissionStatus.DENIED ? 'denied' : 'not_requested',
    canAskAgain: permission.canAskAgain,
    scheduledCount: scheduled.filter((item) => item.content.data?.kind === 'medication-reminder').length,
    normalChannel: channelState(channels.filter((channel) => channel.id.startsWith('medication-normal-'))),
    audibleChannel: channelState(channels.filter((channel) => channel.id.startsWith('medication-audible-'))),
  };
}

export async function openMedicationNotificationSettings() {
  if (Platform.OS !== 'android') return Linking.openSettings();
  const packageName = Constants.expoConfig?.android?.package;
  if (!packageName) return Linking.openSettings();
  try {
    await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [{ key: 'android.provider.extra.APP_PACKAGE', value: packageName }]);
  } catch { await Linking.openSettings(); }
}

function channelState(channels: Notifications.NotificationChannel[]): MedicationReminderStatus['normalChannel'] {
  if (Platform.OS !== 'android') return 'unavailable';
  if (!channels.length) return 'unavailable';
  return channels.some((channel) => channel.importance !== Notifications.AndroidImportance.NONE) ? 'ready' : 'blocked';
}
