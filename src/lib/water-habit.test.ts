import { Tracker, TrackerState, WaterLog } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';
import { removeWaterLog, renameDefaultWaterHabit, saveWaterLog, waterDisplayAmount, waterGoalOn, waterProgress, waterStreak, waterToOunces, waterTotalOn } from '@/lib/water-habit';
import { permanentlyDeleteTracker, trackerFromDraft, trackerHasHistory } from '@/lib/tracker-management';

const tracker: Tracker = { id: 'water', name: 'Drink more water', mode: 'habit', habitTemplate: 'water', icon: '💧', color: '#00ff99', startedAt: '2026-10-01T00:00:00', waterQuickAddOz: 8, waterGoals: [{ effectiveDate: '2026-10-01', ounces: 32 }] };
const log = (id: string, date: string, ounces: number): WaterLog => ({ id, trackerId: tracker.id, eventDate: date, ounces, recordedAt: `${date}T12:00:00Z` });

describe('water habit', () => {
  it('adds individual drinks, caps only the visual bar, and supports edits and deletion', () => {
    const today = localDateKey();
    const state: TrackerState = { trackers: [tracker], checkIns: [], waterLogs: [] };
    const first = saveWaterLog(state, log('one', today, 8));
    const second = saveWaterLog(first, log('two', today, 24));
    expect(waterProgress(tracker, second.waterLogs ?? [], today)).toEqual({ amount: 32, goal: 32, percent: 100 });
    const over = saveWaterLog(second, log('three', today, 10));
    expect(waterProgress(tracker, over.waterLogs ?? [], today)).toEqual({ amount: 42, goal: 32, percent: 100 });
    const edited = saveWaterLog(over, log('one', today, 12));
    expect(edited.waterLogs).toHaveLength(3);
    expect(waterTotalOn(edited.waterLogs ?? [], tracker.id, today)).toBe(46);
    expect(waterTotalOn(removeWaterLog(edited, 'two').waterLogs ?? [], tracker.id, today)).toBe(22);
  });

  it('uses the goal effective on each historical date', () => {
    const changed = { ...tracker, waterGoals: [{ effectiveDate: '2026-10-01', ounces: 32 }, { effectiveDate: '2026-10-11', ounces: 64 }] };
    expect(waterGoalOn(changed, '2026-10-10')).toBe(32);
    expect(waterProgress(changed, [log('old', '2026-10-10', 32)], '2026-10-10').percent).toBe(100);
    expect(waterGoalOn(changed, '2026-10-11')).toBe(64);
    expect(waterStreak(changed, [log('old', '2026-10-10', 32)], '2026-10-11')).toBe(1);
    const edited = trackerFromDraft({ name: tracker.name, mode: 'habit', habitTemplate: 'water', icon: tracker.icon, color: tracker.color, startDate: '2026-10-01', waterGoalOz: '64', waterQuickAddOz: '8' }, tracker.id, tracker);
    expect(waterGoalOn(edited, '2026-10-10')).toBe(32);
    expect(waterGoalOn(edited, localDateKey())).toBe(64);
  });

  it('rejects invalid amounts and future dates without changing state', () => {
    const state: TrackerState = { trackers: [tracker], checkIns: [] };
    expect(saveWaterLog(state, log('bad', localDateKey(), 0))).toBe(state);
    expect(saveWaterLog(state, log('future', '2099-01-01', 8))).toBe(state);
    expect(saveWaterLog(state, log('invalid-date', '2026-02-30', 8))).toBe(state);
  });

  it('separates local calendar days and keeps backfilled drinks on their chosen day', () => {
    const logs = [log('yesterday', '2026-10-10', 8), log('today', '2026-10-11', 16)];
    expect(waterTotalOn(logs, tracker.id, '2026-10-10')).toBe(8);
    expect(waterTotalOn(logs, tracker.id, '2026-10-11')).toBe(16);
    expect(waterProgress(tracker, logs, '2026-10-12').amount).toBe(0);
  });

  it('treats drink logs as tracker history and removes them only after confirmed deletion', () => {
    const state: TrackerState = { trackers: [tracker], checkIns: [], waterLogs: [log('one', '2026-10-10', 8)] };
    expect(trackerHasHistory(state, tracker.id)).toBe(true);
    expect(permanentlyDeleteTracker(state, tracker.id, true)).toBe(state);
    expect(permanentlyDeleteTracker(state, tracker.id, true, 'DELETE').waterLogs).toEqual([]);
  });

  it('converts mL entries for existing ounce-based logs without changing their totals', () => {
    const amountOz = waterToOunces(250, 'mL');
    expect(waterDisplayAmount(amountOz, 'mL')).toBe('250');
    expect(waterDisplayAmount(8, 'fl oz')).toBe('8');
    const today = localDateKey();
    const saved = saveWaterLog({ trackers: [tracker], checkIns: [] }, log('metric', today, amountOz));
    expect(waterDisplayAmount(waterTotalOn(saved.waterLogs ?? [], tracker.id, today), 'mL')).toBe('250');
  });

  it('saves display units and shortcut presets without changing dated goal history', () => {
    const edited = trackerFromDraft({ name: tracker.name, mode: 'habit', habitTemplate: 'water', icon: tracker.icon, color: tracker.color, startDate: '2026-10-01', waterGoalOz: '64', waterQuickAddOz: '8', waterDisplayUnit: 'mL', waterPresetOz: [8, 12] }, tracker.id, tracker);
    expect(edited.waterDisplayUnit).toBe('mL');
    expect(edited.waterPresetOz).toEqual([8, 12]);
    expect(waterGoalOn(edited, '2026-10-10')).toBe(32);
  });
});

describe('renameDefaultWaterHabit', () => {
  it('renames the old default and leaves custom names alone', () => {
    const state = { trackers: [tracker, { ...tracker, id: 'w2', name: 'Hydrate' }, { ...tracker, id: 'w3', name: 'Water', displayName: 'Drink more water' }, { ...tracker, id: 'r', habitTemplate: 'reading', name: 'Drink more water' }], checkIns: [] } as unknown as TrackerState;
    const renamed = renameDefaultWaterHabit(state).trackers;
    expect(renamed.map((item) => [item.name, item.displayName])).toEqual([['Drink Water', undefined], ['Hydrate', undefined], ['Water', 'Drink Water'], ['Drink more water', undefined]]);
    const already = { trackers: [{ ...tracker, name: 'Drink Water' }], checkIns: [] } as unknown as TrackerState;
    expect(renameDefaultWaterHabit(already)).toBe(already);
  });
});
