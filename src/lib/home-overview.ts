import { TrackerState } from '@/models/tracker';
import { StepResult } from './activity-steps';
import { goalForDate as stepGoalForDate } from './activity-step-history';
import { routeCaloriesForDate } from './activity';
import { cpapGoalProgress } from './cpap';
import { normalizeScheduleTimes, scheduledDoseKey } from './medications';
import { goalForDate as nutritionGoalForDate, macroCalories, nutritionTotals } from './nutrition';
import { DEFAULT_PREFERENCES } from './preferences';
import { localDateKey } from './progress';

export type HomeAttention = { id: string; title: string; detail: string; href: '/medications' | '/activity' };

export function nutritionGoalReached(calories: number, budget: number, entryCount: number) {
  return entryCount > 0 && Math.abs(calories - budget) <= 200;
}

export function homeOverview(state: TrackerState, steps: StepResult, now: Date) {
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const today = localDateKey(now);
  const stepTarget = preferences.visibleSections.activity ? stepGoalForDate(state.stepGoals ?? [], today) : 0;
  const hasSteps = steps.count !== undefined && Number.isFinite(steps.count);
  const liveSteps = steps.status === 'available' && hasSteps;
  const stepProgress = stepTarget ? { count: hasSteps ? steps.count! : null, target: stepTarget, reached: liveSteps && steps.count! >= stepTarget, pending: !liveSteps } : null;
  const cpap = preferences.visibleSections.cpap ? cpapGoalProgress(state.cpapUsageGoals ?? [], state.cpapReadings ?? [], now) : null;

  const nutritionGoal = preferences.visibleSections.nutrition && (state.nutritionGoals ?? []).some((goal) => goal.effectiveDate <= today)
    ? nutritionGoalForDate(state.nutritionGoals ?? [], today) : undefined;
  const nutrition = nutritionGoal ? {
    ...nutritionTotals(state.nutritionEntries ?? [], today),
    budget: macroCalories(nutritionGoal) + routeCaloriesForDate(state.activityRoutes ?? [], today, preferences.includeRouteCaloriesInNutrition ?? false),
  } : null;
  const nutritionReached = Boolean(nutrition && nutritionGoalReached(nutrition.calories, nutrition.budget, nutrition.entryCount));

  const activeMedications = preferences.visibleSections.health && preferences.visibleHealthModules.medications
    ? (state.medications ?? []).filter((medication) => !medication.archived && (!medication.startedAt || medication.startedAt.slice(0, 10) <= today) && (!medication.endedAt || medication.endedAt.slice(0, 10) >= today))
    : [];
  const weekday = now.getDay() + 1;
  const dueToday = activeMedications.flatMap((medication) => {
    if (medication.schedule.type !== 'daily' && !(medication.schedule.type === 'weekly' && medication.schedule.weekdays?.includes(weekday))) return [];
    return normalizeScheduleTimes(medication.schedule.times).map((time) => ({ medication, time, key: scheduledDoseKey(today, time) }));
  });
  const statusFor = (medicationId: string, key: string) => (state.medicationEvents ?? []).find((event) => event.medicationId === medicationId && event.scheduledFor === key && event.outcome !== 'snoozed')?.outcome;
  const taken = dueToday.filter(({ medication, key }) => statusFor(medication.id, key) === 'taken').length;
  const skipped = dueToday.filter(({ medication, key }) => statusFor(medication.id, key) === 'skipped').length;
  const medications = dueToday.length ? { total: dueToday.length, taken, skipped, reached: taken === dueToday.length } : null;

  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const overdue = dueToday.filter(({ medication, key, time: scheduledTime }) => scheduledTime < time && !statusFor(medication.id, key));
  const attention: HomeAttention[] = [];
  if (overdue.length) attention.push({ id: 'overdue-medications', title: `${overdue.length} scheduled ${overdue.length === 1 ? 'dose' : 'doses'} not logged`, detail: 'Open Medications & Supplements to review today’s schedule.', href: '/medications' });
  if (preferences.visibleSections.activity && steps.status === 'interrupted') attention.push({ id: 'steps-interrupted', title: 'Step tracking interrupted', detail: 'Open Activity to restart tracking.', href: '/activity' });

  const goalCount = Number(Boolean(stepProgress)) + Number(Boolean(medications)) + Number(Boolean(cpap)) + Number(Boolean(nutrition));
  const reachedCount = Number(Boolean(stepProgress?.reached)) + Number(Boolean(medications?.reached)) + Number(Boolean(cpap?.reached)) + Number(nutritionReached);
  return { stepProgress, cpap, nutrition, nutritionReached, medications, goalCount, reachedCount, attention };
}
