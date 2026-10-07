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
    expect(parsed.version).toBe(2);
  });

  it('accepts old medication records, preserves supplement types, and rejects unknown types', () => {
    const legacy = { id: 'med-1', name: 'Existing', schedule: { type: 'daily' as const, times: ['09:00'] }, remindersEnabled: false, notificationIds: [], archived: false, recordedAt: '2026-09-18T12:00:00Z' };
    const oldBackup = createReclaimBackup({ ...state, medications: [legacy] });
    expect(parseReclaimBackup(JSON.stringify(oldBackup)).state.medications?.[0].kind).toBeUndefined();
    const supplement = createReclaimBackup({ ...state, medications: [{ ...legacy, kind: 'supplement' }] });
    expect(parseReclaimBackup(JSON.stringify(supplement)).state.medications?.[0].kind).toBe('supplement');
    expect(() => parseReclaimBackup(JSON.stringify({ ...supplement, state: { ...supplement.state, medications: [{ ...legacy, kind: 'other' }] } }))).toThrow(/invalid medication or supplement type/);
  });

  it('rejects invalid CPAP goal history without affecting older backups', () => {
    expect(() => parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...state, cpapUsageGoals: [{ effectiveDate: '2026-09-18', minutes: 0 }] })))).toThrow(/invalid CPAP usage goals/);
    expect(parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...state, cpapUsageGoals: undefined }))).state.cpapUsageGoals).toBeUndefined();
  });

  it('summarizes records before a restore', () => {
    expect(backupSummary(state)).toEqual({ trackers: 1, checkIns: 2, cpapReadings: 1, weightEntries: 1, healthRecords: 0, nutritionEntries: 0 });
  });
});
