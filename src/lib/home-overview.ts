import { TrackerState } from '@/models/tracker';
import { StepResult } from './activity-steps';
import { goalForDate as stepGoalForDate } from './activity-step-history';
import { exerciseCaloriesForDate } from './workouts';
import { goalForDate as nutritionGoalForDate, macroCalories, nutritionTotals } from './nutrition';
import { DEFAULT_PREFERENCES } from './preferences';
import { localDateKey } from './progress';
import { formatMedicationTime } from './medications';
import { supplementDosesForDate } from './supplements';
import { habitDate, habitProgress, routeMinutesOn, templateConfig } from './good-habit-templates';
import { waterProgress, waterDisplayAmount } from './water-habit';
import { walkingMinutesOutsideRoutes, WalkingInterval } from './walking-minutes';

export type HomeAttention = { id: string; title: string; detail: string; href: '/activity' | '/supplements' };
export type HomeHabitGoal = { id: string; title: string; value: string; detail: string; progress: number; reached: boolean; href: string; weekly: boolean };
export type HomeWalkingData = { date?: string; intervals: WalkingInterval[] | null; activeRoute?: { startedAt: string } | null };

export function nutritionGoalReached(calories: number, budget: number, entryCount: number) {
  return entryCount > 0 && Math.abs(calories - budget) <= 200;
}

export function nutritionGoalDetail(calories: number, budget: number, entryCount: number) {
  if (!entryCount) return 'No food logged yet';
  const difference = Math.round(Math.abs(calories - budget)).toLocaleString();
  if (calories > budget) return `${difference} kcal over budget · ${nutritionGoalReached(calories, budget, entryCount) ? 'goal met' : 'goal not met'}`;
  if (calories < budget - 200) return `${difference} kcal under budget · goal not met`;
  return calories < budget ? `${difference} kcal under budget · goal met` : 'On budget · goal met';
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
    budget: macroCalories(nutritionGoal) + exerciseCaloriesForDate(state.activityRoutes ?? [], state.workoutSessions ?? [], today, preferences.includeRouteCaloriesInNutrition ?? false, preferences.includeWorkoutCaloriesInNutrition ?? false).total,
  } : null;
  const nutritionReached = Boolean(nutrition && nutritionGoalReached(nutrition.calories, nutrition.budget, nutrition.entryCount));

  const hidden = new Set(preferences.hiddenHomeHabitIds ?? []);
  const currentWalkingIntervals = walking?.date === today ? walking.intervals : null;
  const phoneMinutes = currentWalkingIntervals ? walkingMinutesOutsideRoutes(currentWalkingIntervals, state.activityRoutes ?? [], walking?.activeRoute, now.getTime()) : 0;
  const habitGoals: HomeHabitGoal[] = state.trackers.filter((tracker) => !tracker.archived && tracker.habitTemplate && !hidden.has(tracker.id)).flatMap((tracker) => {
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
    return [{ id: tracker.id, title: tracker.displayName || tracker.name, value: `${amount} / ${target} ${unit}`, detail, progress: progress.percent / 100,
      reached: progress.amount >= progress.goal, href: `/tracker/${encodeURIComponent(tracker.id)}`, weekly }];
  });
  const dailyHabitGoals = habitGoals.filter((goal) => !goal.weekly);
  const weeklyHabitCards = habitGoals.filter((goal) => goal.weekly);

  const attention: HomeAttention[] = [];
  if (preferences.visibleSections.activity && steps.status === 'interrupted') attention.push({ id: 'steps-interrupted', title: 'Step tracking interrupted', detail: 'Open Steps to restart tracking.', href: '/activity' });
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const dose of supplementDosesForDate(state.medications ?? [], state.medicationEvents ?? [], today)) {
    if (dose.status || dose.time > currentTime) continue;
    attention.push({ id: `supplement-${dose.medication.id}-${dose.time}`, title: `Supplement: ${dose.medication.name}`,
      detail: `${formatMedicationTime(dose.time)} · Not logged yet`, href: '/supplements' });
  }

  const goalCount = Number(Boolean(stepProgress)) + Number(Boolean(nutrition)) + dailyHabitGoals.length;
  const reachedCount = Number(Boolean(stepProgress?.reached)) + Number(nutritionReached) + dailyHabitGoals.filter((goal) => goal.reached).length;
  return { stepProgress, nutrition, nutritionReached, dailyHabitGoals, weeklyHabitCards, goalCount, reachedCount, attention };
}
