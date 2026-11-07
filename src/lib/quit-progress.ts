import { CravingEvent, DatePrecision, SavingsGoal, TaperStep, Tracker } from '@/models/tracker';
import { estimateTrackerSavings } from './habit-savings';
import { elapsedParts, nextCheckpoint } from './progress';
import { completedCalendarDays, DEFAULT_QUIT_CHECKPOINT_DAYS, roundedNextCheckpoint, taperQuitPhase, trackerJourneySection } from './taper-quit';

const DAY_MS = 86_400_000;

export type QuitStart = { tracker: Tracker; startedAt?: string; precision: DatePrecision };

/** Active trackers in the Quitting section, with the start of their quit phase. */
export function quittingStarts(trackers: readonly Tracker[], steps: readonly TaperStep[]): QuitStart[] {
  return trackers
    .filter((tracker) => !tracker.archived && trackerJourneySection(tracker, [...steps]) === 'quitting')
    .map((tracker) => {
      const phase = taperQuitPhase(tracker, [...steps]);
      return { tracker, startedAt: phase?.startedAt ?? tracker.startedAt, precision: phase?.datePrecision ?? 'exact' };
    });
}

export type TaperStart = { tracker: Tracker; startedAt?: string; amount?: number; unit: string };

/** Everything being tapered, with when its current level began. */
export function taperingStarts(trackers: readonly Tracker[], steps: readonly TaperStep[]): TaperStart[] {
  return trackers
    .filter((tracker) => !tracker.archived && trackerJourneySection(tracker, [...steps]) === 'reducing')
    .map((tracker) => {
      const current = steps.find((step) => step.trackerId === tracker.id && step.status === 'current');
      return {
        tracker,
        startedAt: current?.startedAt ?? tracker.currentStepStartedAt ?? (tracker.baseline === tracker.current ? tracker.startedAt : undefined),
        amount: current?.amount ?? tracker.current,
        unit: (current?.unit ?? tracker.unit ?? '').trim(),
      };
    });
}

/** The quit the user chose to feature, or the first running one. */
export function featuredQuit(starts: readonly QuitStart[], featuredId?: string): QuitStart | undefined {
  const running = starts.filter((item) => item.startedAt);
  return running.find((item) => item.tracker.id === featuredId) ?? running[0];
}

export type QuitSummary = {
  days: number;
  exact: boolean;
  hours: number;
  minutes: number;
  savingsCents: number;
  nextDays: number;
  daysToNext: number;
  /** 0–1 between the previous checkpoint and the next one. */
  checkpointProgress: number;
};

export function quitSummary(tracker: Tracker, startedAt: string, precision: DatePrecision = 'exact', now = Date.now()): QuitSummary {
  const exact = precision === 'exact';
  const checkpoints = tracker.checkpointDays?.length ? tracker.checkpointDays : DEFAULT_QUIT_CHECKPOINT_DAYS;
  const elapsed = elapsedParts(startedAt, now);
  const days = exact ? elapsed.days : completedCalendarDays(startedAt, new Date(now));
  const exactNext = exact ? nextCheckpoint(startedAt, checkpoints, now) : undefined;
  const next = exactNext ?? roundedNextCheckpoint(startedAt, checkpoints, new Date(now));
  const previous = [0, ...checkpoints].filter((value) => value < next.targetDays).pop() ?? 0;
  const elapsedDays = exact ? Math.max(0, (now - Date.parse(startedAt)) / DAY_MS) : days;
  const span = Math.max(1, next.targetDays - previous);
  return {
    days,
    exact,
    hours: exact ? elapsed.hours : 0,
    minutes: exact ? elapsed.minutes : 0,
    savingsCents: estimateTrackerSavings(tracker.savingsExpenses, startedAt, now),
    nextDays: next.targetDays,
    daysToNext: exactNext ? Math.ceil(exactNext.remainingMs / DAY_MS) : next.remainingDays,
    checkpointProgress: Math.min(1, Math.max(0, (elapsedDays - previous) / span)),
  };
}

export function totalQuitSavings(starts: readonly QuitStart[], now = Date.now()) {
  return starts.reduce((sum, { tracker, startedAt }) => sum + estimateTrackerSavings(tracker.savingsExpenses, startedAt, now), 0);
}

export function totalQuitDays(starts: readonly QuitStart[], now = Date.now()) {
  const ms = starts.reduce((sum, { startedAt }) => {
    const started = startedAt ? Date.parse(startedAt) : NaN;
    return sum + (Number.isFinite(started) ? Math.max(0, now - started) : 0);
  }, 0);
  return Math.floor(ms / DAY_MS);
}

export function cravingsBeaten(cravings: readonly CravingEvent[] | undefined, trackerId?: string) {
  return (cravings ?? []).filter((item) => item.outcome === 'beaten' && (!trackerId || item.trackerId === trackerId)).length;
}

/** The open savings goal (oldest first), with how far the quit savings cover it. */
export function activeSavingsGoal(goals: readonly SavingsGoal[] | undefined, savedCents: number) {
  const goal = [...(goals ?? [])].filter((item) => !item.achievedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!goal) return undefined;
  return { goal, progress: Math.min(1, savedCents / goal.targetCents), remainingCents: Math.max(0, goal.targetCents - savedCents) };
}

/** A friendly name for a checkpoint: "1 week", "3 months", "2 years". */
export function checkpointLabel(days: number) {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days === 180) return '6 months';
  if (days % 30 === 0 && days >= 30) return days === 30 ? '1 month' : `${days / 30} months`;
  if (days % 7 === 0 && days >= 7) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}
