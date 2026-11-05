/**
 * Release notes shown in the app after an update. Add an entry for each release (newest first), using
 * the same notes as Google Play. Versions without an entry show nothing.
 */
export type ReleaseNotes = { version: string; date: string; notes: string[] };

export const RELEASE_NOTES: readonly ReleaseNotes[] = [
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
