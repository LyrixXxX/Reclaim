import { medicationReminderChannelId, medicationReminderChannelName, medicationReminderPreferences } from './medication-reminder-config';

describe('medication reminder configuration', () => {
  test('preserves backward-compatible normal sound and vibration defaults', () => {
    expect(medicationReminderPreferences({})).toEqual({ mode: 'normal', sound: true, vibration: true });
  });
  test('uses stable separate channels for every delivery combination', () => {
    expect(medicationReminderChannelId({ mode: 'normal', sound: true, vibration: false })).toBe('medication-normal-sound-steady-v2');
    expect(medicationReminderChannelId({ mode: 'audible', sound: false, vibration: true })).toBe('medication-audible-silent-vibrate-v2');
    expect(medicationReminderChannelName({ mode: 'audible', sound: true, vibration: true })).toContain('sound and vibration');
  });
});
