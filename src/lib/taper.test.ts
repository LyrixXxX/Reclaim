import { createSeedState } from '@/data/seed';
import { TaperStep, TrackerState } from '@/models/tracker';
import {
  addTaperStep,
  deleteTaperStep,
  editTaperStep,
  formatStepStart,
  insertHistoricalTaperStep,
  liveStepProgress,
  migrateTaperState,
  stepDuration,
  sortTaperSteps,
  taperReductionPercent,
} from './taper';

const tracker = {
  id: 'caffeine',
  name: 'Caffeine',
  icon: 'C',
  color: '#fff',
  mode: 'reduction' as const,
  startedAt: '2026-07-20T00:00:00',
  currentStepStartedAt: '2026-07-25T00:00:00',
  baseline: 300,
  current: 160,
  unit: 'mg/day',
};

function stateWithCurrent(): TrackerState {
  return {
    trackers: [tracker],
    checkIns: [],
    taperSteps: [{
      id: 'current-1',
      trackerId: tracker.id,
      amount: 160,
      unit: 'mg/day',
      startedAt: '2026-07-25T00:00:00',
      status: 'current',
      datePrecision: 'exact',
      recordedAt: '2026-07-25T00:00:00',
    }],
  };
}

describe('taper steps', () => {
  test('adding a step completes the prior step and preserves it', () => {
    const result = addTaperStep(stateWithCurrent(), tracker.id, {
      amount: 80,
      unit: 'mg/day',
      startedAt: '2026-07-29T00:00:00',
      datePrecision: 'exact',
    }, 'current-2', '2026-07-29T00:00:00');
    expect(result.error).toBeUndefined();
    expect(result.state.taperSteps).toHaveLength(2);
    expect(result.state.taperSteps?.[0]).toMatchObject({
      id: 'current-1', status: 'completed', endedAt: '2026-07-29T00:00:00', amount: 160,
    });
    expect(result.state.taperSteps?.[1]).toMatchObject({
      id: 'current-2', status: 'current', amount: 80,
    });
  });

  test('the new current-step timer begins at zero', () => {
    const result = addTaperStep(stateWithCurrent(), tracker.id, {
      amount: 80,
      unit: 'mg/day',
      startedAt: '2026-07-29T10:30:00',
      datePrecision: 'exact',
    }, 'current-2');
    expect(stepDuration(result.step?.startedAt, undefined, Date.parse('2026-07-29T10:30:00'))?.milliseconds).toBe(0);
  });

  test('adding a step never changes the original taper start', () => {
    const result = addTaperStep(stateWithCurrent(), tracker.id, {
      amount: 80,
      unit: 'mg/day',
      startedAt: '2026-07-29T00:00:00',
      datePrecision: 'exact',
    }, 'current-2');
    expect(result.state.trackers[0].startedAt).toBe('2026-07-20T00:00:00');
    expect(result.state.trackers[0].currentStepStartedAt).toBe('2026-07-29T00:00:00');
  });

  test('historical steps preserve amount and exact duration', () => {
    const result = addTaperStep(stateWithCurrent(), tracker.id, {
      amount: 80,
      unit: 'mg/day',
      startedAt: '2026-07-29T00:00:00',
      datePrecision: 'exact',
    }, 'current-2');
    const historical = result.state.taperSteps?.[0];
    expect(historical?.amount).toBe(160);
    expect(stepDuration(historical?.startedAt, historical?.endedAt)?.days).toBe(4);
  });

  test('percentage reduction always uses the original baseline', () => {
    expect(taperReductionPercent(300, 80)).toBe(73);
    expect(taperReductionPercent(300, 0)).toBe(100);
  });

  test('minute, hour, day, week, month, and year progress calculations are correct', () => {
    const start = '2026-07-20T00:00:00';
    const now = Date.parse('2026-07-20T01:30:30');
    const progress = liveStepProgress(start, now);
    expect(progress.minute).toBeCloseTo(0.5);
    expect(progress.hour).toBeCloseTo(0.508333, 5);
    expect(progress.day).toBeCloseTo(5_430_000 / 86_400_000);
    expect(progress.week).toBeCloseTo(5_430_000 / (7 * 86_400_000));
    expect(progress.month).toBeCloseTo(5_430_000 / (30 * 86_400_000));
    expect(progress.year).toBeCloseTo(5_430_000 / (365 * 86_400_000));
  });

  test('all live progress values remain bounded from zero to one', () => {
    const values = Object.values(liveStepProgress('2020-01-01T00:00:00', Date.parse('2026-08-01T12:00:00')));
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  test('approximate and date-only values keep honest labels', () => {
    expect(formatStepStart({ startedAt: '2026-07-25T00:00:00', datePrecision: 'approximate' }))
      .toContain('Started approximately Jul 25, 2026');
    const dateOnly = formatStepStart({ startedAt: '2026-07-25T00:00:00', datePrecision: 'date_only' });
    expect(dateOnly).toContain('Exact time unknown');
    expect(dateOnly).not.toContain('12:00');
    expect(formatStepStart({ datePrecision: 'unknown' })).toBe('Date not recorded');
  });

  test('editing a historical step recalculates duration correctly', () => {
    const steps: TaperStep[] = [
      { id: 'step-1', trackerId: tracker.id, amount: 300, unit: 'mg/day', startedAt: '2026-07-20T00:00:00', endedAt: '2026-07-25T00:00:00', status: 'completed', datePrecision: 'exact', recordedAt: '2026-07-20T00:00:00' },
      { id: 'step-2', trackerId: tracker.id, amount: 160, unit: 'mg/day', startedAt: '2026-07-25T00:00:00', status: 'current', datePrecision: 'exact', recordedAt: '2026-07-25T00:00:00' },
    ];
    const result = editTaperStep({ trackers: [tracker], checkIns: [], taperSteps: steps }, 'step-1', {
      amount: 300,
      unit: 'mg/day',
      startedAt: '2026-07-20T00:00:00',
      endedAt: '2026-07-24T00:00:00',
      datePrecision: 'exact',
    });
    expect(result.error).toBeUndefined();
    expect(stepDuration(result.step?.startedAt, result.step?.endedAt)?.days).toBe(5);
  });

  test('overlapping historical steps are rejected', () => {
    const steps: TaperStep[] = [
      { id: 'step-1', trackerId: tracker.id, amount: 300, unit: 'mg/day', startedAt: '2026-07-20T00:00:00', endedAt: '2026-07-25T00:00:00', status: 'completed', datePrecision: 'exact', recordedAt: '2026-07-20T00:00:00' },
      { id: 'step-2', trackerId: tracker.id, amount: 160, unit: 'mg/day', startedAt: '2026-07-25T00:00:00', status: 'current', datePrecision: 'exact', recordedAt: '2026-07-25T00:00:00' },
    ];
    const result = editTaperStep({ trackers: [tracker], checkIns: [], taperSteps: steps }, 'step-1', {
      amount: 300,
      unit: 'mg/day',
      startedAt: '2026-07-26T00:00:00',
      endedAt: '2026-07-27T00:00:00',
      datePrecision: 'exact',
    });
    expect(result.error).toContain('current step');
    expect(result.state.taperSteps).toEqual(steps);
  });

  test('existing reduction trackers migrate without losing tracker or history data', () => {
    const seed = createSeedState();
    const existingHistory = [{ id: 'history', trackerId: 'caffeine', eventDate: '2026-07-24', recordedAt: '2026-07-25T00:00:00', outcome: 'partial' as const, value: 180 }];
    const migrated = migrateTaperState({ ...seed, historicalEntries: existingHistory }, '2026-08-01T00:00:00');
    expect(migrated.trackers).toEqual(seed.trackers);
    expect(migrated.historicalEntries).toEqual(existingHistory);
    expect(migrated.taperSteps?.filter((step) => step.trackerId === 'caffeine').map((step) => step.amount)).toEqual([300, 160, 0]);
    expect(migrated.taperSteps?.filter((step) => step.trackerId === 'nicotine').map((step) => step.amount)).toEqual([3, 1.5]);
  });

  test('inserting a historical step sorts it and recalculates neighboring durations', () => {
    const seed = migrateTaperState(createSeedState(), '2026-08-01T00:00:00');
    const result = insertHistoricalTaperStep(seed, 'caffeine', {
      amount: 80, unit: 'mg/day', startedAt: '2026-07-23T00:00:00', datePrecision: 'date_only',
    }, 'history-80', '2026-08-01T00:00:00');
    expect(result.error).toBeUndefined();
    const steps = result.state.taperSteps?.filter((step) => step.trackerId === 'caffeine') ?? [];
    expect(sortTaperSteps(steps).map((step) => step.amount)).toEqual([300, 160, 80, 0]);
    expect(steps.find((step) => step.amount === 160)?.endedAt).toBe('2026-07-23T00:00:00');
    expect(steps.find((step) => step.amount === 80)?.endedAt).toBe('2026-07-25T00:00:00');
    expect(stepDuration(steps.find((step) => step.amount === 80)?.startedAt, steps.find((step) => step.amount === 80)?.endedAt)?.days).toBe(2);
    expect(result.state.trackers.find((item) => item.id === 'caffeine')).toMatchObject({ startedAt: '2026-07-20T00:00:00', current: 0, currentStepStartedAt: '2026-07-25T00:00:00' });
  });

  test('editing a historical date re-sorts and recalculates both neighbors', () => {
    const seeded = migrateTaperState(createSeedState());
    const inserted = insertHistoricalTaperStep(seeded, 'caffeine', { amount: 80, unit: 'mg/day', startedAt: '2026-07-23T00:00:00', datePrecision: 'date_only' }, 'history-80');
    const edited = editTaperStep(inserted.state, 'history-80', { amount: 75, unit: 'mg/day', startedAt: '2026-07-22T00:00:00', datePrecision: 'approximate' });
    expect(edited.error).toBeUndefined();
    const steps = edited.state.taperSteps?.filter((step) => step.trackerId === 'caffeine') ?? [];
    expect(steps.find((step) => step.id === 'seed-caffeine-160')?.endedAt).toBe('2026-07-22T00:00:00');
    expect(steps.find((step) => step.id === 'history-80')).toMatchObject({ amount: 75, endedAt: '2026-07-25T00:00:00', datePrecision: 'approximate' });
  });

  test('confirmed deletion removes a historical step and safely joins its neighbors', () => {
    const seeded = migrateTaperState(createSeedState());
    const inserted = insertHistoricalTaperStep(seeded, 'caffeine', { amount: 80, unit: 'mg/day', startedAt: '2026-07-23T00:00:00', datePrecision: 'date_only' }, 'history-80');
    expect(deleteTaperStep(inserted.state, 'history-80', false).state).toBe(inserted.state);
    const deleted = deleteTaperStep(inserted.state, 'history-80', true);
    const steps = deleted.state.taperSteps?.filter((step) => step.trackerId === 'caffeine') ?? [];
    expect(steps.some((step) => step.id === 'history-80')).toBe(false);
    expect(steps.find((step) => step.id === 'seed-caffeine-160')?.endedAt).toBe('2026-07-25T00:00:00');
    expect(steps.find((step) => step.status === 'current')?.amount).toBe(0);
  });

  test('historical insertion rejects duplicate, post-current, and pre-taper dates', () => {
    const seeded = migrateTaperState(createSeedState());
    const input = { amount: 80, unit: 'mg/day', datePrecision: 'approximate' as const };
    expect(insertHistoricalTaperStep(seeded, 'caffeine', { ...input, startedAt: '2026-07-20T00:00:00' }, 'duplicate').error).toContain('already begins');
    expect(insertHistoricalTaperStep(seeded, 'caffeine', { ...input, startedAt: '2026-07-26T00:00:00' }, 'late').error).toContain('current step');
    expect(insertHistoricalTaperStep(seeded, 'caffeine', { ...input, startedAt: '2026-07-19T00:00:00' }, 'early').error).toContain('original taper start');
  });

  test('seeded caffeine timeline keeps approximate dates without inventing a time label', () => {
    const caffeine = createSeedState().taperSteps?.filter((step) => step.trackerId === 'caffeine') ?? [];
    expect(caffeine.map((step) => [step.amount, step.datePrecision])).toEqual([[300, 'date_only'], [160, 'approximate'], [0, 'approximate']]);
    expect(formatStepStart(caffeine[2])).toBe('Started approximately Jul 25, 2026');
    expect(formatStepStart(caffeine[2])).not.toContain('12:00');
  });
});
