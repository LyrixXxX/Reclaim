import { CustomNutrient, Medication, MedicationEvent } from '@/models/tracker';
import { medicationDateKey, normalizeScheduleTimes, scheduledDoseKey } from './medications';
import { scheduledDosesForDate } from './medication-regimen';
import { localDateKey } from './progress';
import { toCanonicalNutrientAmount } from './nutrient-catalog';

export type SupplementDraft = {
  id?: string; name: string; serving: string; notes: string;
  dosagePerUnit?: number; dosageUnit?: string; defaultUnitsTaken?: number;
  nutrientProfile?: Medication['nutrientProfile'];
  /** Retained for drafts made by the previous single-time editor. */
  time?: string;
  times?: string[];
  scheduleType?: 'daily' | 'weekly' | 'interval' | 'as_needed';
  weekdays?: number[];
  intervalHours?: number;
};

export function visibleSupplements(items: Medication[]) {
  return items.filter((item) => item.kind === 'supplement');
}

export function validateSupplementDraft(draft: SupplementDraft) {
  if (!draft.name.trim()) return 'Enter a vitamin or supplement name.';
  if (draft.name.trim().length > 100) return 'Keep the name under 100 characters.';
  if (draft.dosagePerUnit !== undefined && (!Number.isFinite(draft.dosagePerUnit) || draft.dosagePerUnit <= 0)) return 'Enter a positive amount per unit.';
  if (draft.defaultUnitsTaken !== undefined && (!Number.isFinite(draft.defaultUnitsTaken) || draft.defaultUnitsTaken <= 0)) return 'Enter positive units taken.';
  if (draft.nutrientProfile?.some((value) => !Number.isFinite(value.amount) || value.amount <= 0 || !value.nutrientId || !value.unit)) return 'Check each nutrient profile amount and unit.';
  const times = draft.times ?? (draft.time ? [draft.time] : []);
  if (times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return 'Enter each time as HH:MM.';
  if (new Set(times).size !== times.length) return 'Each time needs to be different.';
  if ((draft.scheduleType === 'daily' || draft.scheduleType === 'weekly') && !times.length) return 'Add at least one time.';
  if (draft.scheduleType === 'weekly' && !draft.weekdays?.length) return 'Choose at least one day of the week.';
  if (draft.scheduleType === 'interval' && (!Number.isInteger(draft.intervalHours) || draft.intervalHours! < 1 || draft.intervalHours! > 720)) return 'Enter an interval from 1 to 720 hours.';
  if (!draft.id && (!Number.isFinite(draft.dosagePerUnit) || draft.dosagePerUnit! <= 0 || !draft.dosageUnit?.trim())) return 'Enter a positive amount per unit and its unit.';
  if (draft.nutrientProfile?.length && (!Number.isFinite(draft.dosagePerUnit) || draft.dosagePerUnit! <= 0 || !draft.dosageUnit?.trim())) return 'Add the amount per unit before linking nutrient values.';
  return undefined;
}

export function saveSupplementDraft(items: Medication[], draft: SupplementDraft, id: string, now = new Date().toISOString()) {
  const existing = draft.id ? visibleSupplements(items).find((item) => item.id === draft.id) : undefined;
  if (draft.id && !existing) return items;
  const times = normalizeScheduleTimes(draft.times ?? (draft.time ? [draft.time] : []));
  const scheduleType = draft.scheduleType ?? (times.length ? 'daily' : 'as_needed');
  const supplement: Medication = {
    id: existing?.id ?? id, kind: 'supplement', name: draft.name.trim(), strength: draft.serving.trim() || undefined,
    dosagePerUnit: draft.dosagePerUnit ?? existing?.dosagePerUnit,
    dosageUnit: draft.dosageUnit?.trim() || existing?.dosageUnit,
    defaultUnitsTaken: draft.defaultUnitsTaken ?? existing?.defaultUnitsTaken,
    nutrientProfile: draft.nutrientProfile ?? existing?.nutrientProfile,
    notes: draft.notes.trim() || undefined, startedAt: existing?.startedAt ?? medicationDateKey(now),
    schedule: scheduleType === 'weekly' ? { type: 'weekly', times, weekdays: draft.weekdays }
      : scheduleType === 'daily' ? { type: 'daily', times }
        : scheduleType === 'interval' ? { type: 'interval', times: [], intervalHours: draft.intervalHours }
          : { type: 'as_needed', times: [] },
    remindersEnabled: false, notificationIds: [], archived: existing?.archived ?? false,
    recordedAt: existing?.recordedAt ?? now,
  };
  return [...items.filter((item) => item.id !== supplement.id), supplement];
}

export function supplementEvents(items: Medication[], events: MedicationEvent[]) {
  const ids = new Set(visibleSupplements(items).map((item) => item.id));
  return events.filter((event) => ids.has(event.medicationId));
}

export function supplementEventDay(event: MedicationEvent) {
  return event.scheduledFor?.slice(0, 10) ?? localDateKey(new Date(event.occurredAt));
}

export function logSupplementToday(events: MedicationEvent[], supplement: Medication, id: string, now = new Date()) {
  if (supplement.kind !== 'supplement' || supplement.archived) return events;
  const day = localDateKey(now);
  if (!day || events.some((event) => event.medicationId === supplement.id && event.outcome === 'taken' && supplementEventDay(event) === day)) return events;
  return [{ id, medicationId: supplement.id, occurredAt: now.toISOString(), outcome: 'taken' as const }, ...events];
}

export function supplementDosesForDate(items: Medication[], events: MedicationEvent[], date: string) {
  return scheduledDosesForDate(visibleSupplements(items), supplementEvents(items, events), date);
}

export const SUPPLEMENT_GOAL_ID = 'supplements';

/** Only supplements on a daily or weekly schedule have doses due, so only they make a goal. */
export function hasSupplementGoal(items: readonly Medication[] | undefined) {
  return visibleSupplements([...(items ?? [])]).some((item) => !item.archived && (item.schedule.type === 'daily' || item.schedule.type === 'weekly'));
}

/**
 * A day's doses as one goal. A dose skipped on purpose leaves the total, so skipping never counts
 * against anyone. Null when nothing is due that day.
 */
export function supplementDayGoal(items: Medication[], events: MedicationEvent[], date: string) {
  const due = supplementDosesForDate(items, events, date).filter((dose) => dose.status !== 'skipped');
  if (!due.length) return null;
  const taken = due.filter((dose) => dose.status === 'taken').length;
  return { taken, total: due.length, reached: taken >= due.length };
}

export function recordSupplementDose(events: MedicationEvent[], supplement: Medication, id: string,
  outcome: 'taken' | 'skipped', scheduledFor?: string, now = new Date(), unitsTaken = supplement.defaultUnitsTaken ?? 1, customNutrients: CustomNutrient[] = []) {
  if (supplement.kind !== 'supplement' || supplement.archived) return events;
  if (events.some((event) => event.id === id)) return events;
  if (outcome === 'taken' && (!Number.isFinite(unitsTaken) || unitsTaken <= 0)) return events;
  if (scheduledFor) {
    const day = localDateKey(now);
    if (!day || !scheduledFor.startsWith(`${day}T`) || !supplement.schedule.times.includes(scheduledFor.slice(11))
      || (supplement.schedule.type !== 'daily' && supplement.schedule.type !== 'weekly')
      || !supplementDosesForDate([supplement], [], day).some((dose) => dose.key === scheduledFor)
      || events.some((event) => event.medicationId === supplement.id && event.scheduledFor === scheduledFor && event.outcome !== 'snoozed')) return events;
  } else if (supplement.schedule.type !== 'as_needed' && supplement.schedule.type !== 'interval') return events;
  const nutrientSnapshot: Record<string, number> = {};
  if (outcome === 'taken') for (const value of supplement.nutrientProfile ?? []) {
    const canonical = toCanonicalNutrientAmount(value.nutrientId, value.amount, value.unit, customNutrients) * unitsTaken;
    nutrientSnapshot[value.nutrientId] = (nutrientSnapshot[value.nutrientId] ?? 0) + canonical;
  }
  return [{ id, medicationId: supplement.id, scheduledFor, occurredAt: now.toISOString(), outcome,
    ...(outcome === 'taken' ? { unitsTaken, nutrientSnapshot } : {}) }, ...events];
}

export function supplementDoseKey(date: string, time: string) { return scheduledDoseKey(date, time); }

export function markSupplementDoseSkipped(events: MedicationEvent[], supplementIds: Set<string>, id: string, correctedAt = new Date().toISOString()) {
  return events.map((event) => event.id === id && event.outcome === 'taken' && supplementIds.has(event.medicationId)
    ? { ...event, outcome: 'skipped' as const, correctedAt, nutrientSnapshot: undefined, unitsTaken: undefined } : event);
}
