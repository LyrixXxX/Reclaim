import { TaperStep, Tracker } from '@/models/tracker';
import { trackerJourneySection, taperQuitPhase } from './taper-quit';

export type HomeJourney = { id: string; title: string; timeframe: string; href: string };

function timeSince(startedAt: string | undefined, now: Date): string {
  if (!startedAt) return 'Start date not set';
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started) || started > now.getTime()) return 'Start date not set';
  const minutes = Math.floor((now.getTime() - started) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function homeQuittingTapering(trackers: Tracker[], steps: TaperStep[], now: Date) {
  const quitting: HomeJourney[] = [];
  const tapering: HomeJourney[] = [];
  for (const tracker of trackers) {
    if (tracker.archived || tracker.mode === 'habit') continue;
    const section = trackerJourneySection(tracker, steps);
    const href = `/tracker/${encodeURIComponent(tracker.id)}`;
    const title = tracker.displayName || tracker.name;
    if (section === 'quitting') {
      const startedAt = taperQuitPhase(tracker, steps)?.startedAt ?? tracker.startedAt;
      quitting.push({ id: tracker.id, title, timeframe: `Time since quitting · ${timeSince(startedAt, now)}`, href });
    } else {
      const current = steps.find((step) => step.trackerId === tracker.id && step.status === 'current');
      const startedAt = current?.startedAt ?? tracker.currentStepStartedAt ?? (tracker.baseline === tracker.current ? tracker.startedAt : undefined);
      const amount = current?.amount ?? tracker.current;
      const unit = current?.unit ?? tracker.unit ?? '';
      const level = amount === undefined ? '' : `Current level ${amount} ${unit.trim()}`.trim();
      tapering.push({ id: tracker.id, title, timeframe: `${level ? `${level} · ` : ''}Time at this level · ${timeSince(startedAt, now)}`, href });
    }
  }
  return { quitting, tapering };
}
