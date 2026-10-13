import { createSeedState } from '@/data/seed';
import { createLocalStateWriter, readLocalState } from './local-storage';
import { migratePreferences, setHealthModuleVisible, setSectionVisible } from './preferences';
import { createReclaimBackup, parseReclaimBackup } from './backup';
import { completeOnboarding, createFreshState, needsOnboarding, normalizeOnboardingSelections, persistCompletedOnboarding } from './onboarding';
import { migrateCpapState } from './cpap';

describe('first-run setup', () => {
  test('only a missing saved state creates a blank, pending installation', async () => {
    const fresh = createFreshState();
    expect(await readLocalState(async () => null)).toBeNull();
    expect(fresh.trackers).toEqual([]);
    expect(fresh.checkIns).toEqual([]);
    expect(migrateCpapState(fresh).cpapReadings).toEqual([]);
    expect(needsOnboarding(fresh)).toBe(true);
    expect(createSeedState().trackers.length).toBeGreaterThan(0);
  });

  test('no selections leaves Home and Settings with all optional areas hidden', () => {
    const next = completeOnboarding(createFreshState());
    expect(needsOnboarding(next)).toBe(false);
    expect(Object.values(next.preferences!.visibleSections).every((visible) => !visible)).toBe(true);
    expect(Object.values(next.preferences!.visibleHealthModules).every((visible) => !visible)).toBe(true);
    expect(next.preferences!.dashboard?.every((widget) => !widget.visible && !widget.expanded)).toBe(true);
    expect(next.trackers).toEqual([]);
  });

  test('one choice enables only its tab and widget', () => {
    const next = completeOnboarding({ ...createFreshState(), onboardingSelections: ['weight'] });
    expect(next.preferences!.visibleSections).toEqual({ goals: false, health: false, cpap: false, weight: true, nutrition: false, activity: false });
    expect(next.preferences!.dashboard?.filter((widget) => widget.visible).map((widget) => [widget.id, widget.expanded])).toEqual([['weight', false]]);
  });

  test('older medical selections are ignored in the wellness edition', () => {
    const next = completeOnboarding({ ...createFreshState(), onboardingSelections: ['labs', 'medications'] });
    expect(next.preferences!.visibleSections.health).toBe(false);
    expect(next.preferences!.visibleHealthModules).toEqual({ bloodPressure: false, medications: false, labs: false });
    expect(next.preferences!.dashboard?.filter((widget) => widget.visible)).toEqual([]);
  });

  test('all selections use questionnaire order and stay compact', () => {
    const reversed = ['labs', 'medications', 'bloodPressure', 'weight', 'cpap', 'nutrition', 'habits'] as const;
    const next = completeOnboarding({ ...createFreshState(), onboardingSelections: [...reversed] });
    expect(next.preferences!.dashboard?.filter((widget) => widget.visible).map((widget) => widget.id)).toEqual([
      'habits', 'nutrition', 'weight',
    ]);
    expect(next.preferences!.dashboard?.every((widget) => !widget.expanded)).toBe(true);
  });

  test('a pending questionnaire can reload its choices, while older states and backups bypass it', async () => {
    const pending = { ...createFreshState(), onboardingSelections: ['weight' as const] };
    const reloaded = await readLocalState(async () => JSON.stringify(pending));
    expect(needsOnboarding(reloaded!)).toBe(true);
    expect(normalizeOnboardingSelections(reloaded!.onboardingSelections)).toEqual(['weight']);
    const older = migratePreferences(createSeedState());
    expect(needsOnboarding(older)).toBe(false);
    expect(older.trackers).toHaveLength(createSeedState().trackers.length);
    expect(older.preferences?.visibleSections.cpap).toBe(false);
    const backup = parseReclaimBackup(JSON.stringify(createReclaimBackup(older)));
    expect(needsOnboarding(migratePreferences(backup.state))).toBe(false);
  });

  test('completed choices survive reload and hidden areas can be enabled later without touching records', async () => {
    const complete = completeOnboarding({ ...createFreshState(), onboardingSelections: ['weight'] });
    const reloaded = migratePreferences((await readLocalState(async () => JSON.stringify(complete)))!);
    expect(needsOnboarding(reloaded)).toBe(false);
    expect(reloaded.preferences?.dashboard?.filter((widget) => widget.visible).map((widget) => widget.id)).toEqual(['weight']);
    const originalRecords = reloaded.trackers;
    const enabled = setHealthModuleVisible(setSectionVisible(reloaded, 'health', true), 'labs', true);
    expect(enabled.preferences?.visibleHealthModules.labs).toBe(true);
    expect(enabled.trackers).toBe(originalRecords);
  });

  test('a failed final save keeps setup pending; retry persists the completed choices', async () => {
    const pending = { ...createFreshState(), onboardingSelections: ['habits' as const] };
    let fail = true;
    const snapshots: string[] = [];
    const writer = createLocalStateWriter(async (snapshot) => {
      if (fail) throw new Error('storage unavailable');
      snapshots.push(snapshot);
    }, jest.fn());
    await expect(persistCompletedOnboarding(pending, writer.save)).rejects.toThrow('storage unavailable');
    expect(needsOnboarding(pending)).toBe(true);
    expect(snapshots).toEqual([]);
    fail = false;
    const completed = await persistCompletedOnboarding(pending, writer.save);
    expect(needsOnboarding(completed)).toBe(false);
    expect(JSON.parse(snapshots[0])).toEqual(completed);
  });
});
