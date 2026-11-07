import { TrackerState } from '@/models/tracker';
import { StepResult } from './activity-steps';
import type { RecordingRoute } from './daily-calories';
import { goalForDate as stepGoalForDate } from './activity-step-history';
import { exerciseCaloriesForDate } from './workouts';
import { goalForDate as nutritionGoalForDate, nutritionCalorieTarget, nutritionTotals } from './nutrition';
import { DEFAULT_PREFERENCES } from './preferences';
import { localDateKey } from './progress';
import { formatMedicationTime } from './medications';
import { SUPPLEMENT_GOAL_ID, supplementDayGoal, supplementDosesForDate } from './supplements';
import { habitDate, habitProgress, routeMinutesOn, templateConfig } from './good-habit-templates';
import { waterProgress, waterDisplayAmount } from './water-habit';
import { walkingMinutesOutsideRoutes, WalkingInterval } from './walking-minutes';

export type HomeAttention = { id: string; title: string; detail: string; href: '/activity' | '/supplements' };
export type HomeHabitGoal = { id: string; title: string; value: string; detail: string; /** One short line for compact tiles. */ short: string; progress: number; reached: boolean; href: string; weekly: boolean };
export type HomeWalkingData = { date?: string; intervals: WalkingInterval[] | null; activeRoute?: RecordingRoute | null };

/** One short line for the compact Home tile. */
export function nutritionShortDetail(calories: number, budget: number, entryCount: number) {
  if (!entryCount) return 'No food logged yet';
  const difference = Math.round(Math.abs(calories - budget)).toLocaleString();
  return calories > budget ? `${difference} kcal over` : `${difference} kcal left`;
}

