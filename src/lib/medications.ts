import { Medication, MedicationEvent, MedicationSchedule, TrackerState } from '@/models/tracker';

export type MedicationInput = Omit<Medication, 'id' | 'recordedAt' | 'notificationIds'> & { id?: string; notificationIds?: string[] };
export type MedicationEventInput = Omit<MedicationEvent, 'id' | 'occurredAt'> & { id?: string };
export type Meridiem = 'AM' | 'PM';

const NORMALIZED_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function medicationDateKey(value?: string) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T)/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function medicationIsActiveOnDate(medication: Medication, date: string) {
  const start = medicationDateKey(medication.startedAt);
  const end = medicationDateKey(medication.endedAt);
  return !medication.archived && (!start || start <= date) && (!end || end >= date);
}

export function validateMedication(input: MedicationInput) {
  if (input.kind !== undefined && input.kind !== 'medication' && input.kind !== 'supplement') return 'Choose Medication or Supplement.';
  if (!input.name.trim()) return `Enter the ${input.kind === 'supplement' ? 'supplement' : 'medication'} name.`;
  if (input.startedAt && !medicationDateKey(input.startedAt)) return 'Enter a valid start date as YYYY-MM-DD.';
  if (input.endedAt && !medicationDateKey(input.endedAt)) return 'Enter a valid end date as YYYY-MM-DD.';
  if (input.schedule.type !== 'as_needed' && input.schedule.type !== 'interval' && !input.schedule.times.length) return 'Add at least one dose time.';
  if (input.schedule.times.some((time) => !NORMALIZED_TIME.test(time))) return 'Enter a valid time using hour, minute, AM, and PM.';
  if (new Set(input.schedule.times).size !== input.schedule.times.length) return 'Each dose time must be different.';
  if (input.schedule.type === 'weekly' && !input.schedule.weekdays?.length) return 'Choose at least one day of the week.';
  if (input.schedule.type === 'interval' && (!input.schedule.intervalHours || input.schedule.intervalHours < 1 || input.schedule.intervalHours > 720)) return 'Enter an interval from 1 to 720 hours.';
  return undefined;
}

export function upsertMedication(items: Medication[], input: MedicationInput, id: string, recordedAt = new Date().toISOString()) {
  const existing = items.find((entry) => entry.id === input.id);
  const item: Medication = {
    ...input,
    kind: input.kind ?? existing?.kind ?? 'medication',
    id: input.id ?? id,
    name: input.name.trim(),
    startedAt: medicationDateKey(input.startedAt),
    endedAt: medicationDateKey(input.endedAt),
    discreetName: clean(input.discreetName),
    strength: clean(input.strength),
    form: clean(input.form),
    instructions: clean(input.instructions),
    prescriber: clean(input.prescriber),
    notes: clean(input.notes),
    schedule: { ...input.schedule, times: normalizeScheduleTimes(input.schedule.times) },
    reminderMode: input.reminderMode ?? existing?.reminderMode ?? 'normal',
    reminderSound: input.reminderSound ?? existing?.reminderSound ?? true,
    reminderVibration: input.reminderVibration ?? existing?.reminderVibration ?? true,
    notificationIds: input.notificationIds ?? [],
    recordedAt: existing?.recordedAt ?? recordedAt,
  };
  return [...items.filter((entry) => entry.id !== item.id), item]
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
}

export function migrateMedicationState(state: TrackerState): TrackerState {
  const migrateSchedule = (state.medicationScheduleVersion ?? 0) < 1;
  const migrateReminders = (state.medicationReminderVersion ?? 0) < 1;
  if (!migrateSchedule && !migrateReminders) return state;
  return {
    ...state,
    medicationScheduleVersion: 1,
    medicationReminderVersion: 1,
    medications: (state.medications ?? []).map((medication) => ({
      ...medication,
      schedule: migrateSchedule && medication.name.trim().toLocaleLowerCase().includes('metoprolol')
        ? { type: 'daily', times: ['09:00', '18:00'] }
        : { ...medication.schedule, times: normalizeScheduleTimes(medication.schedule.times ?? []) },
      reminderMode: medication.reminderMode ?? 'normal',
      reminderSound: medication.reminderSound ?? true,
      reminderVibration: medication.reminderVibration ?? true,
    })),
  };
}

export function removeMedication(items: Medication[], id: string, confirmed: boolean) { return confirmed ? items.filter((item) => item.id !== id) : items; }
export function medicationId(now = Date.now(), random = Math.random()) { return `med-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`; }
export function medicationEventId(now = Date.now(), random = Math.random()) { return `med-event-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`; }

