import { TrackerState } from '@/models/tracker';
import { healthHubSummary } from './health-hub';

const now = new Date(2026, 9, 2, 10);
const empty: TrackerState = { trackers: [], checkIns: [] };

test('Health hub has honest empty summaries', () => {
  const summary = healthHubSummary(empty, now);
  expect(summary.readings).toEqual([]);
  expect(summary.activeMedications).toEqual([]);
  expect(summary.medicationStatus).toBeNull();
  expect(summary.results).toEqual([]);
  expect(summary.recentLabs).toEqual([]);
});

test('Health hub uses actual latest vitals, scheduled dose status and recent tracked labs', () => {
  const state: TrackerState = {
    ...empty,
    healthReadings: [
      { id: 'old', type: 'bloodPressure', systolic: 125, diastolic: 78, pulse: 70, measuredAt: '2026-10-01T13:00:00', recordedAt: '2026-10-01T13:01:00' },
      { id: 'new', type: 'bloodPressure', systolic: 128, diastolic: 76, pulse: 72, measuredAt: '2026-10-02T09:00:00', recordedAt: '2026-10-02T09:01:00' },
    ],
    medications: [{ id: 'med', name: 'Example medication', schedule: { type: 'daily', times: ['09:00', '20:00'] }, remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-10-01T10:00:00' }],
    medicationEvents: [{ id: 'taken', medicationId: 'med', scheduledFor: '2026-10-02T09:00', occurredAt: '2026-10-02T09:05:00', outcome: 'taken' }],
    labTrackers: [{ id: 'a', name: 'Test A', createdAt: '2026-09-01T00:00:00' }, { id: 'b', name: 'Test B', createdAt: '2026-09-01T00:00:00' }],
    labResults: [
      { id: 'a-old', labTrackerId: 'a', panelDate: '2026-09-01', marker: 'Test A', value: 1, unit: 'unit A', recordedAt: '2026-09-01T12:00:00' },
      { id: 'a-new', labTrackerId: 'a', panelDate: '2026-10-01', marker: 'Test A', value: 2, unit: 'unit A', recordedAt: '2026-10-01T12:00:00' },
      { id: 'b-new', labTrackerId: 'b', panelDate: '2026-09-30', marker: 'Test B', value: 3, unit: 'unit B', recordedAt: '2026-09-30T12:00:00' },
    ],
  };
  const summary = healthHubSummary(state, now);
  expect(summary.readings[0].id).toBe('new');
  expect(summary.medicationStatus).toMatchObject({ total: 2, taken: 1, skipped: 0 });
  expect(summary.nextDoses).toEqual([{ label: 'Example medication', value: '8:00 PM' }]);
  expect(summary.results).toHaveLength(3);
  expect(summary.recentLabs.map((result) => [result.name, result.value, result.unit])).toEqual([['Test A', 2, 'unit A'], ['Test B', 3, 'unit B']]);
});
