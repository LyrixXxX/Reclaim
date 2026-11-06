export const PRIVACY_UPDATED = 'November 4, 2026';
export const PRIVACY_POLICY_URL = 'https://lyrixstudios.com/reclaim/privacy/';

export const PRIVACY_SECTIONS = [
  {
    title: 'What stays on your device',
    body: 'Habit and quit trackers, cravings, savings goals, good-habit logs, weight, meals, supplement schedules and dose history, step totals and walking-time intervals, workouts and routines, and saved routes are stored on your device. Reclaim does not require an account and has no analytics or tracking SDKs. App-lock PIN verification stays in secure device storage and is not included in backups. Some records from earlier versions may remain locally and in backups, but are not displayed or updated.',
  },
  {
    title: 'Permissions and location',
    body: 'Step tracking uses your phone’s activity sensors when you turn it on; walking-time intervals stay in device storage and are not included in backups. The Routes map uses foreground location to show your position, and recording continues in the background only while a route is running. The camera and photo picker are used only when you choose to scan a label. Reminders, rest timers and mile alerts are scheduled on your device.',
  },
  {
    title: 'Widget and shared images',
    body: 'The home-screen widget shows your featured quit tracker’s name, days, money saved and next milestone, plus today’s steps and estimated calories, wherever your phone shows widgets, including a cover or lock screen. Use a discreet display name if you prefer, or remove the widget. Milestone images are made on your device, show only what the preview shows (money saved is off unless you turn it on), and go only to the app you pick.',
  },
  {
    title: 'When information leaves your device',
    body: 'If you export a backup, you choose where its file goes. If you use AI to log a food description or label photo, read a Supplement Facts photo, suggest fruit and vegetable servings for selected entries, or plan a training week, only that content is sent through Lyrix Studios\' Cloudflare relay to OpenAI. The planner sends your chosen schedule and built-in exercise names, never your workout history or weights. The relay verifies Play installs with Google Play Integrity and uses an IP-derived identifier to limit abuse. Maps load tiles from Stadia Maps. If Routes is on and you’ve allowed location, an approximate location is sent to the U.S. National Weather Service for a forecast when Home or Routes is open. When you use Find trails, the place you type is sent to Stadia Maps to look it up, with your approximate area if you’ve allowed location, so nearby matches come first. The search area (your approximate location, if you choose it) is sent to the Lyrix Studios trail relay, which doesn’t keep it, and, where the relay doesn’t cover the area, to Stadia Maps and the OpenStreetMap Overpass service to find trails. When you open a trail, its name is used to look up a photo on Wikimedia, where the photo is loaded from. Trails you save stay on this phone. These providers also receive network information such as your IP address.',
  },
  {
    title: 'Advertising and purchases',
    body: 'Reclaim may show Google AdMob banners on Home, Steps and Nutrition, and an ad after logging a meal, saving a route or saving a weigh-in. Ads are requested as non-personalized, and Google may process device and ad-delivery information. Your tracker records are never used for ads. If you buy Remove Ads, Google Play handles payment and a Lyrix Studios service verifies the purchase token.',
  },
  {
    title: 'Your choices',
    body: 'You can export your records, delete entries in the app, or remove all local data by clearing the app’s storage or uninstalling. Backups you saved elsewhere remain under your control. Depending on where you live, you may have rights to access, delete or object to processing and to complain to a data-protection authority. For privacy requests, contact Reclaim.LyrixStudios@gmail.com.',
  },
] as const;
