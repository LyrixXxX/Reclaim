import { TrackerState } from '@/models/tracker';
import { StepResult } from './activity-steps';
import { goalForDate as stepGoalForDate } from './activity-step-history';
import { exerciseCaloriesForDate } from './workouts';
import { goalForDate as nutritionGoalForDate, macroCalories, nutritionTotals } from './nutrition';
import { DEFAULT_PREFERENCES } from './preferences';
import { localDateKey } from './progress';
import { formatMedicationTime } from './medications';
import { supplementDosesForDate } from './supplements';

export type HomeAttention = { id: string; title: string; detail: string; href: '/activity' | '/supplements' };

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

export function homeOverview(state: TrackerState, steps: StepResult, now: Date) {
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

  const attention: HomeAttention[] = [];
  if (preferences.visibleSections.activity && steps.status === 'interrupted') attention.push({ id: 'steps-interrupted', title: 'Step tracking interrupted', detail: 'Open Steps to restart tracking.', href: '/activity' });
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const dose of supplementDosesForDate(state.medications ?? [], state.medicationEvents ?? [], today)) {
    if (dose.status || dose.time > currentTime) continue;
    attention.push({ id: `supplement-${dose.medication.id}-${dose.time}`, title: `Supplement: ${dose.medication.name}`,
      detail: `${formatMedicationTime(dose.time)} · Not logged yet`, href: '/supplements' });
  }

  const goalCount = Number(Boolean(stepProgress)) + Number(Boolean(nutrition));
  const reachedCount = Number(Boolean(stepProgress?.reached)) + Number(nutritionReached);
  return { stepProgress, nutrition, nutritionReached, goalCount, reachedCount, attention };
}