export function homeOverview(state: TrackerState, steps: StepResult, now: Date, walking?: HomeWalkingData) {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const today = localDateKey(now);
  const stepTarget = preferences.visibleSections.activity ? stepGoalForDate(state.stepGoals ?? [], today) : 0;
  const hasSteps = steps.count !== undefined && Number.isFinite(steps.count);
  const liveSteps = steps.status === 'available' && hasSteps;
  const stepProgress = stepTarget ? { count: hasSteps ? steps.count! : null, target: stepTarget, reached: liveSteps && steps.count! >= stepTarget, pending: !liveSteps } : null;

  const nutritionGoal = preferences.visibleSections.nutrition && (state.nutritionGoals ?? []).some((goal) => goal.effectiveDate <= today)
    ? nutritionGoalForDate(state.nutritionGoals ?? [], today) : undefined;
  const nutrition = nutritionGoal ? {
    ...nutritionTotals(state.nutritionEntries ?? [], today),
    budget: nutritionCalorieTarget(nutritionGoal) + exerciseCaloriesForDate(state.activityRoutes ?? [], state.workoutSessions ?? [], today, preferences.includeRouteCaloriesInNutrition ?? false, preferences.includeWorkoutCaloriesInNutrition ?? false).total,
  } : null;

  const hidden = new Set(preferences.hiddenHomeHabitIds ?? []);
  const currentWalkingIntervals = walking?.date === today ? walking.intervals : null;
  const phoneMinutes = currentWalkingIntervals ? walkingMinutesOutsideRoutes(currentWalkingIntervals, state.activityRoutes ?? [], walking?.activeRoute, now.getTime()) : 0;
  const habitGoals: HomeHabitGoal[] = state.trackers.filter((tracker) => !tracker.archived && tracker.habitTemplate && tracker.habitTemplate !== 'mindfulness' && !hidden.has(tracker.id)).flatMap((tracker) => {
    const config = templateConfig(tracker.habitTemplate);
    if (!config && tracker.habitTemplate !== 'water') return [];
    const weekly = config?.period === 'week';
    const progress = tracker.habitTemplate === 'water'
      ? waterProgress(tracker, state.waterLogs ?? [], today)
      : habitProgress(tracker, state.goodHabitLogs ?? [], state.activityRoutes ?? [], now, tracker.habitTemplate === 'walk' ? phoneMinutes : 0);
    if (!progress.goal || progress.goal <= 0) return [];
    const unit = tracker.habitTemplate === 'water' ? tracker.waterDisplayUnit ?? 'fl oz' : config?.unit ?? 'minutes';
    const amount = tracker.habitTemplate === 'water' ? waterDisplayAmount(progress.amount, unit as 'fl oz' | 'mL') : Number(progress.amount.toFixed(1)).toLocaleString();
    const target = tracker.habitTemplate === 'water' ? waterDisplayAmount(progress.goal, unit as 'fl oz' | 'mL') : progress.goal.toLocaleString();
    const walkDate = habitDate(tracker.habitTemplate, now);
    const routeMinutes = tracker.habitTemplate === 'walk' ? routeMinutesOn(state.activityRoutes ?? [], tracker, walkDate) : 0;
    const manualMinutes = tracker.habitTemplate === 'walk' ? (state.goodHabitLogs ?? []).filter((log) => log.trackerId === tracker.id && log.eventDate === walkDate).reduce((sum, log) => sum + log.amount, 0) : 0;
    const hasLegacyRoute = tracker.habitTemplate === 'walk' && (state.activityRoutes ?? []).some((route) => route.movingMs === undefined && ['walk', 'hike', 'run'].includes(route.kind) && localDateKey(new Date(route.startedAt)) === walkDate);
    const detail = tracker.habitTemplate === 'walk'
      ? `${currentWalkingIntervals ? `${Number(phoneMinutes.toFixed(1))} phone min` : 'Phone min unavailable'} · ${Number(routeMinutes.toFixed(1))} route min${hasLegacyRoute ? ' (some estimated)' : ''} · ${Number(manualMinutes.toFixed(1))} manual min`
      : `${amount} / ${target} ${unit} ${weekly ? 'this week' : 'today'}`;
    const left = Math.max(0, progress.goal - progress.amount);
    const leftText = tracker.habitTemplate === 'water' ? waterDisplayAmount(left, unit as 'fl oz' | 'mL') : Number(left.toFixed(1)).toLocaleString();
    const over = progress.amount - progress.goal;
    const overText = tracker.habitTemplate === 'water' ? waterDisplayAmount(over, unit as 'fl oz' | 'mL') : Number(over.toFixed(1)).toLocaleString();
    const short = over > 0 ? `+${overText} over goal` : over === 0 ? 'Goal reached' : `${leftText} ${unit} to go`;
    return [{ id: tracker.id, title: tracker.displayName || tracker.name, value: `${amount} / ${target} ${unit}`, detail, short, // Not capped, so going past a goal shows as more than 100%.
      progress: progress.goal > 0 ? progress.amount / progress.goal : 0,
      reached: progress.amount >= progress.goal, href: `/tracker/${encodeURIComponent(tracker.id)}`, weekly }];
  });
  const doses = preferences.visibleSections.supplements && !hidden.has(SUPPLEMENT_GOAL_ID) ? supplementDayGoal(state.medications ?? [], state.medicationEvents ?? [], today) : null;
  const left = doses ? doses.total - doses.taken : 0;
  const supplementGoal: HomeHabitGoal[] = doses ? [{
    id: SUPPLEMENT_GOAL_ID, title: 'Supplements', value: `${doses.taken} / ${doses.total} taken`,
    detail: `${doses.taken} of ${doses.total} taken today`, short: doses.reached ? 'All taken' : `${left} left today`,
    progress: doses.taken / doses.total, reached: doses.reached, href: '/supplements', weekly: false,
  }] : [];
  const dailyHabitGoals = [...habitGoals.filter((goal) => !goal.weekly), ...supplementGoal];
  const weeklyHabitCards = habitGoals.filter((goal) => goal.weekly);

  const attention: HomeAttention[] = [];
  if (preferences.visibleSections.activity && steps.status === 'interrupted') attention.push({ id: 'steps-interrupted', title: 'Step tracking interrupted', detail: 'Open Steps to restart tracking.', href: '/activity' });
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const dose of supplementDosesForDate(state.medications ?? [], state.medicationEvents ?? [], today)) {
    if (dose.status || dose.time > currentTime) continue;
    attention.push({ id: `supplement-${dose.medication.id}-${dose.time}`, title: `Supplement: ${dose.medication.name}`,
      detail: `${formatMedicationTime(dose.time)} · Not logged yet`, href: '/supplements' });
  }

  const goalCount = Number(Boolean(stepProgress)) + dailyHabitGoals.length;
  const reachedCount = Number(Boolean(stepProgress?.reached)) + dailyHabitGoals.filter((goal) => goal.reached).length;
  return { stepProgress, nutrition, dailyHabitGoals, weeklyHabitCards, goalCount, reachedCount, attention };
}
