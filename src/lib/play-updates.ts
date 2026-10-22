export const PLAY_UPDATES_ENABLED = process.env.EXPO_PUBLIC_RECLAIM_PLAY_UPDATES_ENABLED === '1';

export type PlayUpdateReminder = { versionCode: number; day: string };

export function shouldPromptForPlayUpdate(
  currentVersionCode: number,
  availableVersionCode: number,
  flexibleAllowed: boolean,
  reminder: PlayUpdateReminder | null,
  day: string,
) {
  return Number.isInteger(currentVersionCode) && currentVersionCode > 0
    && Number.isInteger(availableVersionCode) && availableVersionCode > currentVersionCode
    && flexibleAllowed && !(reminder?.versionCode === availableVersionCode && reminder.day === day);
}
