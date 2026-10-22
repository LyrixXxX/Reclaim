export const PRIVACY_UPDATED = 'October 22, 2026';

export const PRIVACY_SECTIONS = [
  {
    title: 'What stays on your device',
    body: 'Habit trackers, weight, meals, vitamin and supplement schedules, stacks and dose history, steps, strength workouts and routines, and saved routes are stored on your device. Older medical records remain locally and in backups, but are not displayed or updated in this wellness edition. Reclaim does not require an account. App-lock PIN verification stays in secure device storage and is not included in backups.',
  },
  {
    title: 'Permissions and location',
    body: 'Step tracking uses your phone’s activity sensor when you turn it on. Reclaim no longer connects to Health Connect. Any weigh-ins previously imported from it remain in your local Weight history and can be deleted there. Opening the Routes map uses foreground location to show your position before you start recording. If you start a route, recording can continue in the background until you pause or finish it.',
  },
  {
    title: 'When information leaves your device',
    body: 'If you export a backup, you choose where its file is shared. If you submit food descriptions, label photos, selected Nutrition entries, or strength-planning answers to AI, that content is sent through Lyrix Studios\' Cloudflare relay to OpenAI. If you request an optional macro plan, age, height, current weight, activity level, goal, training focus, chosen weight-loss pace and priority, chosen calorie-estimation basis, and any daily calorie target you enter go to the Cloudflare relay. Only the resulting calorie target, its source label, protein target, goal, activity level, training focus, weight-loss pace, and priority go onward to OpenAI—not your age, height, current weight, or estimation basis. Questionnaire answers are not saved as a profile. Strength planning also sends built-in exercise names, but not your workout history, logged weights, or saved routines. The relay uses an IP-derived identifier for abuse limits and verifies Play-installed requests with Google Play Integrity. Map viewing requests tiles from Stadia Maps. While Routes is open, an approximate coordinate is sent to the U.S. National Weather Service for an hourly forecast where available. These providers also receive network information such as your IP address. Weather does not require route recording and is not fetched in the background.',
  },
  {
    title: 'Advertising and purchases',
    body: 'Current test builds show Google test ads, which earn no revenue. If live ads are enabled later, Google may process device and ad-delivery information to show and measure banners on Home, Steps, Routes, and Nutrition, plus occasional ads after saving a current meal. Reclaim does not send tracker records for ad targeting. If Remove Ads is offered, Google Play handles payment and a Lyrix Studios service verifies the purchase token.',
  },
  {
    title: 'Your choices',
    body: 'You can export your records, edit or archive supplement entries and remove their logs, or remove all local data by clearing the app’s storage. Older medical records retained from previous versions cannot be edited in this edition. Backups you saved elsewhere remain under your control. EU/EEA users may have additional rights, including access, erasure, objection, and a complaint to a data-protection authority. For privacy requests, contact Reclaim.LyrixStudios@gmail.com.',
  },
] as const;
