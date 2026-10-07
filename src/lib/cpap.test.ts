import { CpapReading, CpapTherapySettings, TrackerState } from '@/models/tracker';
import { activeCpapSettings, cpapGoalForDate, cpapGoalProgress, cpapSettingsPeriods, cpapSummary, cpapTrendAxis, cpapTrendDescription, cpapTrendPoints, cpapUsageDayCounts, cpapUsageStreakStats, equalNightSettingsComparison, filterCpapReadings, formatCpapMetricValue, migrateCpapState, parseCpapRecognition, parseCpapText, removeCpapReading, removeCpapTherapySettings, setCpapUsageGoal, upsertCpapReading, upsertCpapTherapySettings, validateCpapReading, validateCpapTherapySettings } from './cpap';

test('CPAP goal changes preserve recorded nights and reject invalid targets', () => {
  const previous = [{ effectiveDate: '2026-09-01', minutes: 240 }];
  const existingNight = { id: 'night', sleepDate: '2026-10-02', usedMinutes: 250, averagePressure: 6, p95Pressure: 9, ahi: 1, cai: 0, averageLeak: 1, p95Leak: 2, recordedAt: '2026-10-02T10:00:00Z' };
  const goals = setCpapUsageGoal(previous, [existingNight], 360, new Date(2026, 9, 2, 12));
  expect(cpapGoalForDate(goals, '2026-10-02')?.minutes).toBe(240);
  expect(cpapGoalForDate(goals, '2026-10-03')?.minutes).toBe(360);
  expect(setCpapUsageGoal(previous, [], 300, new Date(2026, 9, 2, 12))).toContainEqual({ effectiveDate: '2026-10-02', minutes: 300 });
  expect(() => setCpapUsageGoal(previous, [], 0, new Date(2026, 9, 2, 12))).toThrow();
});

test('a first CPAP goal starts with a saved recent night, whether labelled by sleep or wake date', () => {
  const now = new Date(2026, 9, 2, 12);
  const lastNight = reading('yesterday', '2026-10-01', { usedMinutes: 300 });
  const goal = setCpapUsageGoal([], [lastNight], 240, now);
  expect(goal).toEqual([{ effectiveDate: '2026-10-01', minutes: 240 }]);
  expect(cpapGoalProgress(goal, [lastNight], now)).toMatchObject({ sleepDate: '2026-10-01', usedMinutes: 300, reached: true });
  expect(cpapGoalProgress([{ effectiveDate: '2026-10-02', minutes: 240 }], [lastNight], now)).toMatchObject({ sleepDate: '2026-10-01', usedMinutes: 300, reached: true });
  const wakeDated = reading('today', '2026-10-02', { usedMinutes: 180 });
  expect(cpapGoalProgress(setCpapUsageGoal([], [wakeDated], 240, now), [wakeDated], now)).toMatchObject({ sleepDate: '2026-10-02', usedMinutes: 180, reached: false });
});

describe('CPAP doctor summary usage days', () => {
  test('separates short use, zero use, and missing nights without counting unstarted or current days', () => {
    const data = [reading('a', '2026-09-24'), reading('b', '2026-09-25', { usedMinutes: 180 }), reading('c', '2026-09-27', { usedMinutes: 0 })];
    expect(cpapUsageDayCounts(data, 'ALL', new Date(2026, 8, 28, 12))).toMatchObject({ underFourHours: 1, missed: 2, startDate: '2026-09-24', endDate: '2026-09-27' });
    expect(cpapUsageDayCounts(data, '7D', new Date(2026, 8, 28, 12))).toMatchObject({ underFourHours: 1, missed: 2 });
    expect(cpapUsageDayCounts([], 'ALL', new Date(2026, 8, 28, 12))).toMatchObject({ underFourHours: 0, missed: 0 });
  });
});
const reading = (id: string, sleepDate: string, values: Partial<CpapReading> = {}): CpapReading => ({ id, sleepDate, usedMinutes: 300, averagePressure: 5, p95Pressure: 8, ahi: 1, cai: 0, averageLeak: 10, p95Leak: 20, recordedAt: '2026-09-09T08:00:00Z', ...values });
const setting = (id: string, effectiveDate: string, minPressure: number, maxPressure: number): CpapTherapySettings => ({ id, effectiveDate, mode: 'APAP', minPressure, maxPressure, recordedAt: `${effectiveDate}T12:00:00Z` });

