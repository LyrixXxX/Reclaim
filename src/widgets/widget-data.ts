import { TrackerState } from '@/models/tracker';
import { formatSavings } from '@/lib/habit-savings';
import { checkpointLabel, cravingsBeaten, featuredQuit, quitSummary, quittingStarts } from '@/lib/quit-progress';
import { trackerDisplayName } from '@/lib/tracker-management';

export type QuitWidgetData =
  | { kind: 'quit'; name: string; color: string; days: number; next: string; savings?: string; beaten: number }
  | { kind: 'empty' };

/** What the home-screen widget shows: the featured quit, same as the Home hero. */
export function quitWidgetData(state: TrackerState | undefined, now = Date.now()): QuitWidgetData {
  if (!state || state.preferences?.visibleSections?.goals === false) return { kind: 'empty' };
  const quit = featuredQuit(quittingStarts(state.trackers ?? [], state.taperSteps ?? []), state.preferences?.featuredTrackerId);
  if (!quit?.startedAt) return { kind: 'empty' };
  const summary = quitSummary(quit.tracker, quit.startedAt, quit.precision, now);
  return {
    kind: 'quit',
    name: trackerDisplayName(quit.tracker),
    color: quit.tracker.color,
    days: summary.days,
    next: `${summary.daysToNext.toLocaleString()} ${summary.daysToNext === 1 ? 'day' : 'days'} to ${checkpointLabel(summary.nextDays)}`,
    savings: summary.savingsCents > 0 ? formatSavings(summary.savingsCents) : undefined,
    beaten: cravingsBeaten(state.cravings, quit.tracker.id),
  };
}
