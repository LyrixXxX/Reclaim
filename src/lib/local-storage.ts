import { TrackerState } from '@/models/tracker';

export const STATE_STORAGE_KEY = '@reclaim/state/v2';
export type SaveStatus = 'saving' | 'saved' | 'error';

/** A missing key is a fresh install; unreadable data must never become seed data. */
export async function readLocalState(read: () => Promise<string | null>): Promise<TrackerState | null> {
  const stored = await read();
  if (stored === null) return null;
  const parsed: unknown = JSON.parse(stored);
  if (!parsed || typeof parsed !== 'object' || !('trackers' in parsed) ||
      !Array.isArray(parsed.trackers) || !('checkIns' in parsed) || !Array.isArray(parsed.checkIns)) {
    throw new Error('Stored history could not be read safely.');
  }
  return parsed as TrackerState;
}

/** Serialize writes so an older snapshot cannot finish after a newer one. */
export function createLocalStateWriter(write: (snapshot: string) => Promise<void>, report: (status: SaveStatus) => void) {
  let reporting = true;
  const emit = (status: SaveStatus) => { if (reporting) report(status); };
  let tail = Promise.resolve();
  let revision = 0;
  let latest: string | undefined;
  const save = (snapshot: string): Promise<void> => {
    latest = snapshot;
    const current = ++revision;
    emit('saving');
    const result = tail.then(() => write(snapshot));
    tail = result.then(() => {
      if (current === revision) emit('saved');
    }, () => {
      if (current === revision) emit('error');
    });
    return result;
  };
  return {
    save,
    retry: () => latest === undefined ? Promise.resolve() : save(latest),
    forgetFailedSnapshot: (snapshot: string) => { if (latest === snapshot) { latest = undefined; emit('saved'); } },
    setReporting: (enabled: boolean) => { reporting = enabled; },
  };
}
