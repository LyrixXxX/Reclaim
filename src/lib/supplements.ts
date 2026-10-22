import { Medication, MedicationEvent } from '@/models/tracker';
import { medicationDateKey, normalizeScheduleTimes, scheduledDoseKey } from './medications';
import { scheduledDosesForDate } from './medication-regimen';
import { localDateKey } from './progress';

export type SupplementDraft = {
  id?: string; name: string; serving: string; notes: string;
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
  const times = draft.times ?? (draft.time ? [draft.time] : []);
  if (times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return 'Enter each time as HH:MM.';
  if (new Set(times).size !== times.length) return 'Each dose needs a different time.';
  if ((draft.scheduleType === 'daily' || draft.scheduleType === 'weekly') && !times.length) return 'Add at least one dose time.';
  if (draft.scheduleType === 'weekly' && !draft.weekdays?.length) return 'Choose at least one day of the week.';
  if (draft.scheduleType === 'interval' && (!Number.isInteger(draft.intervalHours) || draft.intervalHours! < 1 || draft.intervalHours! > 720)) return 'Enter an interval from 1 to 720 hours.';
  return undefined;
}

export function saveSupplementDraft(items: Medication[], draft: SupplementDraft, id: string, now = new Date().toISOString()) {
  const existing = draft.id ? visibleSupplements(items).find((item) => item.id === draft.id) : undefined;
  if (draft.id && !existing) return items;
  const times = normalizeScheduleTimes(draft.times ?? (draft.time ? [draft.time] : []));
  const scheduleType = draft.scheduleType ?? (times.length ? 'daily' : 'as_needed');
  const supplement: Medication = {
    id: existing?.id ?? id, kind: 'supplement', name: draft.name.trim(), strength: draft.serving.trim() || undefined,
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

export function recordSupplementDose(events: MedicationEvent[], supplement: Medication, id: string,
  outcome: 'taken' | 'skipped', scheduledFor?: string, now = new Date()) {
  if (supplement.kind !== 'supplement' || supplement.archived) return events;
  if (scheduledFor) {
    const day = localDateKey(now);
    if (!day || !scheduledFor.startsWith(`${day}T`) || !supplement.schedule.times.includes(scheduledFor.slice(11))
      || (supplement.schedule.type !== 'daily' && supplement.schedule.type !== 'weekly')
      || !supplementDosesForDate([supplement], [], day).some((dose) => dose.key === scheduledFor)
      || events.some((event) => event.medicationId === supplement.id && event.scheduledFor === scheduledFor && event.outcome !== 'snoozed')) return events;
  } else if (supplement.schedule.type !== 'as_needed' && supplement.schedule.type !== 'interval') return events;
  return [{ id, medicationId: supplement.id, scheduledFor, occurredAt: now.toISOString(), outcome }, ...events];
}

export function supplementDoseKey(date: string, time: string) { return scheduledDoseKey(date, time); }
