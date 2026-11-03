import { TrackerState } from '@/models/tracker';

/** Home-screen widgets exist only on Android; elsewhere this does nothing. */
export function updateQuitWidget(_state: TrackerState) {}
