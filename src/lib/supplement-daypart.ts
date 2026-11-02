import type { ScheduledDose } from './medication-regimen';

type DayPartDose = { medication: { id: string }; key: string; status: ScheduledDose['status'] };

/** A day part is complete only when every scheduled dose was taken or skipped. */
export function allDayPartDosesCompleted(doses: readonly Pick<ScheduledDose, 'status'>[]) {
  return doses.length > 0 && doses.every((dose) => dose.status === 'taken' || dose.status === 'skipped');
}

/** A manual toggle can reopen an otherwise automatically collapsed group. */
export function dayPartCollapsed(doses: readonly Pick<ScheduledDose, 'status'>[], override?: boolean) {
  return override ?? allDayPartDosesCompleted(doses);
}

export function dayPartDoseId(medicationId: string, scheduledKey: string) {
  return `${medicationId}\u0000${scheduledKey}`;
}

/** Check whether a Take or Skip action completes this scheduled group. */
export function dayPartCompletedByRecording(doses: readonly DayPartDose[], recordedIds: ReadonlySet<string>) {
  return doses.length > 0 && doses.every((dose) => dose.status === 'taken' || dose.status === 'skipped'
    || (dose.status === null && recordedIds.has(dayPartDoseId(dose.medication.id, dose.key))));
}
