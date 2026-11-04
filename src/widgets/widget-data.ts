import { TrackerState } from '@/models/tracker';
import { formatSavings } from '@/lib/habit-savings';
import { localDateKey } from '@/lib/progress';
import { checkpointLabel, cravingsBeaten, featuredQuit, quitSummary, quittingStarts } from '@/lib/quit-progress';
import { stepCalories } from '@/lib/step-calories';
import { walkingStride } from '@/lib/stride';
import { trackerDisplayName } from '@/lib/tracker-management';

/** Today's steps and their estimated calories, when the phone is counting steps. */
export type WidgetSteps = { count: number; kcal: number };

export type QuitWidgetData =
  | { kind: 'quit'; name: string; color: string; days: number; next: string; savings?: string; beaten: number; steps?: WidgetSteps }
  | { kind: 'steps'; steps: WidgetSteps; goal?: number }
  | { kind: 'empty' };

export function widgetSteps(state: TrackerState | undefined, count: number | undefined, now = Date.now()): WidgetSteps | undefined {
  if (!state || count === undefined || state.preferences?.visibleSections?.activity === false) return undefined;
  const burn = stepCalories(count, state.weightEntries, localDateKey(new Date(now)), walkingStride(state).meters);
  return burn ? { count, kcal: burn.kcal } : undefined;
}

/** What the home-screen widget shows: the featured quit (same as the Home card), plus today's steps. */
export function quitWidgetData(state: TrackerState | undefined, now = Date.now(), stepCount?: number): QuitWidgetData {
  if (!state) return { kind: 'empty' };
  const steps = widgetSteps(state, stepCount, now);
  const quit = state.preferences?.visibleSections?.goals === false ? undefined : featuredQuit(quittingStarts(state.trackers ?? [], state.taperSteps ?? []), state.preferences?.featuredTrackerId);
  if (!quit?.startedAt) {
    if (!steps) return { kind: 'empty' };
    const today = localDateKey(new Date(now));
    const goal = [...(state.stepGoals ?? [])].filter((item) => item.effectiveDate <= today).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.count;
    return { kind: 'steps', steps, goal };
  }
  const summary = quitSummary(quit.tracker, quit.startedAt, quit.precision, now);
  return {
    kind: 'quit',
    name: trackerDisplayName(quit.tracker),
    color: quit.tracker.color,
    days: summary.days,
    next: `${summary.daysToNext.toLocaleString()} ${summary.daysToNext === 1 ? 'day' : 'days'} to ${checkpointLabel(summary.nextDays)}`,
    savings: summary.savingsCents > 0 ? formatSavings(summary.savingsCents) : undefined,
    beaten: cravingsBeaten(state.cravings, quit.tracker.id),
    steps,
  };
}