export function upsertMedicationEvent(events: MedicationEvent[], event: MedicationEventInput, id = medicationEventId(), occurredAt = new Date().toISOString()) {
  const scheduledMatch = event.scheduledFor
    ? events.find((item) => item.medicationId === event.medicationId && item.scheduledFor === event.scheduledFor)
    : undefined;
  if (!event.id && scheduledMatch) return events;
  const existing = event.id ? events.find((item) => item.id === event.id) : undefined;
  const collision = event.id && event.scheduledFor
    ? events.find((item) => item.id !== event.id && item.medicationId === event.medicationId && item.scheduledFor === event.scheduledFor)
    : undefined;
  if (collision) return events;
  const next: MedicationEvent = {
    ...event,
    id: existing?.id ?? id,
    occurredAt: existing?.occurredAt ?? occurredAt,
    correctedAt: existing ? occurredAt : undefined,
    note: clean(event.note),
  };
  return [next, ...events.filter((item) => item.id !== next.id)]
    .sort((a, b) => (b.scheduledFor ?? b.occurredAt).localeCompare(a.scheduledFor ?? a.occurredAt));
}

export function medicationEventDate(event: MedicationEvent) {
  if (event.scheduledFor) return event.scheduledFor.slice(0, 10);
  const date = new Date(event.occurredAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function groupMedicationEventsByDate(events: MedicationEvent[]) {
  const groups = new Map<string, MedicationEvent[]>();
  for (const event of [...events].sort((a, b) => (b.scheduledFor ?? b.occurredAt).localeCompare(a.scheduledFor ?? a.occurredAt))) {
    const date = medicationEventDate(event);
    groups.set(date, [...(groups.get(date) ?? []), event]);
  }
  return [...groups].map(([date, items]) => ({ date, events: items }));
}

export function addMedicationEvent(events: MedicationEvent[], event: Omit<MedicationEvent, 'id' | 'occurredAt'>, id = medicationEventId(), occurredAt = new Date().toISOString()) {
  return upsertMedicationEvent(events, event, id, occurredAt);
}

export function removeMedicationEvent(events: MedicationEvent[], id: string) {
  return events.filter((event) => event.id !== id);
}

export function scheduleLabel(schedule: MedicationSchedule) {
  if (schedule.type === 'as_needed') return 'No set time';
  if (schedule.type === 'interval') return `Every ${schedule.intervalHours} hours`;
  const times = normalizeScheduleTimes(schedule.times).map(formatMedicationTime).join(' and ');
  if (schedule.type === 'weekly') return `Selected days · ${times}`;
  const frequency = schedule.times.length === 1 ? 'Once daily' : schedule.times.length === 2 ? 'Twice daily' : `${schedule.times.length} times daily`;
  return `${frequency} · ${times}`;
}

export function normalizeScheduleTimes(times: string[]) {
  return [...times].map((time) => time.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function parse12HourTime(hourText: string, minuteText: string, period: Meridiem) {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) return undefined;
  const normalizedHour = (hour % 12) + (period === 'PM' ? 12 : 0);
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function splitMedicationTime(value: string): { hour: string; minute: string; period: Meridiem } {
  if (!NORMALIZED_TIME.test(value)) return { hour: '', minute: '', period: 'AM' };
  const [hour, minute] = value.split(':').map(Number);
  return { hour: String(hour % 12 || 12), minute: String(minute).padStart(2, '0'), period: hour >= 12 ? 'PM' : 'AM' };
}

export function formatMedicationTime(value: string) {
  const parsed = splitMedicationTime(value);
  if (!parsed.hour) return 'Invalid time';
  return `${parsed.hour}:${parsed.minute} ${parsed.period}`;
}

export function scheduledDoseKey(date: string, normalizedTime: string) {
  return `${date}T${normalizedTime}`;
}

export function medicationNotificationSlots(medication: Medication) {
  if (medication.schedule.type === 'interval' || medication.schedule.type === 'as_needed') return [];
  return normalizeScheduleTimes(medication.schedule.times).map((value) => {
    const [hour, minute] = value.split(':').map(Number);
    return { hour, minute, normalizedTime: value };
  });
}

export function scheduleInstructionWarning(instructions: string | undefined, schedule: MedicationSchedule) {
  if (!instructions?.trim() || schedule.type !== 'daily') return undefined;
  const text = instructions.toLocaleLowerCase();
  const expected = /\b(?:once|one time|1 time)\s+(?:a|per|each)?\s*day\b/.test(text) ? 1
    : /\b(?:twice|two times|2 times)\s+(?:a|per|each)?\s*day\b/.test(text) ? 2
      : /\b(?:three|3)\s+times\s+(?:a|per|each)?\s*day\b/.test(text) ? 3
        : /\b(?:four|4)\s+times\s+(?:a|per|each)?\s*day\b/.test(text) ? 4
          : undefined;
  if (expected === undefined || expected === schedule.times.length) return undefined;
  return `The instructions appear to say ${expected} dose${expected === 1 ? '' : 's'} per day, but the schedule has ${schedule.times.length}. Verify the prescription before saving.`;
}

function clean(value?: string) { return value?.trim() || undefined; }