describe('CPAP readings', () => {
  test('extracts the supplied machine labels from OCR text', () => {
    expect(parseCpapText('Used Time 318 min Avg. Treat P 5.1 cmH2O P95 8.0 cmH2O AHI 0.4 CAI 0.0 Avg. Leak 12.8 L/min 95% Leak 62.0 L/min')).toEqual({ usedMinutes: 318, averagePressure: 5.1, p95Pressure: 8, ahi: 0.4, cai: 0, averageLeak: 12.8, p95Leak: 62 });
  });
  test('extracts the clearer reference photo values and separated score', () => {
    const text = 'Usage Summary\nUsed Time 381 min\nAvg. Treat P 6.3 CmH2O\nP95 9.0 CmH2O\nAHI 2.9\nCAI 0.0\nAvg. Leak 3.3 L/min\n95% Leak 11.0 L/min\n95\n100 points';
    expect(parseCpapText(text)).toEqual({ usedMinutes: 381, averagePressure: 6.3, p95Pressure: 9, ahi: 2.9, cai: 0, averageLeak: 3.3, p95Leak: 11, score: 95 });
  });
  test('pairs separate label and value columns using OCR coordinates', () => {
    const labels = ['Used Time', 'Avg. Treat P', 'P95', 'AHI', 'CAI', 'Avg. Leak', '95% Leak'];
    const values = ['318 min', '5.1 cmH2O', '8.0 cmH2O', '0.4', '0.0', '12.8 L/min', '62.0 L/min'];
    const lines = labels.flatMap((text, index) => [
      { text, frame: { left: 10, right: 105, top: index * 30, bottom: index * 30 + 18 } },
      { text: values[index], frame: { left: 180, right: 270, top: index * 30 + 1, bottom: index * 30 + 19 } },
    ]).concat([{ text: '95', frame: { left: 38, right: 72, top: 220, bottom: 252 } }, { text: '100 points', frame: { left: 30, right: 90, top: 258, bottom: 275 } }]);
    expect(parseCpapRecognition({ text: `${labels.join('\n')}\n${values.join('\n')}`, blocks: [{ lines }] })).toMatchObject({ usedMinutes: 318, averagePressure: 5.1, p95Pressure: 8, ahi: 0.4, cai: 0, averageLeak: 12.8, p95Leak: 62, score: 95 });
  });
  test('uses units when OCR returns labels and values in separate text blocks', () => {
    expect(parseCpapText('Used Time\nAvg Treat P\nP95\nAHI\nCAI\nAvg Leak\n95% Leak\n318 min\n5.1 cmH2O\n8.0 cmH2O\n0.4\n0.0\n12.8 L/min\n62.0 L/min')).toMatchObject({ usedMinutes: 318, averagePressure: 5.1, p95Pressure: 8, averageLeak: 12.8, p95Leak: 62 });
  });
  test('rejects missing, negative, and obvious typo values', () => {
    expect(validateCpapReading({ ...reading('a', '2026-09-08'), id: undefined })).toBeUndefined();
    expect(validateCpapReading({ ...reading('a', '2026-09-08', { usedMinutes: 1800 }), id: undefined })).toBe('Double-check this reading before saving.');
    expect(validateCpapReading({ ...reading('a', 'bad'), id: undefined })).toBe('Enter a valid sleep date.');
  });
  test('sorts and edits without duplicates', () => {
    const saved = upsertCpapReading([reading('a', '2026-09-01')], { ...reading('b', '2026-09-02'), id: undefined }, 'b');
    const edited = upsertCpapReading(saved, { ...saved[1], ahi: 2 }, 'unused');
    expect(edited).toHaveLength(2); expect(edited.find((item) => item.id === 'a')?.ahi).toBe(2); expect(edited[0].id).toBe('b');
  });
  test('calculates direct nightly averages', () => {
    expect(cpapSummary([reading('a', '2026-09-01'), reading('b', '2026-09-02', { usedMinutes: 360, ahi: 3, averageLeak: 20, p95Leak: 40 })])).toEqual({ count: 2, averageUsedMinutes: 330, averageAhi: 2, averageLeak: 15, averageP95Leak: 30 });
  });
  test('formats chart point labels clearly and consistently', () => {
    expect(formatCpapMetricValue('usedMinutes', 381, 'm')).toBe('381m');
    expect(formatCpapMetricValue('ahi', 2.9, '')).toBe('2.9');
    expect(formatCpapMetricValue('averageLeak', 3, '')).toBe('3.0');
  });
  test('keeps seven-day trends nightly and condenses longer ranges into averages', () => {
    const data = [reading('a', '2026-09-07', { ahi: 2 }), reading('b', '2026-09-08', { ahi: 4 }), reading('c', '2026-09-14', { ahi: 8 })];
    expect(cpapTrendPoints(data, 'ahi', '7D').map((point) => point.value)).toEqual([2, 4, 8]);
    expect(cpapTrendPoints(data, 'ahi', '30D')).toMatchObject([{ count: 2, value: 3 }, { count: 1, value: 8 }]);
    expect(cpapTrendDescription('30D', data)).toBe('Weekly averages');
  });
  test('creates seven numerical calendar labels ending on the last completed day', () => {
    const points = cpapTrendPoints([reading('a', '2026-09-11'), reading('b', '2026-09-17')], 'ahi', '7D');
    expect(cpapTrendAxis('7D', points, new Date('2026-09-18T12:00:00'))).toEqual([
      { key: '2026-09-11', label: '9/11' }, { key: '2026-09-12', label: '9/12' },
      { key: '2026-09-13', label: '9/13' }, { key: '2026-09-14', label: '9/14' },
      { key: '2026-09-15', label: '9/15' }, { key: '2026-09-16', label: '9/16' },
      { key: '2026-09-17', label: '9/17' },
    ]);
  });
  test('excludes the current day from the completed seven-day window', () => {
    const data = [reading('old', '2026-09-10'), reading('first', '2026-09-11'), reading('last', '2026-09-17'), reading('today', '2026-09-18')];
    const visible = filterCpapReadings(data, '7D', new Date('2026-09-18T12:00:00'));
    expect(visible.map((item) => item.id)).toEqual(['first', 'last']);
  });
  test('uses calendar-month averages for the monthly view and calendar-year averages for the yearly view', () => {
    const data = [reading('a', '2023-01-10', { averageLeak: 4 }), reading('b', '2023-02-10', { averageLeak: 8 }), reading('c', '2026-01-10', { averageLeak: 12 })];
    expect(cpapTrendPoints(data, 'averageLeak', '1Y')).toHaveLength(3);
    expect(cpapTrendPoints(data, 'averageLeak', 'ALL')).toMatchObject([{ bucketKey: '2023', count: 2, value: 6 }, { bucketKey: '2026', count: 1, value: 12 }]);
    expect(cpapTrendPoints([reading('d', '2026-08-10', { ahi: 2 }), reading('e', '2026-08-20', { ahi: 4 }), reading('f', '2026-09-02', { ahi: 6 })], 'ahi', '90D')).toMatchObject([{ count: 2, value: 3 }, { count: 1, value: 6 }]);
    expect(cpapTrendDescription('90D', data)).toBe('Monthly averages');
    expect(cpapTrendDescription('ALL', data)).toBe('Yearly averages');
  });
  test('builds on one qualifying night and activates after two consecutive qualifying nights', () => {
    const now = new Date(2026, 8, 13, 12);
    expect(cpapUsageStreakStats([reading('a', '2026-09-12')], now)).toMatchObject({ current: 1, longest: 1, state: 'building' });
    expect(cpapUsageStreakStats([reading('a', '2026-09-11'), reading('b', '2026-09-12')], now)).toMatchObject({ current: 2, longest: 2, state: 'active' });
  });
  test('ends the active streak below four hours without erasing lifetime progress', () => {
    const data = [reading('a', '2026-09-09'), reading('b', '2026-09-10'), reading('c', '2026-09-11', { usedMinutes: 239 })];
    expect(cpapUsageStreakStats(data, new Date(2026, 8, 12, 12))).toMatchObject({ current: 0, longest: 2, qualifyingNights: 2, recordedNights: 3, state: 'below_threshold' });
  });
  test('keeps a missing latest night neutral and preserves the last confirmed run', () => {
    const data = [reading('a', '2026-09-10'), reading('b', '2026-09-11')];
    expect(cpapUsageStreakStats(data, new Date(2026, 8, 13, 12))).toMatchObject({ current: 2, longest: 2, state: 'no_data', referenceDate: '2026-09-12', latestRecordedDate: '2026-09-11' });
  });
  test('recalculates after backfilling, correcting, or deleting a night', () => {
    const now = new Date(2026, 8, 13, 12);
    const original = [reading('a', '2026-09-10'), reading('b', '2026-09-11')];
    expect(cpapUsageStreakStats([...original, reading('c', '2026-09-12')], now)).toMatchObject({ current: 3, longest: 3, state: 'active' });
    expect(cpapUsageStreakStats([original[0], reading('b', '2026-09-11', { usedMinutes: 180 }), reading('c', '2026-09-12')], now)).toMatchObject({ current: 1, longest: 1, state: 'building' });
    expect(cpapUsageStreakStats(original, now)).toMatchObject({ current: 2, state: 'no_data' });
  });
  test('counts today only after a completed record is uploaded', () => {
    const now = new Date(2026, 8, 12, 16);
    const yesterdayOnly = cpapUsageStreakStats([reading('a', '2026-09-11')], now);
    expect(yesterdayOnly).toMatchObject({ current: 1, referenceDate: '2026-09-11', state: 'building' });
    expect(cpapUsageStreakStats([reading('a', '2026-09-11'), reading('b', '2026-09-12')], now)).toMatchObject({ current: 2, referenceDate: '2026-09-12', state: 'active' });
  });
  test('requires deletion confirmation and preserves other nights', () => {
    const data = [reading('a', '2026-09-01'), reading('b', '2026-09-02')];
    expect(removeCpapReading(data, 'a', false)).toEqual(data); expect(removeCpapReading(data, 'a', true).map((item) => item.id)).toEqual(['b']);
  });
  test('leaves CPAP history empty for fresh or older state shapes', () => {
    const oldState = { trackers: [], checkIns: [] } as TrackerState; const migrated = migrateCpapState(oldState);
    expect(migrated.cpapReadings).toEqual([]);
    expect(migrateCpapState({ ...oldState, cpapReadings: [] }).cpapReadings).toEqual([]);
    expect(migrateCpapState({ ...oldState, cpapReadings: [reading('saved', '2026-09-08')] }).cpapReadings).toEqual([reading('saved', '2026-09-08')]);
    expect(migrated.cpapTherapySettings).toEqual([]);
  });
  test('validates, inserts, edits, and sorts therapy settings without changing readings', () => {
    expect(validateCpapTherapySettings({ effectiveDate: '2026-09-12', mode: 'APAP', minPressure: 5.5, maxPressure: 13 })).toBeUndefined();
    expect(validateCpapTherapySettings({ effectiveDate: '2026-09-12', mode: 'APAP', minPressure: 14, maxPressure: 13 })).toBe('Minimum pressure cannot be higher than maximum pressure.');
    const entries = upsertCpapTherapySettings([setting('new', '2026-09-12', 5.5, 13)], { effectiveDate: '2026-08-01', mode: 'APAP', minPressure: 4, maxPressure: 20 }, 'old', '2026-09-20T00:00:00Z');
    expect(entries.map((item) => item.id)).toEqual(['old', 'new']);
    const edited = upsertCpapTherapySettings(entries, { ...entries[0], maxPressure: 18 }, 'unused');
    expect(edited.find((item) => item.id === 'old')?.maxPressure).toBe(18);
  });
  test('associates each night with the latest effective settings period', () => {
    const settings = [setting('old', '2026-09-01', 4, 20), setting('new', '2026-09-12', 5.5, 13)];
    expect(activeCpapSettings(settings, '2026-09-11')?.id).toBe('old');
    expect(activeCpapSettings(settings, '2026-09-12')?.id).toBe('new');
    const periods = cpapSettingsPeriods(settings, [reading('a', '2026-09-11'), reading('b', '2026-09-12')]);
    expect(periods.map((period) => period.readings.map((item) => item.id))).toEqual([['a'], ['b']]);
  });
  test('compares equal night counts without interpreting the values', () => {
    const settings = [setting('old', '2026-09-01', 4, 20), setting('new', '2026-09-12', 5.5, 13)];
    const readings = [reading('a', '2026-09-09'), reading('b', '2026-09-10'), reading('c', '2026-09-11'), reading('d', '2026-09-12'), reading('e', '2026-09-13')];
    const comparison = equalNightSettingsComparison(settings, readings, 7);
    expect(comparison?.count).toBe(2);
    expect(comparison?.beforeReadings.map((item) => item.id)).toEqual(['b', 'c']);
    expect(comparison?.afterReadings.map((item) => item.id)).toEqual(['d', 'e']);
  });
  test('requires confirmation before deleting a settings entry', () => {
    const settings = [setting('old', '2026-09-01', 4, 20), setting('new', '2026-09-12', 5.5, 13)];
    expect(removeCpapTherapySettings(settings, 'old', false)).toEqual(settings);
    expect(removeCpapTherapySettings(settings, 'old', true).map((item) => item.id)).toEqual(['new']);
  });
});
