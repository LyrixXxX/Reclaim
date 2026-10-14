import { TrackerState } from '@/models/tracker';
import { validWaterDate } from '@/lib/water-habit';
import { GOOD_HABIT_TEMPLATES, validHabitLog } from '@/lib/good-habit-templates';
import { isMuscleGroup } from '@/lib/workout-muscles';
import { validWorkoutDate } from '@/lib/workout-analytics';

export const RECLAIM_BACKUP_FORMAT = 'reclaim-full-backup' as const;
export const RECLAIM_BACKUP_VERSION = 3 as const;

export type BackupAttachment = {
  ownerType: 'cpap' | 'lab' | 'nutrition';
  ownerId: string;
  extension: string;
  mimeType?: string;
  base64: string;
};

export type ReclaimBackup = {
  format: typeof RECLAIM_BACKUP_FORMAT;
  version: typeof RECLAIM_BACKUP_VERSION;
  exportedAt: string;
  state: TrackerState;
  attachments: BackupAttachment[];
};

const stateArrayKeys = [
  'trackers', 'checkIns', 'lapseEvents', 'historicalEntries', 'taperSteps',
  'healthReadings', 'cpapReadings', 'cpapTherapySettings', 'cpapUsageGoals', 'weightEntries', 'cpapEquipment',
  'cpapMaintenanceItems', 'cpapMaintenanceEvents', 'medications', 'supplementStacks',
  'medicationEvents', 'labTrackers', 'labResults', 'nutritionGoals', 'nutritionMealGroups',
  'savedFoods', 'savedMeals', 'nutritionEntries', 'activityRoutes', 'stepHistory', 'stepGoals', 'waterLogs', 'goodHabitLogs', 'strengthExercises', 'workoutRoutines', 'workoutSessions', 'actualOneRepMaxes',
] as const;

export function createReclaimBackup(
  state: TrackerState,
  attachments: BackupAttachment[] = [],
  exportedAt = new Date().toISOString(),
): ReclaimBackup {
  return {
    format: RECLAIM_BACKUP_FORMAT,
    version: RECLAIM_BACKUP_VERSION,
    exportedAt,
    state: clone(state),
    attachments: clone(attachments),
  };
}

export function parseReclaimBackup(raw: string): ReclaimBackup {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('This file is not valid JSON. Choose a Reclaim backup file.');
  }
  if (!isObject(value) || value.format !== RECLAIM_BACKUP_FORMAT || ![1, 2, RECLAIM_BACKUP_VERSION].includes(Number(value.version))) {
    throw new Error('This is not a supported Reclaim backup file.');
  }
  if (typeof value.exportedAt !== 'string' || !isObject(value.state)) {
    throw new Error('This Reclaim backup is incomplete. Nothing was restored.');
  }
  validateState(value.state);
  const attachments = value.attachments ?? [];
  if (!Array.isArray(attachments) || attachments.some((item) => !isAttachment(item))) {
    throw new Error('This Reclaim backup contains invalid photo data. Nothing was restored.');
  }
  return clone({ ...value, version: RECLAIM_BACKUP_VERSION } as ReclaimBackup);
}

export function backupSummary(state: TrackerState) {
  return {
    trackers: state.trackers.length,
    checkIns: state.checkIns.length + (state.historicalEntries?.length ?? 0),
    cpapReadings: state.cpapReadings?.length ?? 0,
    weightEntries: state.weightEntries?.length ?? 0,
    healthRecords: (state.healthReadings?.length ?? 0)
      + (state.medications?.length ?? 0)
      + (state.medicationEvents?.length ?? 0)
      + (state.labResults?.length ?? 0),
    nutritionEntries: state.nutritionEntries?.length ?? 0,
  };
}

