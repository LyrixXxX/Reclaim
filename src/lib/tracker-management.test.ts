import { createSeedState } from '@/data/seed';
import { recoverySeriesFromEntries, recoveryStats } from '@/lib/recovery';
import {
  createTracker,
  editTracker,
  permanentlyDeleteTracker,
  trackerHasHistory,
  setTrackerArchived,
  TrackerDraft,
  validateTrackerDraft, removeFruitAndVegGoals } from './tracker-management';
import { TrackerMode, TrackerState } from '@/models/tracker';

function draft(mode: TrackerMode, name = 'My tracker'): TrackerDraft {
  return {
    name,
    displayName: '',
    mode,
    startDate: '2026-07-20',
    startTime: '08:30',
    icon: '★',
    color: '#C8F15A',
    unit: mode === 'reduction' ? 'mg/day' : '',
    baseline: mode === 'reduction' ? '300' : '',
    current: mode === 'reduction' ? '160' : '',
    target: mode === 'reduction' ? '100' : '',
    frequencyCount: mode === 'habit' ? '3' : '',
    frequencyPeriod: mode === 'habit' ? 'week' : undefined,
    notes: 'Private note',
  };
}

function emptyState(): TrackerState {
  return { trackers: [], checkIns: [], historicalEntries: [] };
}

