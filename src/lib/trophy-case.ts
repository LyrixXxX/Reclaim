import { ActivityRoute, GoodHabitLog, HistoricalEntry, TaperStep, Tracker, WaterLog } from '@/models/tracker';
import { HABIT_MILESTONES, MilestoneProgress, milestoneProgress, templateMilestoneProgress } from './habit-milestones';
import { habitDate } from './good-habit-templates';
import { localDateKey } from './progress';
import { taperQuitPhase, trackerJourneySection } from './taper-quit';
import { trackerDisplayName } from './tracker-management';

export type TrophyData = {
  trackers: readonly Tracker[];
  historicalEntries?: readonly HistoricalEntry[];
  goodHabitLogs?: readonly GoodHabitLog[];
  waterLogs?: readonly WaterLog[];
  activityRoutes?: readonly ActivityRoute[];
  taperSteps?: readonly TaperStep[];
};
export type TrackerBadges = MilestoneProgress & { tracker: Tracker; name: string; quit: boolean };
export type NextBadge = { tracker: Tracker; name: string; days: number; index: number; label: string; progress: number; remainingDays: number; line: string };
export type EarnedBadge = { tracker: Tracker; name: string; days: number; index: number; label: string; subtitle: string; firstEarned: string; count: number };

/** Every tracker that can earn badges. Archived ones stay listed so what they earned isn't lost. */
export function trackerBadges(data: TrophyData, now = new Date(), phoneMinutesByDate: Record<string, number> = {}): TrackerBadges[] {
  const steps = [...(data.taperSteps ?? [])];
  return data.trackers.flatMap((tracker) => {
    const quit = tracker.mode !== 'habit';
    if (quit && trackerJourneySection(tracker, steps) !== 'quitting') return [];
    const progress = tracker.mode === 'habit' && tracker.habitTemplate
      ? templateMilestoneProgress(tracker, { goodHabitLogs: data.goodHabitLogs ?? [], waterLogs: data.waterLogs ?? [], routes: data.activityRoutes ?? [], phoneMinutesByDate }, now)
      : milestoneProgress(tracker, (data.historicalEntries ?? []).filter((entry) => entry.trackerId === tracker.id), quit ? taperQuitPhase(tracker, steps)?.startedAt ?? tracker.startedAt : tracker.startedAt, now);
    return [{ ...progress, tracker, name: trackerDisplayName(tracker), quit }];
  });
}

function count(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/** The next badge this tracker's current run is heading for. Past a year it counts to the next full year. */
export function nextBadge(badges: TrackerBadges): NextBadge | null {
  const { tracker, name, runDays, periodDays, quit, canEarn, started } = badges;
  if (tracker.archived || !started || (!quit && !canEarn)) return null;
  const index = HABIT_MILESTONES.findIndex(({ days }) => days > runDays && days >= periodDays);
  const lastIndex = HABIT_MILESTONES.length - 1;
  const year = HABIT_MILESTONES[lastIndex].days;
  const days = index >= 0 ? HABIT_MILESTONES[index].days : (Math.floor(runDays / year) + 1) * year;
  const label = index >= 0 ? HABIT_MILESTONES[index].label : `${Math.round(days / year)} Years`;
  const remainingDays = days - runDays;
  const left = periodDays >= 28 ? count(Math.ceil(remainingDays / 30), 'month') : periodDays === 7 ? count(Math.ceil(remainingDays / 7), 'week') : count(remainingDays, 'day');
  const line = !quit && runDays === 0
    ? `Hit ${periodDays === 1 ? 'today’s' : periodDays === 7 ? 'this week’s' : 'this month’s'} goal to start toward ${label}`
    : `${left} to ${label}`;
  return { tracker, name, days, index: index >= 0 ? index : lastIndex, label, progress: Math.min(1, runDays / days), remainingDays, line };
}

/** The badge you're closest to overall: furthest along, then fewest days left. */
export function closestBadge(list: readonly TrackerBadges[]): NextBadge | null {
  const options = list.map(nextBadge).filter((item): item is NextBadge => item !== null);
  return options.sort((a, b) => b.progress - a.progress || a.remainingDays - b.remainingDays)[0] ?? null;
}

/** Badges earned at least once, newest first. Earning one again adds to its count. */
export function earnedBadges(list: readonly TrackerBadges[]): EarnedBadge[] {
  return list.flatMap(({ tracker, name, awards }) => awards.flatMap((award, index) => award.dates.length
    ? [{ tracker, name, days: award.days, index, label: HABIT_MILESTONES[index].label, subtitle: HABIT_MILESTONES[index].subtitle, firstEarned: award.dates[0], count: award.dates.length }]
    : [])).sort((a, b) => b.firstEarned.localeCompare(a.firstEarned) || b.days - a.days);
}

export type TrophyTab = 'good' | 'quit';
/** Opens the trophy case on the tab this tracker's badges live under. */
export const trophyCaseHref = (tracker: Pick<Tracker, 'mode'>) => `/trophy-case?tab=${tracker.mode === 'habit' ? 'good' : 'quit'}`;

export const badgeKey = (trackerId: string, days: number) => `${trackerId}:${days}`;
const RECENT_DAYS = 3;

function biggestPerTracker(badges: readonly EarnedBadge[]) {
  return [...new Map([...badges].sort((a, b) => a.days - b.days).map((badge) => [badge.tracker.id, badge])).values()];
}

/**
 * What the unlock screen should celebrate. Only a badge's first earning counts, and only recently, so a
 * backfilled log or a restored backup can't set off a pile of old ones. The first run ever records what's
 * already earned without celebrating it. When a habit earns several at once, its biggest one is shown.
 */
export function badgeUnlocks(list: readonly TrackerBadges[], seen: readonly string[] | undefined, now = new Date()): { show: EarnedBadge[]; markSeen: string[] } {
  const known = new Set(seen ?? []);
  const fresh = earnedBadges(list).filter((badge) => !badge.tracker.archived && !known.has(badgeKey(badge.tracker.id, badge.days)));
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  const recentFrom = localDateKey(cutoff);
  const celebrate = seen === undefined ? [] : fresh.filter((badge) => badge.firstEarned >= recentFrom);
  const held = new Set(celebrate.map((badge) => badgeKey(badge.tracker.id, badge.days)));
  return { show: biggestPerTracker(celebrate), markSeen: fresh.map((badge) => badgeKey(badge.tracker.id, badge.days)).filter((key) => !held.has(key)) };
}

/** Each good habit's biggest first-time badge earned today, for the bell. Quit trackers have their own notes. */
export function badgesEarnedToday(list: readonly TrackerBadges[], now = new Date()): EarnedBadge[] {
  return biggestPerTracker(earnedBadges(list.filter((badges) => !badges.quit && !badges.tracker.archived))
    .filter((badge) => badge.firstEarned === habitDate(badge.tracker.habitTemplate, now)));
}
