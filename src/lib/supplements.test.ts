import { Medication } from '@/models/tracker';
import { logSupplementToday, recordSupplementDose, saveSupplementDraft, supplementDosesForDate, supplementEvents, validateSupplementDraft, visibleSupplements } from './supplements';

const medical: Medication = { id: 'old-med', kind: 'medication', name: 'Prescription', schedule: { type: 'daily', times: ['09:00'] }, remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-10-01T12:00:00Z' };

test('keeps legacy medical records and events hidden from supplements', () => {
  const saved = saveSupplementDraft([medical], { name: 'Vitamin D', serving: 'one softgel', time: '08:00', notes: '' }, 'vitamin', '2026-10-15T12:00:00Z');
  expect(saved).toHaveLength(2);
  expect(visibleSupplements(saved).map((item) => item.name)).toEqual(['Vitamin D']);
  expect(supplementEvents(saved, [{ id: 'old', medicationId: 'old-med', occurredAt: '2026-10-15T12:00:00Z', outcome: 'taken' }])).toEqual([]);
  expect(saveSupplementDraft(saved, { id: 'old-med', name: 'Changed', serving: '', time: '', notes: '' }, 'unused')).toBe(saved);
});

test('validates time and records at most one taken event per supplement each day', () => {
  expect(validateSupplementDraft({ name: 'Vitamin D', serving: '', time: '9am', notes: '' })).toMatch(/HH:MM/);
  const item = saveSupplementDraft([], { name: 'Vitamin D', serving: '', time: '', notes: '' }, 'vitamin')[0];
  const first = logSupplementToday([], item, 'event-1', new Date(2026, 9, 15, 9));
  expect(logSupplementToday(first, item, 'event-2', new Date(2026, 9, 15, 10))).toBe(first);
  expect(logSupplementToday(first, item, 'event-3', new Date(2026, 9, 16, 9))).toHaveLength(2);
  expect(logSupplementToday([], medical, 'event-4')).toEqual([]);
});

test('tracks separate morning and evening servings with taken and skipped outcomes', () => {
  const item = saveSupplementDraft([], { name: 'Creatine', serving: '5 g', notes: '', scheduleType: 'daily', times: ['09:00', '18:00'] }, 'supp-1')[0];
  const date = new Date(2026, 9, 22, 19);
  const morning = recordSupplementDose([], item, 'first', 'taken', '2026-10-22T09:00', date);
  const both = recordSupplementDose(morning, item, 'second', 'skipped', '2026-10-22T18:00', date);
  expect(supplementDosesForDate([medical, item], both, '2026-10-22').map((dose) => [dose.time, dose.status])).toEqual([['09:00', 'taken'], ['18:00', 'skipped']]);
  expect(recordSupplementDose(both, item, 'duplicate', 'taken', '2026-10-22T09:00', date)).toBe(both);
  expect(recordSupplementDose(both, item, 'wrong-day', 'taken', '2026-10-23T09:00', date)).toBe(both);
  expect(recordSupplementDose([], medical, 'hidden', 'taken', '2026-10-22T09:00', date)).toEqual([]);
});

test('as-needed supplements can be taken more than once per day without changing existing records', () => {
  const item = saveSupplementDraft([], { name: 'Electrolytes', serving: '', notes: '', scheduleType: 'as_needed', times: [] }, 'supp-2')[0];
  const first = recordSupplementDose([], item, 'one', 'taken', undefined, new Date(2026, 9, 22, 9));
  const second = recordSupplementDose(first, item, 'two', 'taken', undefined, new Date(2026, 9, 22, 17));
  expect(second).toHaveLength(2);
  expect(supplementDosesForDate([item], second, '2026-10-22')).toEqual([]);
});

test('keeps an existing supplement identity and dose history when adding a second time', () => {
  const original = saveSupplementDraft([], { name: 'Vitamin D', serving: '', time: '09:00', notes: '' }, 'saved-id', '2026-10-01T12:00:00Z')[0];
  const edited = saveSupplementDraft([original], { id: 'saved-id', name: 'Vitamin D', serving: '', notes: '', scheduleType: 'daily', times: ['09:00', '18:00'] }, 'unused')[0];
  expect(edited.id).toBe('saved-id');
  expect(edited.recordedAt).toBe(original.recordedAt);
  expect(edited.schedule.times).toEqual(['09:00', '18:00']);
  expect(validateSupplementDraft({ name: 'Vitamin D', serving: '', notes: '', scheduleType: 'daily', times: ['09:00', '09:00'] })).toMatch(/different/);
});

test('shows weekly servings only on chosen days and preserves interval schedules', () => {
  const weekly = saveSupplementDraft([], { name: 'Vitamin D', serving: '', notes: '', scheduleType: 'weekly', times: ['08:00'], weekdays: [5] }, 'weekly')[0];
  expect(supplementDosesForDate([weekly], [], '2026-10-22')).toHaveLength(1); // Thursday
  expect(supplementDosesForDate([weekly], [], '2026-10-23')).toHaveLength(0);
  const interval = saveSupplementDraft([], { name: 'Electrolytes', serving: '', notes: '', scheduleType: 'interval', intervalHours: 8, times: [] }, 'interval')[0];
  expect(interval.schedule).toMatchObject({ type: 'interval', intervalHours: 8 });
  expect(recordSupplementDose([], interval, 'taken', 'taken', undefined, new Date(2026, 9, 22, 9))).toHaveLength(1);
  expect(validateSupplementDraft({ name: 'Electrolytes', serving: '', notes: '', scheduleType: 'interval', intervalHours: 0 })).toMatch(/interval/);
});
