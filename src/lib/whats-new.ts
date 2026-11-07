/**
 * Release notes shown in the app after an update. Add an entry for each release (newest first), using
 * the same notes as Google Play. Versions without an entry show nothing.
 */
export type ReleaseNotes = { version: string; date: string; notes: string[] };

export const RELEASE_NOTES: readonly ReleaseNotes[] = [
  {
    version: '1.0.74',
    date: 'November 7, 2026',
    notes: [
      'Supplements can now be a daily goal. Skipping one on purpose never counts against you.',
      'Route screens are cleaner while recording, and you can add photos to saved routes.',
      'New Route settings can start a route full screen or in navigation mode.',
      'One Import button in Settings now handles backups and weight history files.',
    ],
  },
  {
    version: '1.0.73',
    date: 'November 6, 2026',
    notes: [
      'Put your Home cards in any order, and hide the ones you don’t need, in Edit dashboard.',
      'Your quit timer now shows its next badge and includes anything you’re tapering. A new card does the same for good habits.',
      'Long goal names no longer get cut off, and goals turn bold and colored at 100%.',
      'The Fruits & vegetables goal has been removed, along with its history. Log them in Nutrition instead.',
    ],
  },
  {
    version: '1.0.72',
    date: 'November 6, 2026',
    notes: [
      'The Home card is now Nutrition & Calories, showing what you’ve eaten and burned so far.',
      'More accurate calories: hikes and walks use distance and climb, and route steps are no longer counted twice.',
      'Log and add another lets you add several foods in a row.',
      'Height, birth year and weight are optional, and only asked for when your choices use them.',
    ],
  },
  {
    version: '1.0.71',
    date: 'November 6, 2026',
    notes: [
      'Today’s progress now shows 4 cards, with More to see the rest.',
      'New, brighter goal colors. Each goal gets its own automatically, and you can change it in Edit dashboard.',
      'The number on the notification bell is now centered, and the day 1 badge lines up with the others.',
    ],
  },
  {
    version: '1.0.70',
    date: 'November 6, 2026',
    notes: [
      'Share a finished route as an image. The map is off unless you turn it on.',
      'Add photos to your saved routes. They stay on your phone.',
      'Good habits now have their own badge art, and the Trophy case has separate tabs for good habits and quitting.',
      'Fixed Home steps sometimes not updating until you reopened the app.',
      'GPS signal bars now update while you stand still.',
      'The step goal box is easier to see.',
    ],
  },
  {
    version: '1.0.69',
    date: 'November 6, 2026',
    notes: [
      'Every habit now earns badges, including water, walking, sleep, reading and more.',
      'See how close your next badge is on Habits and Home, and every badge you’ve earned in the new Trophy case.',
      'Earning a badge for the first time now gets its own moment, with an option to share it.',
      'Reclaim has a new icon.',
    ],
  },
  {
    version: '1.0.68',
    date: 'November 6, 2026',
    notes: [
      'Adding a supplement is simpler: pick it, say how much you take and when, and save. Label details are optional.',
      'Tap Take once to log your usual amount, with Undo if you need it.',
      'Calories now have their own card on Home and no longer count toward your daily goals or streak.',
    ],
  },
  {
    version: '1.0.67',
    date: 'November 6, 2026',
    notes: [
      'Trail details are simpler: length, map, climb and difficulty, without the drive time or straight-line distance. Google Maps gives you the drive when you press Directions.',
    ],
  },
  {
    version: '1.0.66',
    date: 'November 6, 2026',
    notes: [
      'Find trails has far more detail in Tennessee: trail length, climb and estimated difficulty, with the trail drawn on a map. More states are coming.',
      'Distance now goes to the closest parking lot or trailhead, and Directions takes you to the same spot.',
      'Trail photos now load, and searching for a place finds the one near you instead of one in another state.',
    ],
  },
  {
    version: '1.0.65',
    date: 'November 5, 2026',
    notes: [
      'Find trails is fixed: results now show up in a few seconds, with trailheads, named trails and waterfalls near you.',
      'More trails are added to the list as they load, so you never wait on an empty screen.',
      'New water habits are called "Drink Water", which fits on Home without being cut off.',
      'This "What’s new" note: see what changed after each update, or anytime in Settings.',
    ],
  },
];

export const WHATS_NEW_KEY = 'reclaim-whats-new-seen-v1';

/** Compares "1.0.65"-style versions. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/**
 * Notes to show after an update: every release newer than the last one seen, up to the installed
 * version, newest first. A first install has nothing to show; it only records the version.
 */
export function unseenReleaseNotes(installed: string, lastSeen: string | null, notes: readonly ReleaseNotes[] = RELEASE_NOTES): ReleaseNotes[] {
  if (!lastSeen) return [];
  return notes
    .filter((release) => compareVersions(release.version, lastSeen) > 0 && compareVersions(release.version, installed) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** Everything up to the installed version, newest first, for Settings. */
export function releaseNotesUpTo(installed: string, notes: readonly ReleaseNotes[] = RELEASE_NOTES): ReleaseNotes[] {
  return notes.filter((release) => compareVersions(release.version, installed) <= 0).sort((a, b) => compareVersions(b.version, a.version));
}
