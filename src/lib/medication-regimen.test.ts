import { Medication, MedicationEvent, SupplementStack } from '@/models/tracker';
import { addScheduledDoseBatch, doseDayPart, scheduledDosesForDate, stackMembersForToday, stackNeedsReview, validateSupplementStack } from './medication-regimen';
import { medicationDateKey, medicationIsActiveOnDate, upsertMedication, validateMedication } from './medications';

const medication: Medication = { id: 'med', name: 'Morning medication', kind: 'medication', schedule: { type: 'daily', times: ['08:00'] }, remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-10-01T12:00:00Z' };
const supplement: Medication = { ...medication, id: 'supp', name: 'Supplement', kind: 'supplement', schedule: { type: 'daily', times: ['08:00', '20:00'] } };
const stack: SupplementStack = { id: 'morning', name: 'Morning stack', members: [{ medicationId: 'supp', time: '08:00' }] };

test('today follows local date, weekly weekdays, dates, and recorded status', () => {
  const weekly: Medication = { ...medication, id: 'weekly', schedule: { type: 'weekly', times: ['09:00'], weekdays: [2] } };
  const future: Medication = { ...medication, id: 'future', startedAt: '2026-10-06' };
  const events: MedicationEvent[] = [{ id: 'logged', medicationId: 'med', scheduledFor: '2026-10-05T08:00', occurredAt: '2026-10-05T08:10:00Z', outcome: 'taken' }];
  const monday = scheduledDosesForDate([medication, weekly, future], events, '2026-10-05');
  expect(monday).toHaveLength(2);
  expect(monday.find((dose) => dose.medication.id === 'med')?.status).toBe('taken');
  expect(scheduledDosesForDate([weekly], events, '2026-10-06')).toHaveLength(0);
  expect(scheduledDosesForDate([medication], events, '2026-10-06')[0].status).toBeNull();
});

test('a non-padded October 6 start date includes NAC on October 7, including its evening dose', () => {
  const nac: Medication = { ...supplement, id: 'nac', name: 'NAC', startedAt: '2026-10-6', schedule: { type: 'daily', times: ['09:00', '18:00'] } };
  const morning: MedicationEvent = { id: 'nac-morning', medicationId: 'nac', scheduledFor: '2026-10-07T09:00', occurredAt: '2026-10-07T14:00:00Z', outcome: 'taken' };
  const today = scheduledDosesForDate([nac], [morning], '2026-10-07');
  expect(today.map((dose) => [dose.time, dose.status])).toEqual([['09:00', 'taken'], ['18:00', null]]);
  expect(medicationIsActiveOnDate(nac, '2026-10-05')).toBe(false);
  expect(medicationDateKey('2026-10-6')).toBe('2026-10-06');
  expect(medicationDateKey('2026-02-30')).toBeUndefined();
  expect(validateMedication({ ...nac, startedAt: '2026-02-30' })).toMatch(/valid start date/);
  expect(upsertMedication([], nac, 'unused')[0].startedAt).toBe('2026-10-06');
});

test('as-needed and interval items do not enter scheduled progress', () => {
  const asNeeded: Medication = { ...medication, id: 'as-needed', schedule: { type: 'as_needed', times: [] } };
  const interval: Medication = { ...medication, id: 'interval', schedule: { type: 'interval', times: [], intervalHours: 8 } };
  expect(scheduledDosesForDate([medication, asNeeded, interval], [], '2026-10-05')).toHaveLength(1);
  expect(doseDayPart('01:00')).toBe('Overnight');
  expect(doseDayPart('08:00')).toBe('Morning');
  expect(doseDayPart('13:00')).toBe('Afternoon');
  expect(doseDayPart('20:00')).toBe('Evening');
});

test('a stack selects only its specific dose time and rejects duplicate or mixed-day memberships', () => {
  const doses = scheduledDosesForDate([supplement], [], '2026-10-05');
  expect(stackMembersForToday(stack, doses).map((dose) => dose.time)).toEqual(['08:00']);
  expect(validateSupplementStack(stack, [], [supplement])).toBeUndefined();
  expect(validateSupplementStack({ ...stack, id: 'other' }, [stack], [supplement])).toMatch(/only one stack/);
  expect(validateSupplementStack({ ...stack, members: [...stack.members, { medicationId: 'supp', time: '20:00' }] }, [], [supplement])).toMatch(/same time of day/);
  expect(stackNeedsReview(stack, [{ ...supplement, schedule: { type: 'daily', times: ['20:00'] } }])).toBe(true);
  expect(stackNeedsReview(stack, [{ ...supplement, archived: true }])).toBe(true);
});

test('bulk logging is one deduplicated update and preserves already logged doses', () => {
  const existing: MedicationEvent[] = [{ id: 'already', medicationId: 'supp', scheduledFor: '2026-10-05T08:00', occurredAt: '2026-10-05T08:01:00Z', outcome: 'taken' }];
  const inputs = [
    { medicationId: 'supp', scheduledFor: '2026-10-05T08:00', outcome: 'skipped' as const },
    { medicationId: 'supp', scheduledFor: '2026-10-05T20:00', outcome: 'taken' as const },
    { medicationId: 'supp', scheduledFor: '2026-10-05T20:00', outcome: 'taken' as const },
  ];
  const result = addScheduledDoseBatch(existing, inputs, ['first', 'second', 'third']);
  expect(result.addedIds).toEqual(['second']);
  expect(result.events).toHaveLength(2);
  expect(result.events.find((event) => event.id === 'already')?.outcome).toBe('taken');
  expect(addScheduledDoseBatch(result.events, inputs, ['a', 'b', 'c']).addedIds).toEqual([]);
});

test('recording after a snooze preserves the old event for bulk Undo', () => {
  const snoozed: MedicationEvent = { id: 'snooze', medicationId: 'supp', scheduledFor: '2026-10-05T08:00', occurredAt: '2026-10-05T07:55:00Z', outcome: 'snoozed' };
  const result = addScheduledDoseBatch([snoozed], [{ medicationId: 'supp', scheduledFor: '2026-10-05T08:00', outcome: 'taken' }], ['new-log']);
  expect(result.addedIds).toEqual(['new-log']);
  expect(result.events).toHaveLength(2);
  expect(result.events.find((event) => event.id === 'snooze')).toEqual(snoozed);
});