function validateState(value: Record<string, unknown>) {
  if (!Array.isArray(value.trackers) || !Array.isArray(value.checkIns)) {
    throw new Error('This Reclaim backup is missing required tracker data. Nothing was restored.');
  }
  for (const key of stateArrayKeys) {
    if (value[key] !== undefined && !Array.isArray(value[key])) {
      throw new Error(`This Reclaim backup has invalid ${key} data. Nothing was restored.`);
    }
  }
  if (value.trackers.some((tracker) => !isObject(tracker)
    || typeof tracker.id !== 'string'
    || typeof tracker.name !== 'string'
    || !['abstinence', 'reduction', 'habit'].includes(String(tracker.mode))
    || (tracker.habitLogStyle !== undefined && !['done', 'count'].includes(String(tracker.habitLogStyle)))
    || (tracker.habitTemplate !== undefined && (![...GOOD_HABIT_TEMPLATES.map((item) => item.id), 'water'].includes(String(tracker.habitTemplate)) || tracker.mode !== 'habit'))
    || (GOOD_HABIT_TEMPLATES.some((item) => item.id === tracker.habitTemplate && (item.checklist ? !Array.isArray(tracker.habitChecklistHistory) || !tracker.habitChecklistHistory.length : !Array.isArray(tracker.habitGoalHistory) || !tracker.habitGoalHistory.length)))
    || (tracker.habitGoalHistory !== undefined && (!Array.isArray(tracker.habitGoalHistory) || tracker.habitGoalHistory.some((item: unknown) => !isObject(item) || typeof item.effectiveDate !== 'string' || !validWaterDate(item.effectiveDate) || typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value <= 0 || item.value > 10000)))
    || (tracker.exerciseGoalModes !== undefined && (!Array.isArray(tracker.exerciseGoalModes) || tracker.exerciseGoalModes.some((item: unknown) => !isObject(item) || typeof item.effectiveDate !== 'string' || !validWaterDate(item.effectiveDate) || !['times', 'minutes'].includes(String(item.mode)))))
    || (tracker.exerciseRegimenHistory !== undefined && (!Array.isArray(tracker.exerciseRegimenHistory) || tracker.exerciseRegimenHistory.some((item: unknown) => !isObject(item) || typeof item.effectiveDate !== 'string' || !validWaterDate(item.effectiveDate) || !Array.isArray(item.rows) || item.rows.length > 20 || new Set(item.rows.map((row: unknown) => isObject(row) ? row.id : undefined)).size !== item.rows.length || item.rows.some((row: unknown) => !isObject(row) || typeof row.id !== 'string' || typeof row.label !== 'string' || !row.label.trim() || !Array.isArray(row.days) || row.days.some((day: unknown) => typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6)))))
    || (tracker.producePresets !== undefined && (!Array.isArray(tracker.producePresets) || tracker.producePresets.length > 8 || tracker.producePresets.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 20)))
    || (tracker.habitChecklistHistory !== undefined && (!Array.isArray(tracker.habitChecklistHistory) || tracker.habitChecklistHistory.some((item: unknown) => !isObject(item) || typeof item.effectiveDate !== 'string' || !validWaterDate(item.effectiveDate) || !Array.isArray(item.items) || !item.items.length || item.items.some((step: unknown) => !isObject(step) || typeof step.id !== 'string' || typeof step.label !== 'string' || !step.label.trim()))))
    || (tracker.habitTemplate === 'water' && (!Array.isArray(tracker.waterGoals) || !tracker.waterGoals.length || tracker.waterQuickAddOz === undefined))
    || (tracker.waterQuickAddOz !== undefined && (typeof tracker.waterQuickAddOz !== 'number' || !Number.isFinite(tracker.waterQuickAddOz) || tracker.waterQuickAddOz <= 0 || tracker.waterQuickAddOz > 1000))
    || (tracker.waterDisplayUnit !== undefined && tracker.waterDisplayUnit !== 'fl oz' && tracker.waterDisplayUnit !== 'mL')
    || (tracker.waterPresetOz !== undefined && (!Array.isArray(tracker.waterPresetOz) || tracker.waterPresetOz.length > 8 || tracker.waterPresetOz.some((amount: unknown) => typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1000)))
    || (tracker.waterGoals !== undefined && (!Array.isArray(tracker.waterGoals) || tracker.waterGoals.some((goal: unknown) => !isObject(goal)
      || typeof goal.effectiveDate !== 'string' || !validWaterDate(goal.effectiveDate)
      || typeof goal.ounces !== 'number' || !Number.isFinite(goal.ounces) || goal.ounces <= 0 || goal.ounces > 1000)))
    || (tracker.habitReminderTime !== undefined && (typeof tracker.habitReminderTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(tracker.habitReminderTime)))
    || (tracker.habitNotificationId !== undefined && typeof tracker.habitNotificationId !== 'string')
    || (tracker.savingsExpenses !== undefined && (!Array.isArray(tracker.savingsExpenses)
      || tracker.savingsExpenses.some((expense: unknown) => !isObject(expense)
        || typeof expense.id !== 'string' || typeof expense.label !== 'string'
        || (expense.endedOn !== undefined && (typeof expense.endedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expense.endedOn)))
        || !Array.isArray(expense.rates) || !expense.rates.length
        || expense.rates.some((rate: unknown) => !isObject(rate)
          || typeof rate.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rate.effectiveDate)
          || typeof rate.amountCents !== 'number' || !Number.isInteger(rate.amountCents) || rate.amountCents <= 0
          || typeof rate.everyCount !== 'number' || !Number.isInteger(rate.everyCount) || rate.everyCount < 1
          || !['day', 'week', 'month'].includes(String(rate.everyUnit)))))))) {
    throw new Error('This Reclaim backup contains an invalid tracker. Nothing was restored.');
  }
  if (value.checkIns.some((date) => typeof date !== 'string')) {
    throw new Error('This Reclaim backup contains invalid check-in dates. Nothing was restored.');
  }
  if (Array.isArray(value.medications) && value.medications.some((item) => !isObject(item)
    || (item.kind !== undefined && item.kind !== 'medication' && item.kind !== 'supplement'))) {
    throw new Error('This Reclaim backup contains an invalid medication or supplement type. Nothing was restored.');
  }
  if (Array.isArray(value.supplementStacks)) {
    const slots = new Set<string>();
    for (const stack of value.supplementStacks) {
      if (!isObject(stack) || typeof stack.id !== 'string' || !stack.id || typeof stack.name !== 'string' || !stack.name.trim()
        || !Array.isArray(stack.members) || stack.members.some((member: unknown) => !isObject(member)
          || typeof member.medicationId !== 'string' || typeof member.time !== 'string'
          || !/^([01]\d|2[0-3]):[0-5]\d$/.test(member.time))) {
        throw new Error('This Reclaim backup contains invalid supplement stacks. Nothing was restored.');
      }
      for (const member of stack.members) {
        const key = `${member.medicationId}\u0000${member.time}`;
        if (slots.has(key)) throw new Error('This Reclaim backup contains duplicate supplement stack doses. Nothing was restored.');
        slots.add(key);
      }
    }
  }
  if (value.weightTdeeProfile !== undefined && (!isObject(value.weightTdeeProfile)
    || typeof value.weightTdeeProfile.heightCm !== 'number' || !Number.isFinite(value.weightTdeeProfile.heightCm)
    || value.weightTdeeProfile.heightCm < 80 || value.weightTdeeProfile.heightCm > 250
    || typeof value.weightTdeeProfile.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.weightTdeeProfile.birthDate)
    || !Number.isFinite(Date.parse(`${value.weightTdeeProfile.birthDate}T12:00:00`))
    || !['male', 'female'].includes(String(value.weightTdeeProfile.formulaSex)))) {
    throw new Error('This Reclaim backup contains an invalid Weight estimate profile. Nothing was restored.');
  }
  if (Array.isArray(value.activityRoutes) && value.activityRoutes.some((route) => !isObject(route)
    || typeof route.id !== 'string'
    || (route.kind !== 'walk' && route.kind !== 'hike' && route.kind !== 'run' && route.kind !== 'route')
    || typeof route.startedAt !== 'string'
    || typeof route.endedAt !== 'string'
    || typeof route.pausedMs !== 'number'
    || typeof route.distanceMeters !== 'number'
    || (route.estimateWeightKg !== undefined && (typeof route.estimateWeightKg !== 'number' || !Number.isFinite(route.estimateWeightKg) || route.estimateWeightKg <= 0))
    || (route.estimatedCalories !== undefined && (typeof route.estimatedCalories !== 'number' || !Number.isFinite(route.estimatedCalories) || route.estimatedCalories < 0))
    || (route.name !== undefined && (typeof route.name !== 'string' || route.name.length > 120))
    || (route.notes !== undefined && (typeof route.notes !== 'string' || route.notes.length > 2000))
    || !Array.isArray(route.points)
    || route.points.some((point: unknown) => !isObject(point)
      || typeof point.latitude !== 'number' || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90
      || typeof point.longitude !== 'number' || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180
      || typeof point.timestamp !== 'number'))) {
    throw new Error('This Reclaim backup contains invalid activity routes. Nothing was restored.');
  }
  if (Array.isArray(value.stepHistory) && value.stepHistory.some((day) => !isObject(day)
    || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)
    || typeof day.count !== 'number' || !Number.isInteger(day.count) || day.count < 0
    || typeof day.incomplete !== 'boolean')) {
    throw new Error('This Reclaim backup contains invalid step history. Nothing was restored.');
  }
  if (Array.isArray(value.stepGoals) && value.stepGoals.some((goal) => !isObject(goal)
    || typeof goal.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(goal.effectiveDate)
    || typeof goal.count !== 'number' || !Number.isInteger(goal.count) || goal.count < 1 || goal.count > 100000)) {
    throw new Error('This Reclaim backup contains invalid step goals. Nothing was restored.');
  }
  if (Array.isArray(value.cpapUsageGoals) && value.cpapUsageGoals.some((goal) => !isObject(goal)
    || typeof goal.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(goal.effectiveDate)
    || !Number.isFinite(Date.parse(`${goal.effectiveDate}T12:00:00`))
    || typeof goal.minutes !== 'number' || !Number.isInteger(goal.minutes) || goal.minutes < 1 || goal.minutes > 1440)) {
    throw new Error('This Reclaim backup contains invalid CPAP usage goals. Nothing was restored.');
  }
  if (Array.isArray(value.waterLogs) && value.waterLogs.some((log) => !isObject(log)
    || typeof log.id !== 'string' || typeof log.trackerId !== 'string'
    || typeof log.eventDate !== 'string' || !validWaterDate(log.eventDate)
    || typeof log.recordedAt !== 'string' || !Number.isFinite(Date.parse(log.recordedAt))
    || typeof log.ounces !== 'number' || !Number.isFinite(log.ounces) || log.ounces <= 0 || log.ounces > 1000)) {
    throw new Error('This Reclaim backup contains invalid water logs. Nothing was restored.');
  }
  if (Array.isArray(value.goodHabitLogs) && value.goodHabitLogs.some((log) => !isObject(log) || !validHabitLog(log as never))) {
    throw new Error('This Reclaim backup contains invalid good habit logs. Nothing was restored.');
  }
  if ((value.strengthExercises as unknown[] | undefined)?.some((item) => !validStrengthExercise(item))
    || (value.workoutRoutines as unknown[] | undefined)?.some((item) => !isObject(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || (item.notes !== undefined && typeof item.notes !== 'string') || (item.weekdays !== undefined && (!Array.isArray(item.weekdays) || item.weekdays.some((day: unknown) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6))) || !Array.isArray(item.exercises) || item.exercises.some((entry: unknown) => !validWorkoutExercise(entry)))
    || (value.workoutSessions as unknown[] | undefined)?.some((item) => !validWorkoutSession(item, true))
    || (value.actualOneRepMaxes as unknown[] | undefined)?.some((item) => !validActualOneRepMax(item))
    || (value.activeWorkout !== undefined && !validWorkoutSession(value.activeWorkout, false))) {
    throw new Error('This Reclaim backup contains invalid workout data. Nothing was restored.');
  }
  if (value.workoutSettings !== undefined && (!isObject(value.workoutSettings)
    || !['smart', 'timed', 'simple'].includes(String(value.workoutSettings.timingMode))
    || !Number.isInteger(value.workoutSettings.restSeconds) || Number(value.workoutSettings.restSeconds) < 0 || Number(value.workoutSettings.restSeconds) > 3600
    || !['lb', 'kg'].includes(String(value.workoutSettings.weightUnit)))) {
    throw new Error('This Reclaim backup contains invalid workout settings. Nothing was restored.');
  }
}

