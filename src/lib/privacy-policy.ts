export const PRIVACY_UPDATED = 'November 1, 2026';

export const PRIVACY_SECTIONS = [
  {
    title: 'What stays on your device',
    body: 'Habit trackers, weight, meals, vitamin and supplement schedules, stacks and dose history, step totals and walking-time intervals, strength workouts and routines, and saved routes are stored on your device. Older medical records remain locally and in backups, but are not displayed or updated in this wellness edition. Reclaim does not require an account. App-lock PIN verification stays in secure device storage and is not included in backups.',
  },
  {
    title: 'Permissions and location',
    body: 'Step tracking uses your phone’s activity sensors when you turn it on. Where supported, time-stamped step events create local walking-time intervals for Walk more goals; time spent recording a route is excluded from phone walking minutes. These intervals remain in native device storage and are not included in portable backups. Reclaim no longer connects to Health Connect. Any weigh-ins previously imported from it remain in your local Weight history and can be deleted there. Opening the Routes map uses foreground location to show your position before you start recording. If you start a route, recording can continue in the background until you pause or finish it.',
  },
  {
    title: 'When information leaves your device',
    body: 'If you export a backup, you choose where its file is shared. The optional macro split calculator uses your entered calorie target, weight, height, and fitness goal on your device; these inputs are not sent to the AI relay. Older app builds may still send macro questionnaire answers to the Cloudflare relay when you request an AI-assisted plan. In those builds, age, height, weight, activity, goal, training focus, loss pace and priority, estimation basis, and an optional calorie target reach the relay; only the resulting target, source label, protein target, goal, activity, training focus, pace, and priority go onward to OpenAI. If you submit food descriptions, food-label photos, a selected Supplement Facts photo, selected Nutrition entries, or strength-planning answers to AI, that content is sent through Lyrix Studios\' Cloudflare relay to OpenAI. Supplement-label scanning is optional; only the cropped photo you choose is submitted, and the draft must be reviewed before saving locally. Strength planning also sends built-in exercise names, but not your workout history, logged weights, or saved routines. The relay uses an IP-derived identifier for abuse limits and verifies Play-installed requests with Google Play Integrity. Map viewing requests tiles from Stadia Maps. While Routes is open, an approximate coordinate is sent to the U.S. National Weather Service for an hourly forecast where available. These providers also receive network information such as your IP address. Weather does not require route recording and is not fetched in the background.',
  },
  {
    title: 'Advertising and purchases',
    body: 'Current test builds show Google test ads, which earn no revenue. If live ads are enabled later, Google may process device and ad-delivery information to show and measure banners on Home, Steps, and Nutrition, plus ads after logging a current meal, saving a route, or saving a new current-day weigh-in. Reclaim does not send tracker records for ad targeting. If Remove Ads is offered, Google Play handles payment and a Lyrix Studios service verifies the purchase token.',
  },
  {
    title: 'Your choices',
    body: 'You can export your records, edit or archive supplement entries and remove their logs, or remove all local data by clearing the app’s storage. Older medical records retained from previous versions cannot be edited in this edition. Backups you saved elsewhere remain under your control. EU/EEA users may have additional rights, including access, erasure, objection, and a complaint to a data-protection authority. For privacy requests, contact Reclaim.LyrixStudios@gmail.com.',
  },
] as const;