describe('custom tracker management', () => {
  it('stores the selected mindfulness visual without changing the minutes goal', () => {
    const input: TrackerDraft = { ...draft('habit'), habitTemplate: 'mindfulness', habitGoalValue: '10', mindfulnessVisualMode: 'quiet' };
    expect(validateTrackerDraft(input)).toEqual({});
    expect(createTracker(emptyState(), input, 'mindfulness').tracker).toMatchObject({ mindfulnessVisualMode: 'quiet', habitGoalHistory: [{ value: 10 }] });
    expect(validateTrackerDraft({ ...input, mindfulnessVisualMode: 'invalid' as 'quiet' }).mindfulnessVisualMode).toBeTruthy();
  });
  it('stores exercise target mode and regimen and validates malformed rows', () => {
    const base: TrackerDraft = { ...draft('habit'), habitTemplate: 'exercise', habitGoalValue: '3', exerciseGoalMode: 'times', exerciseRegimenRows: [{ id: 'push', label: 'Push', days: [0, 2] }] };
    expect(validateTrackerDraft(base)).toEqual({});
    expect(createTracker(emptyState(), base, 'exercise').tracker).toMatchObject({ exerciseGoalModes: [{ mode: 'times' }], exerciseRegimenHistory: [{ rows: [{ id: 'push', label: 'Push', days: [0, 2] }] }] });
    expect(validateTrackerDraft({ ...base, exerciseRegimenRows: [{ id: 'bad', label: ' ', days: [7] }] }).exerciseRegimenRows).toBeTruthy();
    expect(validateTrackerDraft({ ...base, habitGoalValue: '2.5' }).habitGoalValue).toMatch(/whole number/);
  });
  it('accepts repeatable daily goals for legacy Done habits and validates reminder time', () => {
    expect(validateTrackerDraft({ ...draft('habit'), habitLogStyle: 'done', frequencyPeriod: 'day', frequencyCount: '2' })).toEqual({});
    expect(validateTrackerDraft({ ...draft('habit'), habitLogStyle: 'done', frequencyPeriod: 'week', frequencyCount: '3' })).toEqual({});
    expect(validateTrackerDraft({ ...draft('habit'), habitReminderTime: '9am' }).habitReminderTime).toMatch(/9:00 AM/);
    expect(createTracker(emptyState(), { ...draft('habit'), habitReminderTime: '6:15 PM' }, 'reminder').tracker?.habitReminderTime).toBe('18:15');
  });
  test.each([
    ['abstinence', 'quit-1'],
    ['reduction', 'reduce-1'],
    ['habit', 'habit-1'],
  ] as [TrackerMode, string][])('creates a valid %s tracker', (mode, id) => {
    const result = createTracker(emptyState(), draft(mode), id);
    expect(result.errors).toEqual({});
    expect(result.state.trackers[0]).toMatchObject({ id, mode, name: 'My tracker' });
    if (mode === 'reduction') {
      expect(result.state.trackers[0]).toMatchObject({ baseline: 300, current: 160, unit: 'mg/day' });
    }
    if (mode === 'habit') {
      expect(result.state.trackers[0]).toMatchObject({ frequencyCount: 3, frequencyPeriod: 'week' });
    }
  });

  test.each([
    ['8:30', 'AM', '2026-07-20T08:30:00'],
    ['8:30', 'PM', '2026-07-20T20:30:00'],
    ['12:05', 'AM', '2026-07-20T00:05:00'],
    ['12:05', 'PM', '2026-07-20T12:05:00'],
  ] as const)('stores an exact local start time for %s %s', (startTime, startPeriod, expected) => {
    const result = createTracker(emptyState(), { ...draft('abstinence'), startTime, startPeriod }, 'timed');
    expect(result.state.trackers[0].startedAt).toBe(expected);
  });

  test('rejects invalid 12-hour start times', () => {
    expect(validateTrackerDraft({ ...draft('abstinence'), startTime: '13:30', startPeriod: 'PM' }).startTime).toBeTruthy();
  });

  test('required-field validation prevents invalid creation', () => {
    const invalid = { ...draft('reduction'), name: '', unit: '', baseline: '', current: '' };
    expect(validateTrackerDraft(invalid)).toMatchObject({
      name: expect.any(String),
      unit: expect.any(String),
      baseline: expect.any(String),
      current: expect.any(String),
    });
    expect(createTracker(emptyState(), invalid, 'invalid').state.trackers).toHaveLength(0);
  });

  test('editing settings preserves entries and stable identity', () => {
    const created = createTracker(emptyState(), draft('abstinence'), 'stable-id').state;
    const withHistory: TrackerState = {
      ...created,
      historicalEntries: [{
        id: 'entry-1',
        trackerId: 'stable-id',
        eventDate: '2026-07-21',
        recordedAt: '2026-07-21T12:00:00',
        outcome: 'stayed_on_plan',
      }],
    };
    const edited = editTracker(withHistory, 'stable-id', {
      ...draft('abstinence', 'Renamed tracker'),
      displayName: 'Private goal',
    }).state;
    expect(edited.trackers[0]).toMatchObject({ id: 'stable-id', name: 'Renamed tracker', displayName: 'Private goal' });
    expect(edited.historicalEntries).toEqual(withHistory.historicalEntries);
  });

  test('changing the start date recalculates history without deleting entries', () => {
    const created = createTracker(emptyState(), draft('abstinence'), 'recalc-id').state;
    const entries = [{
      id: 'lapse-1',
      trackerId: 'recalc-id',
      eventDate: '2026-07-22',
      recordedAt: '2026-07-22T12:00:00',
      outcome: 'lapse' as const,
    }];
    const before = recoveryStats(recoverySeriesFromEntries(created.trackers[0].startedAt!, entries, new Date('2026-07-24T12:00:00')));
    const edited = editTracker({ ...created, historicalEntries: entries }, 'recalc-id', {
      ...draft('abstinence'),
      startDate: '2026-07-22',
    }).state;
    const after = recoveryStats(recoverySeriesFromEntries(edited.trackers[0].startedAt!, entries, new Date('2026-07-24T12:00:00')));
    expect(before.totalTrackedDays).toBe(5);
    expect(after.totalTrackedDays).toBe(3);
    expect(edited.historicalEntries).toEqual(entries);
  });

  test('archiving and restoring preserves the tracker and history', () => {
    const created = createTracker(emptyState(), draft('habit'), 'archive-id').state;
    const archived = setTrackerArchived(created, 'archive-id', true);
    const restored = setTrackerArchived(archived, 'archive-id', false);
    expect(archived.trackers[0].archived).toBe(true);
    expect(restored.trackers[0].archived).toBe(false);
    expect(restored.trackers[0].id).toBe('archive-id');
  });

  test('canceling deletion leaves state untouched', () => {
    const state = createTracker(emptyState(), draft('abstinence'), 'keep-id').state;
    expect(permanentlyDeleteTracker(state, 'keep-id', false, 'DELETE')).toBe(state);
  });

  test('confirmation text prevents accidental deletion when history exists', () => {
    const created = createTracker(emptyState(), draft('abstinence'), 'guarded-id').state;
    const state: TrackerState = {
      ...created,
      historicalEntries: [{ id: 'entry', trackerId: 'guarded-id', eventDate: '2026-07-21', recordedAt: '2026-07-22T00:00:00', outcome: 'lapse' }],
    };
    expect(permanentlyDeleteTracker(state, 'guarded-id', true, 'wrong')).toBe(state);
    expect(permanentlyDeleteTracker(state, 'guarded-id', true, 'DELETE').trackers).toHaveLength(0);
  });

  test('permanent deletion removes only the selected tracker and related records', () => {
    const first = createTracker(emptyState(), draft('abstinence', 'Same name'), 'first-id').state;
    const second = createTracker(first, draft('abstinence', 'Same name'), 'second-id').state;
    const state: TrackerState = {
      ...second,
      historicalEntries: [
        { id: 'first-entry', trackerId: 'first-id', eventDate: '2026-07-21', recordedAt: '2026-07-22T00:00:00', outcome: 'lapse' },
        { id: 'second-entry', trackerId: 'second-id', eventDate: '2026-07-21', recordedAt: '2026-07-22T00:00:00', outcome: 'lapse' },
      ],
    };
    const deleted = permanentlyDeleteTracker(state, 'first-id', true, 'DELETE');
    expect(deleted.trackers.map((tracker) => tracker.id)).toEqual(['second-id']);
    expect(deleted.historicalEntries?.map((entry) => entry.id)).toEqual(['second-entry']);
  });

  test('permanent deletion removes taper history and dashboard selection, not another tracker', () => {
    const first = createTracker(emptyState(), draft('reduction', 'Old taper'), 'old-id').state;
    const second = createTracker(first, draft('reduction', 'Keep taper'), 'keep-id').state;
    const state: TrackerState = {
      ...second,
      taperSteps: [
        { id: 'old-step', trackerId: 'old-id', amount: 0, unit: 'mg', status: 'current', datePrecision: 'date_only', recordedAt: '2026-09-20' },
        { id: 'keep-step', trackerId: 'keep-id', amount: 1, unit: 'mg', status: 'current', datePrecision: 'date_only', recordedAt: '2026-09-20' },
      ],
      lapseEvents: [{ id: 'old-lapse', trackerId: 'old-id', date: '2026-09-21', createdAt: '2026-09-21', note: '' }],
      preferences: { visibleSections: { goals: true, health: true, cpap: true, weight: true, nutrition: true, activity: true }, visibleHealthModules: { bloodPressure: true, medications: true, labs: true }, dashboard: [{ id: 'habits', visible: true, expanded: true, selectedIds: ['old-id', 'keep-id'] }] },
    };
    expect(trackerHasHistory(state, 'old-id')).toBe(true);
    expect(permanentlyDeleteTracker(state, 'old-id', true, '')).toBe(state);
    const deleted = permanentlyDeleteTracker(state, 'old-id', true, 'DELETE');
    expect(deleted.trackers.map((item) => item.id)).toEqual(['keep-id']);
    expect(deleted.taperSteps?.map((item) => item.id)).toEqual(['keep-step']);
    expect(deleted.lapseEvents).toEqual([]);
    expect(deleted.preferences?.dashboard?.[0].selectedIds).toEqual(['keep-id']);
  });

  test('existing seeded trackers remain compatible', () => {
    const seeded = createSeedState();
    expect(seeded.trackers.map((tracker) => tracker.id)).toEqual(['marijuana', 'porn', 'nicotine', 'caffeine']);
    expect(seeded.trackers.every((tracker) => ['abstinence', 'reduction', 'habit'].includes(tracker.mode))).toBe(true);
  });

  test('duplicate names remain isolated by stable tracker IDs', () => {
    const first = createTracker(emptyState(), draft('habit', 'Walking'), 'walk-a').state;
    const second = createTracker(first, draft('habit', 'Walking'), 'walk-b').state;
    expect(second.trackers).toHaveLength(2);
    expect(new Set(second.trackers.map((tracker) => tracker.id)).size).toBe(2);
  });
});

test('an old Fruits & vegetables goal is deleted with its logs, and nothing else changes', () => {
  const produce = { id: 'p', name: 'Fruits', mode: 'habit', habitTemplate: 'produce' };
  const water = { id: 'w', name: 'Water', mode: 'habit', habitTemplate: 'water' };
  const state = { trackers: [produce, water], checkIns: [], goodHabitLogs: [{ id: 'a', trackerId: 'p' }, { id: 'b', trackerId: 'w' }] } as never;
  const next = removeFruitAndVegGoals(state);
  expect(next.trackers.map((item) => item.id)).toEqual(['w']);
  expect(next.goodHabitLogs?.map((item) => item.id)).toEqual(['b']);
  const clean = { trackers: [water], checkIns: [] } as never;
  expect(removeFruitAndVegGoals(clean)).toBe(clean);
});