function validStrengthExercise(item: unknown) {
  return isObject(item) && typeof item.id === 'string' && typeof item.name === 'string' && !!item.name.trim()
    && isMuscleGroup(item.primaryMuscle)
    && ['machine','barbell','dumbbell','cable','bodyweight','other'].includes(String(item.equipment))
    && Array.isArray(item.secondaryMuscles) && item.secondaryMuscles.every(isMuscleGroup)
    && (item.measurementType === undefined || ['weighted_reps','bodyweight_reps','assisted_reps','timed_hold','distance_carry'].includes(String(item.measurementType)))
    && (item.aliases === undefined || (Array.isArray(item.aliases) && item.aliases.every((alias: unknown) => typeof alias === 'string')));
}
function validWorkoutExercise(item: unknown) {
  return isObject(item) && typeof item.id === 'string' && typeof item.exerciseId === 'string' && typeof item.name === 'string' && isMuscleGroup(item.primaryMuscle)
    && (item.secondaryMuscles === undefined || (Array.isArray(item.secondaryMuscles) && item.secondaryMuscles.every(isMuscleGroup)))
    && ['machine','barbell','dumbbell','cable','bodyweight','other'].includes(String(item.equipment)) && (item.plannedSets === undefined || (Number.isInteger(item.plannedSets) && Number(item.plannedSets) >= 0 && Number(item.plannedSets) <= 100))
    && (item.measurementType === undefined || ['weighted_reps','bodyweight_reps','assisted_reps','timed_hold','distance_carry'].includes(String(item.measurementType)))
    && (item.notes === undefined || typeof item.notes === 'string')
    && Array.isArray(item.sets) && item.sets.every((set: unknown) => isObject(set) && typeof set.id === 'string' && ['warmup','working','drop','failure'].includes(String(set.kind))
      && Number.isInteger(set.reps) && Number(set.reps) >= 1 && Number(set.reps) <= 1000 && typeof set.completedAt === 'string' && Number.isFinite(Date.parse(set.completedAt))
      && (set.weightKg === undefined || (typeof set.weightKg === 'number' && Number.isFinite(set.weightKg) && set.weightKg >= 0))
      && (set.assistanceKg === undefined || (typeof set.assistanceKg === 'number' && Number.isFinite(set.assistanceKg) && set.assistanceKg >= 0))
      && (set.holdSeconds === undefined || (typeof set.holdSeconds === 'number' && Number.isFinite(set.holdSeconds) && set.holdSeconds > 0))
      && (set.distanceMeters === undefined || (typeof set.distanceMeters === 'number' && Number.isFinite(set.distanceMeters) && set.distanceMeters > 0)));
}
function validActualOneRepMax(item: unknown) {
  return isObject(item) && typeof item.id === 'string' && typeof item.exerciseId === 'string'
    && typeof item.weightKg === 'number' && Number.isFinite(item.weightKg) && item.weightKg > 0
    && validWorkoutDate(item.date)
    && (item.notes === undefined || typeof item.notes === 'string') && (item.context === undefined || typeof item.context === 'string')
    && (item.sourceSetId === undefined || typeof item.sourceSetId === 'string');
}
function validWorkoutSession(item: unknown, completed: boolean) {
  return isObject(item) && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.startedAt === 'string' && Number.isFinite(Date.parse(item.startedAt))
    && (!completed || (typeof item.endedAt === 'string' && Number.isFinite(Date.parse(item.endedAt))))
    && typeof item.pausedMs === 'number' && Number.isFinite(item.pausedMs) && item.pausedMs >= 0
    && Array.isArray(item.exercises) && item.exercises.every((entry: unknown) => validWorkoutExercise(entry))
    && (item.setDrafts === undefined || (!completed && isObject(item.setDrafts)
      && Object.entries(item.setDrafts).every(([id, draft]) => id.length <= 120 && isObject(draft)
        && typeof draft.weight === 'string' && draft.weight.length <= 32
        && typeof draft.reps === 'string' && draft.reps.length <= 32
        && typeof draft.notes === 'string' && draft.notes.length <= 2000
        && (draft.autoSuggested === undefined || typeof draft.autoSuggested === 'boolean')
        && ['warmup','working','drop','failure'].includes(String(draft.kind))
        && ['lb','kg'].includes(String(draft.unit)))));
}

function isAttachment(value: unknown): value is BackupAttachment {
  return isObject(value)
    && (value.ownerType === 'cpap' || value.ownerType === 'lab' || value.ownerType === 'nutrition')
    && typeof value.ownerId === 'string'
    && typeof value.extension === 'string'
    && typeof value.base64 === 'string'
    && (value.mimeType === undefined || typeof value.mimeType === 'string');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
