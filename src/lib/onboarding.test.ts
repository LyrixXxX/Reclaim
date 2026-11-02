import { createSeedState } from '@/data/seed';
import { createLocalStateWriter, readLocalState } from './local-storage';
import { migratePreferences, setHealthModuleVisible, setSectionVisible } from './preferences';
import { createReclaimBackup, parseReclaimBackup } from './backup';
import { completeOnboarding, createFreshState, needsOnboarding, normalizeOnboardingSelections, parseFirstNutrition, parseFirstStepGoal, parseFirstWeight, persistCompletedOnboarding, shouldEnableFirstStepTracking } from './onboarding';
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
    expect(next.preferences!.visibleSections).toEqual({ goals: false, health: false, cpap: false, weight: true, nutrition: false, activity: false, routes: false, workouts: false, supplements: false });
    expect(next.preferences!.dashboard?.filter((widget) => widget.visible).map((widget) => [widget.id, widget.expanded])).toEqual([['weight', false]]);
  });

  test('Workouts is optional and adds its tab without inventing a Home widget', () => {
    const next = completeOnboarding({ ...createFreshState(), onboardingSelections: ['workouts'] });
    expect(next.preferences!.visibleSections.workouts).toBe(true);
    expect(next.preferences!.visibleSections.activity).toBe(false);
    expect(next.preferences!.dashboard?.filter((widget) => widget.visible)).toEqual([]);
    expect(migratePreferences(next).preferences?.visibleSections.workouts).toBe(true);
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
    const pending = { ...createFreshState(), onboardingSelections: ['weight' as const], onboardingSetupDraft: { weight: { value: '180', unit: 'lb' as const } } };
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
    expect(completed.weightEntries).toHaveLength(1);
    expect(pending.weightEntries).toBeUndefined();
    expect(JSON.parse(snapshots[0])).toEqual(completed);
  });

  test('first entries become ordinary records only for selected, unskipped areas', () => {
    const date = new Date(2026, 9, 15, 12);
    const draft = { weight: { value: '182.5', unit: 'lb' as const }, nutrition: { calories: '2105', carbs: '220', protein: '160', fat: '65', fiber: '30' } };
    const pending = { ...createFreshState(), onboardingSelections: ['weight' as const, 'nutrition' as const], onboardingSetupDraft: draft };
    expect(pending.weightEntries).toBeUndefined();
    const complete = completeOnboarding(pending, date);
    expect(complete.weightEntries?.[0]).toMatchObject({ date: '2026-10-15', weight: 182.5, unit: 'lb' });
    expect(complete.nutritionGoals?.[0]).toMatchObject({ effectiveDate: '2026-10-15', calorieTarget: 2105, carbsGrams: 220, proteinGrams: 160, fatGrams: 65, fiberGrams: 30 });
    expect(complete.onboardingSetupDraft).toBeUndefined();
    expect(completeOnboarding({ ...pending, onboardingSelections: ['weight'], onboardingSetupDraft: { ...draft, weight: { value: '82.4', unit: 'kg' }, nutrition: { ...draft.nutrition, skipped: true } } }, date).nutritionGoals).toBeUndefined();
    expect(completeOnboarding({ ...pending, onboardingSetupDraft: { ...draft, weight: { ...draft.weight, skipped: true } } }, date).weightEntries).toBeUndefined();
  });

  test('setup values survive pending-state reload and cannot save invalid numbers', async () => {
    const pending = { ...createFreshState(), onboardingSelections: ['weight' as const], onboardingSetupDraft: { weight: { value: '78.4', unit: 'kg' as const } } };
    const reloaded = await readLocalState(async () => JSON.stringify(pending));
    expect(reloaded?.onboardingSetupDraft).toEqual(pending.onboardingSetupDraft);
    expect(completeOnboarding(reloaded!, new Date(2026, 9, 15)).weightEntries?.[0].unit).toBe('kg');
    expect(() => parseFirstWeight('')).toThrow();
    expect(() => parseFirstWeight('-2')).toThrow();
    expect(() => parseFirstNutrition({ calories: '', carbs: '0', protein: '0', fat: '0', fiber: '0' })).toThrow();
    expect(() => parseFirstNutrition({ calories: '2000', carbs: '20', protein: '', fat: '0', fiber: '0' })).toThrow();
    expect(parseFirstNutrition({ calories: '2000', carbs: '20.5', protein: '30', fat: '10', fiber: '0' }).carbsGrams).toBe(20.5);
    expect(parseFirstNutrition({ calories: '2000', carbs: '20.5', protein: '30', fat: '10', fiber: '' }).fiberGrams).toBe(0);
    expect(parseFirstNutrition({ calories: '2000', carbs: '', protein: '', fat: '', fiber: '' })).toMatchObject({ calorieTarget: 2000, macroTargetsEnabled: false });
    expect(() => parseFirstNutrition({ calories: '2000', carbs: '20', protein: '30', fat: '10', fiber: '-1' })).toThrow();
  });

  test('Activity setup saves a daily goal and requests tracking only when explicitly chosen', async () => {
    const date = new Date(2026, 9, 15, 12);
    const pending = { ...createFreshState(), onboardingSelections: ['activity' as const], onboardingSetupDraft: { activity: { stepGoal: '8500', enableStepTracking: true } } };
    const reloaded = await readLocalState(async () => JSON.stringify(pending));
    expect(reloaded?.onboardingSetupDraft?.activity).toEqual(pending.onboardingSetupDraft.activity);
    expect(shouldEnableFirstStepTracking(reloaded!)).toBe(true);
    expect(completeOnboarding(reloaded!, date).stepGoals).toEqual([{ effectiveDate: '2026-10-15', count: 8500 }]);
    const goalOnly = { ...pending, onboardingSetupDraft: { activity: { stepGoal: '7000', enableStepTracking: false } } };
    expect(shouldEnableFirstStepTracking(goalOnly)).toBe(false);
    expect(completeOnboarding(goalOnly, date).stepGoals?.[0].count).toBe(7000);
    const skipped = { ...pending, onboardingSetupDraft: { activity: { stepGoal: '8500', enableStepTracking: true, skipped: true } } };
    expect(shouldEnableFirstStepTracking(skipped)).toBe(false);
    expect(completeOnboarding(skipped, date).stepGoals).toBeUndefined();
    expect(shouldEnableFirstStepTracking({ ...pending, onboardingSelections: [] })).toBe(false);
    expect(() => parseFirstStepGoal('')).toThrow();
    expect(() => parseFirstStepGoal('12.5')).toThrow();
    expect(() => parseFirstStepGoal('100001')).toThrow();
  });
});
