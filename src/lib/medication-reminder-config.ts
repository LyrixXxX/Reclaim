import { Medication } from '@/models/tracker';

export type MedicationReminderMode = 'normal' | 'audible';
export type MedicationReminderPreferences = { mode: MedicationReminderMode; sound: boolean; vibration: boolean };

export function medicationReminderPreferences(medication: Pick<Medication, 'reminderMode' | 'reminderSound' | 'reminderVibration'>): MedicationReminderPreferences {
  return {
    mode: medication.reminderMode ?? 'normal',
    sound: medication.reminderSound ?? true,
    vibration: medication.reminderVibration ?? true,
  };
}

export function medicationReminderChannelId(preferences: MedicationReminderPreferences) {
  return `medication-${preferences.mode}-${preferences.sound ? 'sound' : 'silent'}-${preferences.vibration ? 'vibrate' : 'steady'}-v2`;
}

export function medicationReminderChannelName(preferences: MedicationReminderPreferences) {
  const delivery = preferences.mode === 'audible' ? 'Audible medication reminders' : 'Normal medication reminders';
  const behavior = preferences.sound && preferences.vibration ? 'sound and vibration' : preferences.sound ? 'sound' : preferences.vibration ? 'vibration only' : 'silent';
  return `${delivery} · ${behavior}`;
}
