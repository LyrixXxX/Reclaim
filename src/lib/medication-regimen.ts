import { Medication, MedicationEvent, SupplementStack } from '@/models/tracker';
import { medicationIsActiveOnDate, normalizeScheduleTimes, scheduledDoseKey, upsertMedicationEvent, MedicationEventInput } from './medications';

export type ScheduledDose = {
  medication: Medication;
  time: string;
  key: string;
  status: 'taken' | 'skipped' | null;
};

export function scheduledDosesForDate(medications: Medication[], events: MedicationEvent[], date: string): ScheduledDose[] {
  const weekday = new Date(`${date}T12:00:00`).getDay() + 1;
  return medications.flatMap((medication) => {
    if (!medicationIsActiveOnDate(medication, date)) return [];
    if (medication.schedule.type !== 'daily'
      && !(medication.schedule.type === 'weekly' && medication.schedule.weekdays?.includes(weekday))) return [];
    return [...new Set(normalizeScheduleTimes(medication.schedule.times))].map((time) => {
      const key = scheduledDoseKey(date, time);
      const event = events.find((item) => item.medicationId === medication.id && item.scheduledFor === key && item.outcome !== 'snoozed');
      return { medication, time, key, status: event?.outcome === 'taken' || event?.outcome === 'skipped' ? event.outcome : null };
    });
  }).sort((a, b) => a.time.localeCompare(b.time) || a.medication.name.localeCompare(b.medication.name));
}

export function doseDayPart(time: string): 'Overnight' | 'Morning' | 'Afternoon' | 'Evening' {
  const hour = Number(time.slice(0, 2));
  return hour < 5 ? 'Overnight' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
}

export function stackDoseKey(medicationId: string, time: string) { return `${medicationId}\u0000${time}`; }

export function stackMembersForToday(stack: SupplementStack, doses: ScheduledDose[]) {
  const selected = new Set(stack.members.map((member) => stackDoseKey(member.medicationId, member.time)));
  return doses.filter((dose) => dose.medication.kind === 'supplement' && selected.has(stackDoseKey(dose.medication.id, dose.time)));
}

export function stackNeedsReview(stack: SupplementStack, medications: Medication[]) {
  return !stack.members.length || stack.members.some((member) => {
    const item = medications.find((medication) => medication.id === member.medicationId);
    return !item || item.archived || item.kind !== 'supplement'
      || (item.schedule.type !== 'daily' && item.schedule.type !== 'weekly')
      || !item.schedule.times.includes(member.time);
  });
}

export function validateSupplementStack(input: SupplementStack, existing: SupplementStack[], medications: Medication[]) {
  if (!input.name.trim()) return 'Enter a stack name.';
  if (!input.members.length) return 'Choose at least one supplement dose time.';
  const keys = input.members.map((member) => stackDoseKey(member.medicationId, member.time));
  if (new Set(keys).size !== keys.length) return 'The same dose time cannot appear twice in a stack.';
  if (new Set(input.members.map((member) => doseDayPart(member.time))).size > 1) return 'Choose dose times from the same time of day for one stack.';
  if (input.members.some((member) => {
    const item = medications.find((medication) => medication.id === member.medicationId);
    return !item || item.archived || item.kind !== 'supplement'
      || (item.schedule.type !== 'daily' && item.schedule.type !== 'weekly')
      || !item.schedule.times.includes(member.time);
  })) return 'Choose active supplements with configured daily or weekly dose times.';
  const otherKeys = new Set(existing.filter((stack) => stack.id !== input.id)
    .flatMap((stack) => stack.members.map((member) => stackDoseKey(member.medicationId, member.time))));
  if (keys.some((key) => otherKeys.has(key))) return 'A dose time can belong to only one stack.';
  return undefined;
}

export function upsertSupplementStack(stacks: SupplementStack[], input: SupplementStack) {
  const stack = { ...input, name: input.name.trim(), members: [...input.members] };
  return [...stacks.filter((item) => item.id !== stack.id), stack].sort((a, b) => a.name.localeCompare(b.name));
}

export function addScheduledDoseBatch(events: MedicationEvent[], inputs: MedicationEventInput[], ids: string[], occurredAt = new Date().toISOString()) {
  let next = events;
  const addedIds: string[] = [];
  const seen = new Set<string>();
  inputs.forEach((input, index) => {
    if (!input.scheduledFor) return;
    const key = stackDoseKey(input.medicationId, input.scheduledFor);
    if (seen.has(key) || next.some((event) => event.medicationId === input.medicationId && event.scheduledFor === input.scheduledFor && event.outcome !== 'snoozed')) return;
    seen.add(key);
    const snoozed = next.some((event) => event.medicationId === input.medicationId && event.scheduledFor === input.scheduledFor && event.outcome === 'snoozed');
    const id = ids[index];
    if (!id) return;
    next = snoozed
      ? [{ ...input, id, occurredAt }, ...next].sort((a, b) => (b.scheduledFor ?? b.occurredAt).localeCompare(a.scheduledFor ?? a.occurredAt))
      : upsertMedicationEvent(next, input, id, occurredAt);
    addedIds.push(id);
  });
  return { events: next, addedIds };
}
