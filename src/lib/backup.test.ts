import { backupSummary, createReclaimBackup, parseReclaimBackup } from '@/lib/backup';
import { TrackerState } from '@/models/tracker';

const state: TrackerState = {
  trackers: [{ id: 'one', name: 'One', icon: '○', color: '#fff', mode: 'abstinence' }],
  checkIns: ['2026-09-18'],
  historicalEntries: [{ id: 'history', trackerId: 'one', eventDate: '2026-09-17', recordedAt: '2026-09-18T12:00:00Z', outcome: 'stayed_on_plan' }],
  cpapReadings: [{ id: 'cpap', sleepDate: '2026-09-18', usedMinutes: 400, averagePressure: 6, p95Pressure: 9, ahi: 1.2, cai: 0, averageLeak: 1.1, p95Leak: 4, recordedAt: '2026-09-18T12:00:00Z' }],
  cpapUsageGoals: [{ effectiveDate: '2026-09-18', minutes: 240 }],
  weightEntries: [{ id: 'weight', date: '2026-09-18', weight: 290, unit: 'lb', recordedAt: '2026-09-18T12:00:00Z' }],
  medications: [],
  labResults: [],
};

describe('full Reclaim backups', () => {
  it('round-trips template goals, checklist snapshots, and logs', () => {
    const habit = { ...state.trackers[0], mode: 'habit' as const, habitTemplate: 'dental' as const, habitChecklistHistory: [{ effectiveDate: '2026-10-12', items: [{ id: 'brush', label: 'Brush' }] }] };
    const goodHabitLogs = [{ id: 'log', trackerId: habit.id, eventDate: '2026-10-12', amount: 1, checklistItemId: 'brush', recordedAt: '2026-10-12T10:00:00Z' }];
    const backup = createReclaimBackup({ ...state, trackers: [habit], goodHabitLogs });
    expect(parseReclaimBackup(JSON.stringify(backup)).state.goodHabitLogs).toEqual(goodHabitLogs);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, goodHabitLogs: [{ ...goodHabitLogs[0], amount: -1 }] } }))).toThrow(/invalid good habit logs/);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, trackers: [{ ...habit, habitChecklistHistory: [] }] } }))).toThrow(/invalid tracker/);
  });
  it('round-trips exercise regimen and produce links while rejecting malformed additions', () => {
    const exercise = { ...state.trackers[0], mode: 'habit' as const, habitTemplate: 'exercise' as const, habitGoalHistory: [{ effectiveDate: '2026-10-12', value: 3 }], exerciseGoalModes: [{ effectiveDate: '2026-10-12', mode: 'times' as const }], exerciseRegimenHistory: [{ effectiveDate: '2026-10-12', rows: [{ id: 'push', label: 'Push', days: [0, 2] }] }] };
    const produce = { ...state.trackers[0], id: 'produce', mode: 'habit' as const, habitTemplate: 'produce' as const, habitGoalHistory: [{ effectiveDate: '2026-10-12', value: 5 }], producePresets: [0.5, 1] };
    const goodHabitLogs = [{ id: 'linked', trackerId: 'produce', eventDate: '2026-10-12', amount: 1, recordedAt: '2026-10-12T10:00:00Z', produceCategory: 'fruit' as const, nutritionEntryId: 'apple', nutritionEntryUpdatedAt: '2026-10-12T09:00:00Z', source: 'nutrition' as const }];
    const backup = createReclaimBackup({ ...state, trackers: [exercise, produce], goodHabitLogs });
    expect(parseReclaimBackup(JSON.stringify(backup)).state.trackers).toEqual([exercise, produce]);
    expect(parseReclaimBackup(JSON.stringify(backup)).state.goodHabitLogs).toEqual(goodHabitLogs);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, trackers: [{ ...exercise, exerciseGoalModes: [{ effectiveDate: '2026-10-12', mode: 'distance' }] }, produce] } }))).toThrow(/invalid tracker/);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, trackers: [exercise, { ...produce, producePresets: [-1] }] } }))).toThrow(/invalid tracker/);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, goodHabitLogs: [{ ...goodHabitLogs[0], produceCategory: 'protein' }] } }))).toThrow(/invalid good habit logs/);
  });
  it('preserves positive habit settings and rejects unknown log styles or reminder times', () => {
    const habit = { ...state.trackers[0], mode: 'habit' as const, habitLogStyle: 'done' as const, habitReminderTime: '09:00' };
    const backup = createReclaimBackup({ ...state, trackers: [habit] });
    expect(parseReclaimBackup(JSON.stringify(backup)).state.trackers[0]).toEqual(habit);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, trackers: [{ ...habit, habitLogStyle: 'toggle' }] } }))).toThrow(/invalid tracker/);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, trackers: [{ ...habit, habitReminderTime: '9am' }] } }))).toThrow(/invalid tracker/);
  });
  it('round-trips water template settings and drink logs, rejecting malformed values', () => {
    const water = { ...state.trackers[0], mode: 'habit' as const, habitTemplate: 'water' as const, waterQuickAddOz: 8, waterDisplayUnit: 'mL' as const, waterPresetOz: [8, 12, 16, 24], waterGoals: [{ effectiveDate: '2026-09-18', ounces: 64 }] };
    const waterLogs = [{ id: 'drink', trackerId: water.id, eventDate: '2026-09-18', ounces: 12, recordedAt: '2026-09-18T12:00:00Z' }];
    const backup = createReclaimBackup({ ...state, trackers: [water], waterLogs });
    expect(parseReclaimBackup(JSON.stringify(backup)).state.waterLogs).toEqual(waterLogs);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, trackers: [{ ...water, waterQuickAddOz: -1 }] } }))).toThrow(/invalid tracker/);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, trackers: [{ ...water, waterDisplayUnit: 'cups' }] } }))).toThrow(/invalid tracker/);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, trackers: [{ ...water, waterPresetOz: [0] }] } }))).toThrow(/invalid tracker/);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, waterLogs: [{ ...waterLogs[0], ounces: 0 }] } }))).toThrow(/invalid water logs/);
  });
  it('round-trips every stored data section without sharing object references', () => {
    const backup = createReclaimBackup(state, [{ ownerType: 'cpap', ownerId: 'cpap', extension: 'jpg', base64: 'abc' }], '2026-09-18T13:00:00Z');
    const parsed = parseReclaimBackup(JSON.stringify(backup));
    expect(parsed.state).toEqual(state);
    expect(parsed.attachments).toHaveLength(1);
    parsed.state.trackers[0].name = 'Changed';
    expect(state.trackers[0].name).toBe('One');
  });

  it('rejects unrelated and structurally damaged files', () => {
    expect(() => parseReclaimBackup('{"format":"something-else"}')).toThrow(/supported Reclaim backup/);
    expect(() => parseReclaimBackup(JSON.stringify({ format: 'reclaim-full-backup', version: 1, exportedAt: 'now', state: { trackers: [], checkIns: {} }, attachments: [] }))).toThrow(/required tracker data/);
  });

  it('accepts legacy version-one backups and upgrades them', () => {
    const parsed = parseReclaimBackup(JSON.stringify({ format: 'reclaim-full-backup', version: 1, exportedAt: 'now', state: { trackers: [], checkIns: [] }, attachments: [] }));
    expect(parsed.version).toBe(3);
  });

  it('accepts old medication records, preserves supplement types, and rejects unknown types', () => {
    const legacy = { id: 'med-1', name: 'Existing', schedule: { type: 'daily' as const, times: ['09:00'] }, remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-09-18T12:00:00Z' };
    const oldBackup = createReclaimBackup({ ...state, medications: [legacy] });
    expect(parseReclaimBackup(JSON.stringify(oldBackup)).state.medications?.[0].kind).toBeUndefined();
    const supplement = createReclaimBackup({ ...state, medications: [{ ...legacy, kind: 'supplement' }] });
    expect(parseReclaimBackup(JSON.stringify(supplement)).state.medications?.[0].kind).toBe('supplement');
    expect(() => parseReclaimBackup(JSON.stringify({ ...supplement, state: { ...supplement.state, medications: [{ ...legacy, kind: 'other' }] } }))).toThrow(/invalid medication or supplement type/);
  });

  it('round-trips supplement stacks and rejects malformed or duplicate dose slots', () => {
    const supplementStacks = [{ id: 'morning', name: 'Morning', members: [{ medicationId: 'supp', time: '08:00' }] }];
    const backup = createReclaimBackup({ ...state, supplementStacks });
    expect(parseReclaimBackup(JSON.stringify(backup)).state.supplementStacks).toEqual(supplementStacks);
    expect(parseReclaimBackup(JSON.stringify(createReclaimBackup(state))).state.supplementStacks).toBeUndefined();
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, supplementStacks: [{ ...supplementStacks[0], members: [{ medicationId: 'supp', time: '8am' }] }] } }))).toThrow(/invalid supplement stacks/);
    expect(() => parseReclaimBackup(JSON.stringify({ ...backup, state: { ...backup.state, supplementStacks: [...supplementStacks, { ...supplementStacks[0], id: 'second' }] } }))).toThrow(/duplicate supplement stack doses/);
  });

  it('rejects invalid CPAP goal history without affecting older backups', () => {
    expect(() => parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...state, cpapUsageGoals: [{ effectiveDate: '2026-09-18', minutes: 0 }] })))).toThrow(/invalid CPAP usage goals/);
    expect(parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...state, cpapUsageGoals: undefined }))).state.cpapUsageGoals).toBeUndefined();
  });

  it('summarizes records before a restore', () => {
    expect(backupSummary(state)).toEqual({ trackers: 1, checkIns: 2, cpapReadings: 1, weightEntries: 1, healthRecords: 0, nutritionEntries: 0 });
  });
});
