import { TrackerState } from '@/models/tracker';
import { DEFAULT_PREFERENCES } from './preferences';
import { activeSavingsGoal, checkpointLabel, quitSummary, quittingStarts, totalQuitSavings } from './quit-progress';
import { DEFAULT_QUIT_CHECKPOINT_DAYS } from './taper-quit';
import { formatSavings } from './habit-savings';
import { trackerDisplayName } from './tracker-management';
import type { HomeAttention } from './home-overview';

export type HomeNotification = {
  /** Stable for the day it applies to, so a dismissal holds until something new happens. */
  id: string;
  kind: 'action' | 'celebration';
  title: string;
  detail: string;
  href: string;
  /** Things that need doing can't be hidden, only done. */
  dismissible: boolean;
};

/**
 * Everything the bell shows: things that need doing (from Home's attention list) and milestones worth
 * celebrating. Dismissed ids are remembered, so a hidden note stays hidden.
 */
export function homeNotifications(state: TrackerState, attention: readonly HomeAttention[], now = new Date()): HomeNotification[] {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const notes: HomeNotification[] = attention.map((item) => ({ id: item.id, kind: 'action', title: item.title, detail: item.detail, href: item.href, dismissible: false }));

  if (preferences.visibleSections.goals) {
    const starts = quittingStarts(state.trackers, state.taperSteps ?? []).filter((item) => item.startedAt);
    for (const { tracker, startedAt, precision } of starts) {
      const summary = quitSummary(tracker, startedAt!, precision, now.getTime());
      const checkpoints = tracker.checkpointDays?.length ? tracker.checkpointDays : DEFAULT_QUIT_CHECKPOINT_DAYS;
      const milestone = summary.days > 0 && (checkpoints.includes(summary.days) || (summary.days >= 365 && summary.days % 365 === 0));
      if (milestone) notes.push({ id: `milestone-${tracker.id}-${summary.days}`, kind: 'celebration', title: `${checkpointLabel(summary.days)} free of ${trackerDisplayName(tracker).toLowerCase()}`, detail: 'A milestone today. Tap to share it.', href: `/share-milestone?tracker=${encodeURIComponent(tracker.id)}`, dismissible: true });
    }
    const goal = activeSavingsGoal(state.savingsGoals, totalQuitSavings(starts, now.getTime()));
    if (goal && goal.remainingCents === 0) notes.push({ id: `savings-goal-${goal.goal.id}`, kind: 'celebration', title: `You’ve saved enough for ${goal.goal.name}`, detail: `${formatSavings(goal.goal.targetCents)} kept from quitting.`, href: '/savings-goal', dismissible: true });
  }

  const dismissed = new Set(preferences.dismissedNotices ?? []);
  return notes.filter((note) => !note.dismissible || !dismissed.has(note.id));
}
