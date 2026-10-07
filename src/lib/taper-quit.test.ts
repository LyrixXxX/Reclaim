import { createSeedState } from '@/data/seed';
import { deleteTrackerHistory, recoverySeriesFromEntries, recoveryStats } from './recovery';
import { addTaperStep, deleteTaperStep, editTaperStep } from './taper';
import { completedCalendarDays, formatTaperQuitStart, roundedNextCheckpoint, taperQuitPhase, trackerJourneySection } from './taper-quit';

describe('taper-to-quit transition', () => {
  test('uses Caffeine’s approximate zero step rather than its original taper start', () => {
    const state = createSeedState();
    const tracker = state.trackers.find((item) => item.id === 'caffeine')!;
    const phase = taperQuitPhase(tracker, state.taperSteps ?? []);
    expect(phase).toMatchObject({ startedAt: '2026-07-25T00:00:00', datePrecision: 'approximate', exact: false });
    expect(phase?.startedAt).not.toBe(tracker.startedAt);
    expect(formatTaperQuitStart(phase!)).toBe('Quit approximately Jul 25, 2026');
    expect(trackerJourneySection(tracker, state.taperSteps ?? [])).toBe('quitting');
  });

  test('starts recovery calculations on the zero-dose date and preserves the taper timeline', () => {
    const state = createSeedState();
    const tracker = state.trackers.find((item) => item.id === 'caffeine')!;
    const steps = state.taperSteps?.filter((step) => step.trackerId === tracker.id) ?? [];
    const phase = taperQuitPhase(tracker, steps)!;
    const stats = recoveryStats(recoverySeriesFromEntries(phase.startedAt, [], new Date(2026, 6, 27, 12)));
    expect(stats).toEqual({ successfulDays: 3, totalTrackedDays: 3, successPercentage: 100 });
    expect(steps.map((step) => step.amount)).toEqual([300, 160, 0]);
    expect(tracker.startedAt).toBe('2026-07-20T00:00:00');
  });

  test('a later positive step returns the tracker to reducing without deleting prior recovery history', () => {
    const state = { ...createSeedState(), historicalEntries: [{ id: 'lapse', trackerId: 'caffeine', eventDate: '2026-07-28', recordedAt: '2026-07-29T08:00:00', outcome: 'lapse' as const }] };
    const result = addTaperStep(state, 'caffeine', { amount: 40, unit: 'mg/day', startedAt: '2026-08-01T08:00:00', datePrecision: 'exact' }, 'restart');
    const tracker = result.state.trackers.find((item) => item.id === 'caffeine')!;
    expect(taperQuitPhase(tracker, result.state.taperSteps ?? [])).toBeUndefined();
    expect(trackerJourneySection(tracker, result.state.taperSteps ?? [])).toBe('reducing');
    expect(result.state.historicalEntries).toEqual(state.historicalEntries);
    expect(result.state.taperSteps?.filter((step) => step.trackerId === 'caffeine').map((step) => step.amount)).toEqual([300, 160, 0, 40]);
  });

  test('editing or deleting the zero step recalculates the displayed phase', () => {
    const state = createSeedState();
    const edited = editTaperStep(state, 'seed-caffeine-current', { amount: 0, unit: 'mg/day', startedAt: '2026-07-25T09:15:00', datePrecision: 'exact' });
    const tracker = edited.state.trackers.find((item) => item.id === 'caffeine')!;
    expect(taperQuitPhase(tracker, edited.state.taperSteps ?? [])).toMatchObject({ startedAt: '2026-07-25T09:15:00', exact: true });
    const deleted = deleteTaperStep(state, 'seed-caffeine-current', true);
    const restoredTracker = deleted.state.trackers.find((item) => item.id === 'caffeine')!;
    expect(taperQuitPhase(restoredTracker, deleted.state.taperSteps ?? [])).toBeUndefined();
    expect(restoredTracker).toMatchObject({ startedAt: '2026-07-20T00:00:00', current: 160 });
  });

  test('approximate dates use rounded calendar durations and checkpoints', () => {
    expect(completedCalendarDays('2026-07-25T00:00:00', new Date(2026, 6, 28, 23, 59))).toBe(3);
    expect(roundedNextCheckpoint('2026-07-25T00:00:00', [1, 3, 7, 14], new Date(2026, 6, 28, 23, 59))).toEqual({ targetDays: 7, remainingDays: 4, remainingHours: 0 });
  });

  test('deleting quit-phase recovery history preserves the original taper', () => {
    const state = { ...createSeedState(), historicalEntries: [{ id: 'lapse', trackerId: 'caffeine', eventDate: '2026-07-28', recordedAt: '2026-07-29T08:00:00', outcome: 'lapse' as const }] };
    const cleared = deleteTrackerHistory(state, 'caffeine', true);
    expect(cleared.historicalEntries).toEqual([]);
    expect(cleared.trackers.find((tracker) => tracker.id === 'caffeine')?.startedAt).toBe('2026-07-20T00:00:00');
    expect(cleared.taperSteps?.filter((step) => step.trackerId === 'caffeine').map((step) => step.amount)).toEqual([300, 160, 0]);
  });
});
