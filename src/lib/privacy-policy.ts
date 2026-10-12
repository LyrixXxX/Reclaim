export const PRIVACY_UPDATED = 'October 12, 2026';

export const PRIVACY_SECTIONS = [
  {
    title: 'What stays on your device',
    body: 'Habit trackers, health readings, CPAP history, weight, meals, steps, and saved routes are stored on your device. Reclaim does not require an account. App-lock PIN verification stays in secure device storage and is not included in backups.',
  },
  {
    title: 'Permissions and location',
    body: 'Step tracking uses your phone’s activity sensor when you turn it on. Location is used to show your position and record a route only when you start a route; an active route can continue while the app is in the background. You can turn off tracking or revoke permissions in Android Settings.',
  },
  {
    title: 'When information leaves your device',
    body: 'If you choose to export a backup, you choose where its file is shared. If you submit food descriptions, label photos, selected Nutrition entries for produce-serving suggestions, or laboratory-report text for Private AI, that content is sent through Lyrix Studios\' relay to OpenAI. No AI account or connection setup is required. The relay verifies the app through Google Play and applies usage limits. Map viewing and offline downloads request tiles from Stadia Maps; tile requests can reveal an approximate viewed area and your network address to the map provider.',
  },
  {
    title: 'Advertising and purchases',
    body: 'When ads are enabled, Google may process device and ad-delivery information to show and measure a Home-screen ad. Reclaim does not send your habit, health, nutrition, step, or route records as ad-targeting information. Google Play handles Remove Ads payments; Reclaim sends the purchase token to its verification service to confirm entitlement. Ads and purchases remain unavailable until a public privacy policy and store setup are configured.',
  },
  {
    title: 'Your choices',
    body: 'You can export your records, delete individual records in Reclaim, or remove local data by clearing the app’s storage. Backups you saved elsewhere remain under your control. The public privacy policy and a support contact will be available before a Google Play release.',
  },
] as const;
