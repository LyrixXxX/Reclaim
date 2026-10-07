import { Medication, MedicationEvent, TrackerState } from '@/models/tracker';

import {
  formatMedicationTime,
  groupMedicationEventsByDate,
  medicationNotificationSlots,
  migrateMedicationState,
  normalizeScheduleTimes,
  parse12HourTime,
  removeMedicationEvent,
  removeMedication,
  scheduleInstructionWarning,
  scheduleLabel,
  scheduledDoseKey,
  upsertMedication,
  upsertMedicationEvent,
  validateMedication,
} from './medications';

const input = { name: 'Example', schedule: { type: 'daily' as const, times: ['09:00'] }, remindersEnabled: true, archived: false };

describe('medication scheduling and dose history', () => {
  test.each([
    [['09:00'], 'Once daily'],
    [['18:00', '09:00'], 'Twice daily'],
    [['21:30', '07:00', '13:15'], '3 times daily'],
  ])('supports one, two, and several sorted daily times', (times, frequency) => {
    const schedule = { type: 'daily' as const, times };
    expect(normalizeScheduleTimes(times)).toEqual([...times].sort());
    expect(scheduleLabel(schedule)).toContain(frequency);
    expect(validateMedication({ ...input, schedule })).toBeUndefined();
  });

  test('converts AM and PM correctly without showing military time', () => {
    expect(parse12HourTime('12', '00', 'AM')).toBe('00:00');
    expect(parse12HourTime('12', '00', 'PM')).toBe('12:00');
    expect(parse12HourTime('9', '05', 'AM')).toBe('09:05');
    expect(parse12HourTime('6', '00', 'PM')).toBe('18:00');
    expect(formatMedicationTime('18:00')).toBe('6:00 PM');
    expect(parse12HourTime('13', '00', 'PM')).toBeUndefined();
  });

  test('rejects invalid and duplicate dose times', () => {
    expect(validateMedication({ ...input, schedule: { type: 'daily', times: ['9am'] } })).toBe('Enter a valid time using hour, minute, AM, and PM.');
    expect(validateMedication({ ...input, schedule: { type: 'daily', times: ['09:00', '09:00'] } })).toBe('Each dose time must be different.');
  });

  test('builds one correctly normalized notification slot per configured dose', () => {
    const medication = medicationFixture({ schedule: { type: 'daily', times: ['18:00', '09:05', '13:30'] } });
    expect(medicationNotificationSlots(medication)).toEqual([
      { hour: 9, minute: 5, normalizedTime: '09:05' },
      { hour: 13, minute: 30, normalizedTime: '13:30' },
      { hour: 18, minute: 0, normalizedTime: '18:00' },
    ]);
  });

  test('stores Taken and Skipped records against specific scheduled doses', () => {
    let events: MedicationEvent[] = [];
    events = upsertMedicationEvent(events, { medicationId: 'med-1', scheduledFor: scheduledDoseKey('2026-09-19', '09:00'), outcome: 'taken' }, 'morning', '2026-09-19T09:10:00Z');
    events = upsertMedicationEvent(events, { medicationId: 'med-1', scheduledFor: scheduledDoseKey('2026-09-19', '18:00'), outcome: 'skipped' }, 'evening', '2026-09-19T18:30:00Z');
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'morning', scheduledFor: '2026-09-19T09:00', outcome: 'taken' }),
      expect.objectContaining({ id: 'evening', scheduledFor: '2026-09-19T18:00', outcome: 'skipped' }),
    ]));
  });

  test('editing a schedule preserves medication identity and existing history', () => {
    const saved = upsertMedication([], input, 'med-1', '2026-09-18T12:00:00Z');
    const history = upsertMedicationEvent([], { medicationId: 'med-1', scheduledFor: '2026-09-18T09:00', outcome: 'taken' }, 'event-1', '2026-09-18T09:05:00Z');
    const edited = upsertMedication(saved, { ...saved[0], schedule: { type: 'daily', times: ['08:00', '20:00'] } }, 'unused');
    expect(edited[0]).toMatchObject({ id: 'med-1', recordedAt: '2026-09-18T12:00:00Z', schedule: { times: ['08:00', '20:00'] } });
    expect(history).toEqual([expect.objectContaining({ id: 'event-1', scheduledFor: '2026-09-18T09:00' })]);
  });

  test('an existing medication can become a supplement without losing its schedule or dose history', () => {
    const saved = upsertMedication([], input, 'med-1', '2026-09-18T12:00:00Z');
    const history = upsertMedicationEvent([], { medicationId: 'med-1', scheduledFor: '2026-09-18T09:00', outcome: 'taken' }, 'event-1');
    expect(saved[0].kind).toBe('medication');
    const changed = upsertMedication(saved, { ...saved[0], kind: 'supplement' }, 'unused');
    expect(changed[0]).toMatchObject({ id: 'med-1', kind: 'supplement', schedule: { times: ['09:00'] }, recordedAt: '2026-09-18T12:00:00Z' });
    expect(history[0]).toMatchObject({ medicationId: changed[0].id, id: 'event-1' });
  });

  test('adds safe reminder defaults and preserves an audible configuration while editing', () => {
    const saved = upsertMedication([], input, 'med-1', '2026-09-18T12:00:00Z');
    expect(saved[0]).toMatchObject({ reminderMode: 'normal', reminderSound: true, reminderVibration: true });
    const audible = upsertMedication(saved, { ...saved[0], reminderMode: 'audible', reminderSound: true, reminderVibration: false }, 'unused');
    expect(audible[0]).toMatchObject({ id: 'med-1', reminderMode: 'audible', reminderSound: true, reminderVibration: false, recordedAt: '2026-09-18T12:00:00Z' });
  });

  test('backfills and corrects dose events without changing their original recorded timestamp', () => {
    const backfilled = upsertMedicationEvent([], { medicationId: 'med-1', scheduledFor: '2026-09-10T18:00', outcome: 'skipped' }, 'event-1', '2026-09-19T12:00:00Z');
    const corrected = upsertMedicationEvent(backfilled, { id: 'event-1', medicationId: 'med-1', scheduledFor: '2026-09-10T18:00', outcome: 'taken', note: 'Corrected later' }, 'unused', '2026-09-20T12:00:00Z');
    expect(corrected).toEqual([expect.objectContaining({ id: 'event-1', outcome: 'taken', note: 'Corrected later', occurredAt: '2026-09-19T12:00:00Z', correctedAt: '2026-09-20T12:00:00Z' })]);
  });

  test('prevents a scheduled dose from being recorded more than once', () => {
    const scheduledFor = scheduledDoseKey('2026-09-19', '18:00');
    const first = upsertMedicationEvent([], { medicationId: 'med-1', scheduledFor, outcome: 'taken' }, 'first', '2026-09-19T19:45:00Z');
    const duplicate = upsertMedicationEvent(first, { medicationId: 'med-1', scheduledFor, outcome: 'taken' }, 'duplicate', '2026-09-19T19:46:00Z');
    expect(duplicate).toBe(first);
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].id).toBe('first');
  });

  test('groups dose history by the scheduled local date', () => {
    const events = [
      { id: 'evening', medicationId: 'med-1', scheduledFor: '2026-09-19T18:00', occurredAt: '2026-09-20T00:45:00Z', outcome: 'taken' as const },
      { id: 'morning', medicationId: 'med-1', scheduledFor: '2026-09-19T09:00', occurredAt: '2026-09-19T14:00:00Z', outcome: 'taken' as const },
      { id: 'older', medicationId: 'med-1', scheduledFor: '2026-09-18T18:00', occurredAt: '2026-09-18T23:00:00Z', outcome: 'skipped' as const },
    ];
    expect(groupMedicationEventsByDate(events)).toEqual([
      { date: '2026-09-19', events: [events[0], events[1]] },
      { date: '2026-09-18', events: [events[2]] },
    ]);
  });

  test('deleting a dose record makes its scheduled slot available again', () => {
    const scheduledFor = scheduledDoseKey('2026-09-19', '09:00');
    const events = upsertMedicationEvent([], { medicationId: 'med-1', scheduledFor, outcome: 'taken' }, 'event-1');
    const remaining = removeMedicationEvent(events, 'event-1');
    expect(remaining.some((event) => event.scheduledFor === scheduledFor)).toBe(false);
  });

  test('warns when prescription instructions conflict with the daily schedule', () => {
    expect(scheduleInstructionWarning('Take 1/2 tablet twice per day', { type: 'daily', times: ['09:00'] })).toMatch(/2 doses per day/);
    expect(scheduleInstructionWarning('Take 1/2 tablet twice per day', { type: 'daily', times: ['09:00', '18:00'] })).toBeUndefined();
  });

  test('migrates Metoprolol once while preserving instructions and history', () => {
    const medication = medicationFixture({ id: 'metoprolol', name: 'Metoprolol', instructions: 'Take 1/2 tablet twice per day', schedule: { type: 'daily', times: ['09:00'] } });
    const event = { id: 'old-event', medicationId: 'metoprolol', scheduledFor: '2026-09-18T09:00', occurredAt: '2026-09-18T09:02:00Z', outcome: 'taken' as const };
    const state = { trackers: [], checkIns: [], medications: [medication], medicationEvents: [event] } as TrackerState;
    const migrated = migrateMedicationState(state);
    expect(migrated.medications?.[0]).toMatchObject({ instructions: medication.instructions, schedule: { type: 'daily', times: ['09:00', '18:00'] } });
    expect(migrated.medicationEvents).toEqual([event]);
    expect(migrateMedicationState({ ...migrated, medications: [{ ...migrated.medications![0], schedule: { type: 'daily', times: ['08:00'] } }] }).medications?.[0].schedule.times).toEqual(['08:00']);
  });

  test('requires confirmation to delete a medication', () => {
    const saved = upsertMedication([], input, 'med-1');
    expect(removeMedication(saved, 'med-1', false)).toHaveLength(1);
    expect(removeMedication(saved, 'med-1', true)).toHaveLength(0);
  });
});

function medicationFixture(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    name: 'Example',
    schedule: { type: 'daily', times: ['09:00'] },
    remindersEnabled: true,
    notificationIds: [],
    archived: false,
    recordedAt: '2026-09-18T12:00:00Z',
    ...overrides,
  };
}
