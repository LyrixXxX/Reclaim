import { TrackerState } from '@/models/tracker';

export const RECLAIM_BACKUP_FORMAT = 'reclaim-full-backup' as const;
export const RECLAIM_BACKUP_VERSION = 2 as const;

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
  'cpapMaintenanceItems', 'cpapMaintenanceEvents', 'medications',
  'medicationEvents', 'labTrackers', 'labResults', 'nutritionGoals', 'nutritionMealGroups',
  'savedFoods', 'savedMeals', 'nutritionEntries', 'activityRoutes', 'stepHistory', 'stepGoals',
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
  if (!isObject(value) || value.format !== RECLAIM_BACKUP_FORMAT || (value.version !== 1 && value.version !== RECLAIM_BACKUP_VERSION)) {
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
