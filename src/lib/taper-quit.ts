import { formatLocalStartDate, formatLocalStartDateTime } from './date-format';
import { DatePrecision, TaperStep, Tracker } from '@/models/tracker';

export const DEFAULT_QUIT_CHECKPOINT_DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 365];

export type TaperQuitPhase = {
  step: TaperStep;
  startedAt: string;
  datePrecision: Exclude<DatePrecision, 'unknown'>;
  exact: boolean;
};

export function taperQuitPhase(tracker: Tracker, steps: TaperStep[]): TaperQuitPhase | undefined {
  if (tracker.mode !== 'reduction') return undefined;
  const step = steps.find((item) => item.trackerId === tracker.id && item.status === 'current');
  if (!step || step.amount !== 0 || !step.startedAt || step.datePrecision === 'unknown') return undefined;
  return { step, startedAt: step.startedAt, datePrecision: step.datePrecision, exact: step.datePrecision === 'exact' };
}

export function trackerJourneySection(tracker: Tracker, steps: TaperStep[]) {
  if (tracker.mode === 'habit') return 'building' as const;
  if (tracker.mode === 'abstinence' || taperQuitPhase(tracker, steps)) return 'quitting' as const;
  return 'reducing' as const;
}

export function formatTaperQuitStart(phase: TaperQuitPhase) {
  if (phase.datePrecision === 'approximate') return `Quit approximately ${formatLocalStartDate(phase.startedAt)}`;
  if (phase.datePrecision === 'date_only') return `Quit ${formatLocalStartDate(phase.startedAt)} · Exact time unknown`;
  return `Quit ${formatLocalStartDateTime(phase.startedAt)}`;
}

export function completedCalendarDays(startedAt: string, now = new Date()) {
  const start = new Date(startedAt);
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((endDay - startDay) / 86_400_000));
}

export function roundedNextCheckpoint(startedAt: string, checkpoints: number[], now = new Date()) {
  const elapsedDays = completedCalendarDays(startedAt, now);
  const targetDays = checkpoints.find((days) => days > elapsedDays)
    ?? (Math.floor(elapsedDays / 365) + 1) * 365;
  return { targetDays, remainingDays: Math.max(0, targetDays - elapsedDays), remainingHours: 0 };
}
