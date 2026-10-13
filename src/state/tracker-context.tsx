import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { BrandedLoading } from '@/components/branded-loading';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLocalStateWriter, readLocalState, SaveStatus, STATE_STORAGE_KEY } from '@/lib/local-storage';
import { colors } from '@/theme';

import { ActivityRoute, AppSection, DashboardWidget, GoodHabitLog, HistoricalEntry, NutritionGoalProfile, NutritionMealGroup, OnboardingArea, Tracker, TrackerId, TrackerState, WaterLog, WeightEntry, WeightTdeeProfile } from '@/models/tracker';
import { createFreshState, needsOnboarding, normalizeOnboardingSelections, persistCompletedOnboarding } from '@/lib/onboarding';
import { saveDashboardLayout } from '@/lib/dashboard';
import { localDateKey } from '@/lib/progress';
import { deleteTrackerHistory } from '@/lib/recovery';
import {
  HistoricalEntryInput,
  removeHistoricalEntry,
  upsertHistoricalEntry,
} from '@/lib/history';
import {
  createTracker,
  editTracker,
  permanentlyDeleteTracker,
  setTrackerArchived,
  TrackerDraft,
} from '@/lib/tracker-management';
import { addTaperStep, deleteTaperStep, editTaperStep, insertHistoricalTaperStep, migrateTaperState, TaperStepInput } from '@/lib/taper';
import { mergeWeightImport, upsertWeightEntry, WeightExport } from '@/lib/weight';
import { DEFAULT_PREFERENCES, migratePreferences, setRouteCaloriesInNutrition, setSectionVisible } from '@/lib/preferences';
import { restoreStepHistory, setDailyStepGoal } from '@/lib/activity-step-history';
import { swapHabitOrder } from '@/lib/habit-order';
import { cancelMedicationNotifications } from '@/lib/medication-notifications';
import { cancelHabitReminder, scheduleHabitReminder } from '@/lib/habit-notifications';
import { logHabitCompletion } from '@/lib/habit-log';
import { removeWaterLog, saveWaterLog } from '@/lib/water-habit';
import { validHabitLog } from '@/lib/good-habit-templates';
import { applyNutritionLogBatch, applyPreparedSavedMeal, migrateNutritionState, NutritionEntryInput, NutritionLogBatch, prepareNutritionLogBatch, prepareSavedMeal, removeNutritionEntry, removeNutritionGoal, removeSavedFood, removeSavedMeal, SavedFoodInput, SavedMealInput, upsertMealGroup, upsertNutritionEntry, upsertNutritionGoal, upsertSavedFood } from '@/lib/nutrition';

type TrackerContextValue = TrackerState & {
  hydrated: boolean;
  setOnboardingSelections: (selected: OnboardingArea[]) => void;
  finishOnboarding: () => Promise<void>;
  saveDashboard: (widgets: DashboardWidget[]) => void;
  swapHabitOrder: (firstId: string, secondId: string) => void;
  saveStatus: SaveStatus;
  retrySave: () => void;
  checkInToday: () => void;
  updateCurrent: (id: TrackerId, value: number) => void;
  addLapse: (trackerId: TrackerId, date: string, note?: string) => void;
  updateLapse: (event: HistoricalEntry) => void;
  removeLapse: (eventId: string) => void;
  saveHistoricalEntry: (entry: HistoricalEntryInput) => void;
  deleteHistoricalEntry: (entryId: string) => void;
  changeStartDate: (id: TrackerId, date: string) => void;
  deleteHistory: (id: TrackerId, confirmed: boolean) => void;
  createCustomTracker: (draft: TrackerDraft, id: TrackerId) => Promise<void>;
  editExistingTracker: (id: TrackerId, draft: TrackerDraft) => Promise<void>;
  logGoodHabit: (id: TrackerId) => void;
  saveWaterDrink: (log: WaterLog) => void;
  deleteWaterDrink: (id: string) => void;
  saveGoodHabitLog: (log: GoodHabitLog) => void;
  deleteGoodHabitLog: (id: string) => void;
  setArchived: (id: TrackerId, archived: boolean) => void;
  deleteTracker: (id: TrackerId, confirmed: boolean, confirmationText?: string) => Promise<boolean>;
  addReductionStep: (trackerId: TrackerId, input: TaperStepInput, stepId: string) => void;
  editReductionStep: (stepId: string, input: TaperStepInput) => void;
  insertHistoricalReductionStep: (trackerId: TrackerId, input: TaperStepInput, stepId: string) => void;
  deleteReductionStep: (stepId: string, confirmed: boolean) => void;
  importWeightHistory: (file: WeightExport) => { added: number; duplicates: number };
  saveWeightEntry: (entry: Omit<WeightEntry, 'id' | 'recordedAt'>) => void;
  saveWeightTdeeProfile: (profile: WeightTdeeProfile) => void;
  deleteWeightEntry: (date: string, confirmed: boolean) => void;
  setSectionVisibility: (section: AppSection, visible: boolean) => void;
  setRouteCaloriesInNutrition: (enabled: boolean) => void;
  saveNutritionGoal: (input: Omit<NutritionGoalProfile, 'id' | 'recordedAt'>, id?: string) => void;
  deleteNutritionGoal: (id: string, confirmed: boolean) => void;
  saveNutritionEntry: (input: NutritionEntryInput, id?: string) => void;
  saveNutritionLogBatch: (batch: NutritionLogBatch) => void;
  deleteNutritionEntry: (id: string, confirmed: boolean) => void;
  saveNutritionFood: (input: SavedFoodInput, id?: string) => void;
  deleteNutritionFood: (id: string, confirmed: boolean) => void;
  saveNutritionSavedMeal: (input: SavedMealInput, id?: string) => void;
  deleteNutritionSavedMeal: (id: string, confirmed: boolean) => void;
  saveNutritionMealGroup: (group: NutritionMealGroup) => void;
  saveActivityRoute: (route: ActivityRoute) => Promise<void>;
  deleteActivityRoute: (id: string) => void;
  saveStepGoal: (date: string, count: number) => void;
  getBackupState: () => TrackerState;
  restoreBackupState: (backupState: TrackerState) => Promise<void>;
};

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function TrackerProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<TrackerState>(() => migrateStoredState(createFreshState()));
  const [hydrated, setHydrated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saving');
  const [writer] = useState(() => createLocalStateWriter(
    (snapshot) => AsyncStorage.setItem(STATE_STORAGE_KEY, snapshot),
    setSaveStatus,
  ));
  useEffect(() => {
    writer.setReporting(true);
    return () => { writer.setReporting(false); };
  }, [writer]);

  useEffect(() => {
    let active = true;
    readLocalState(() => AsyncStorage.getItem(STATE_STORAGE_KEY))
      .then(async (parsed) => {
        if (!active) return;
        if (parsed !== null) {
          const migrated = (parsed.lapseEvents ?? []).map((event): HistoricalEntry => ({
            id: `legacy-${event.id}`,
            trackerId: event.trackerId,
            eventDate: event.date,
            recordedAt: event.createdAt,
            outcome: 'lapse',
            note: event.note,
          }));
          const existing = parsed.historicalEntries ?? [];
          let migratedState = migrateStoredState({
            ...parsed,
            historicalEntries: [
              ...existing,
              ...migrated.filter((legacy) =>
                !existing.some((entry) =>
                  entry.trackerId === legacy.trackerId && entry.eventDate === legacy.eventDate)),
            ],
            lapseEvents: [],
          });
          // Older installations may have scheduled dose reminders. The wellness edition
          // preserves their records but must not continue issuing medical reminders.
          const medications = await Promise.all((migratedState.medications ?? []).map(async (medication) => {
            await cancelMedicationNotifications(medication.notificationIds).catch(() => undefined);
            return { ...medication, notificationIds: [] };
          }));
          migratedState = { ...migratedState, medications };
          const habits = await Promise.all(migratedState.trackers.map(async (tracker) => {
            if (!tracker.habitReminderTime || tracker.archived) return tracker;
            try {
              await cancelHabitReminder(tracker.habitNotificationId);
              return { ...tracker, habitNotificationId: await scheduleHabitReminder(tracker) };
            } catch { return { ...tracker, habitNotificationId: undefined }; }
          }));
          migratedState = { ...migratedState, trackers: habits };
          if (!active) return;
          setState(migratedState);
        } else {
          setState(migrateStoredState(createFreshState()));
        }
        setHydrated(true);
      })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (hydrated) void writer.save(JSON.stringify(state)).catch(() => undefined);
  }, [hydrated, state, writer]);

  const value = useMemo<TrackerContextValue>(() => ({
    ...state,
    hydrated,
    setOnboardingSelections: (selected) => setState((previous) => previous.onboardingStatus === 'pending'
      ? { ...previous, onboardingSelections: normalizeOnboardingSelections(selected) }
      : previous),
    finishOnboarding: async () => {
      if (state.onboardingStatus !== 'pending') return;
      const next = await persistCompletedOnboarding(state, writer.save);
      setState(next);
    },
    saveDashboard: (widgets) => setState((previous) => saveDashboardLayout(previous, previous.preferences ?? DEFAULT_PREFERENCES, widgets)),
    swapHabitOrder: (firstId, secondId) => setState((previous) => swapHabitOrder(previous, firstId, secondId)),
    saveStatus,
    retrySave: () => { void writer.retry().catch(() => undefined); },
    checkInToday: () => {
      const today = localDateKey();
      setState((previous) => previous.checkIns.includes(today)
        ? previous
        : { ...previous, checkIns: [...previous.checkIns, today] });
    },
    updateCurrent: (id, current) =>
      setState((previous) => ({
        ...previous,
        trackers: previous.trackers.map((tracker) =>
          tracker.id === id ? { ...tracker, current: Math.max(0, current) } : tracker),
      })),
    addLapse: (trackerId, date, note) =>
      setState((previous) => upsertHistoricalEntry(previous, {
        trackerId,
        eventDate: date,
        outcome: 'lapse',
        note,
      })),
    updateLapse: (event) =>
      setState((previous) => upsertHistoricalEntry(previous, {
        id: event.id,
        trackerId: event.trackerId,
        eventDate: event.eventDate,
        outcome: 'lapse',
        note: event.note,
      })),
    removeLapse: (eventId) =>
      setState((previous) => removeHistoricalEntry(previous, eventId)),
    saveHistoricalEntry: (entry) =>
      setState((previous) => upsertHistoricalEntry(previous, entry)),
    deleteHistoricalEntry: (entryId) =>
      setState((previous) => removeHistoricalEntry(previous, entryId)),
    changeStartDate: (id, date) =>
      setState((previous) => ({
        ...previous,
        trackers: previous.trackers.map((tracker) =>
          tracker.id === id ? { ...tracker, startedAt: `${date}T00:00:00` } : tracker),
      })),
    deleteHistory: (id, confirmed) =>
      setState((previous) => deleteTrackerHistory(previous, id, confirmed)),
    createCustomTracker: async (draft, id) => {
      const result = createTracker(state, draft, id);
      if (!result.tracker) return;
      let tracker = result.tracker;
      let reminderError: unknown;
      try { tracker = { ...tracker, habitNotificationId: await scheduleHabitReminder(tracker) }; }
      catch (error) { reminderError = error; tracker = { ...tracker, habitReminderTime: undefined }; }
      setState((previous) => migrateTaperState({ ...previous, trackers: [...previous.trackers, tracker] }));
      if (reminderError) throw reminderError;
    },
    editExistingTracker: async (id, draft) => {
      const current = state.trackers.find((tracker) => tracker.id === id);
      const result = editTracker(state, id, draft);
      if (!current || !result.tracker) return;
      let tracker = result.tracker;
      let reminderError: unknown;
      if (current.habitReminderTime !== tracker.habitReminderTime || (tracker.habitReminderTime && !current.habitNotificationId)) {
        tracker = { ...tracker, habitNotificationId: undefined };
        try { tracker = { ...tracker, habitNotificationId: await scheduleHabitReminder(tracker) }; }
        catch (error) { reminderError = error; tracker = { ...tracker, habitReminderTime: undefined, habitNotificationId: undefined }; }
        await cancelHabitReminder(current.habitNotificationId);
      }
      setState((previous) => ({ ...editTracker(previous, id, draft).state, trackers: previous.trackers.map((item) => item.id === id ? tracker : item) }));
      if (reminderError) throw reminderError;
    },
    logGoodHabit: (id) => setState((previous) => logHabitCompletion(previous, id, localDateKey())),
    saveWaterDrink: (log) => setState((previous) => saveWaterLog(previous, log)),
    deleteWaterDrink: (id) => setState((previous) => removeWaterLog(previous, id)),
    saveGoodHabitLog: (log) => setState((previous) => {
      const tracker = previous.trackers.find((item) => item.id === log.trackerId && item.habitTemplate && item.habitTemplate !== 'water' && !item.archived);
      if (!tracker || !validHabitLog(log) || (log.nutritionEntryId && tracker.habitTemplate !== 'produce')) return previous;
      return { ...previous, goodHabitLogs: [...(previous.goodHabitLogs ?? []).filter((item) => item.id !== log.id
        && !(log.checklistItemId && item.trackerId === log.trackerId && item.eventDate === log.eventDate && item.checklistItemId === log.checklistItemId)
        && !(log.nutritionEntryId && item.trackerId === log.trackerId && item.nutritionEntryId === log.nutritionEntryId)), log] };
    }),
    deleteGoodHabitLog: (id) => setState((previous) => ({ ...previous, goodHabitLogs: (previous.goodHabitLogs ?? []).filter((log) => log.id !== id) })),
    setArchived: (id, archived) => {
      const tracker = state.trackers.find((item) => item.id === id);
      if (archived) void cancelHabitReminder(tracker?.habitNotificationId);
      else if (tracker?.habitReminderTime) void scheduleHabitReminder({ ...tracker, archived: false }).then((habitNotificationId) => setState((previous) => ({ ...previous, trackers: previous.trackers.map((item) => item.id === id ? { ...item, habitNotificationId } : item) }))).catch(() => undefined);
      setState((previous) => setTrackerArchived(previous, id, archived));
    },
    deleteTracker: async (id, confirmed, confirmationText) => {
      const next = permanentlyDeleteTracker(state, id, confirmed, confirmationText);
      if (next === state) return false;
      const snapshot = JSON.stringify(next);
      try { await writer.save(snapshot); }
      catch (error) { writer.forgetFailedSnapshot(snapshot); throw error; }
      setState(next);
      await cancelHabitReminder(state.trackers.find((item) => item.id === id)?.habitNotificationId);
      return true;
    },
    addReductionStep: (trackerId, input, stepId) =>
      setState((previous) => addTaperStep(previous, trackerId, input, stepId).state),
    editReductionStep: (stepId, input) =>
      setState((previous) => editTaperStep(previous, stepId, input).state),
    insertHistoricalReductionStep: (trackerId, input, stepId) =>
      setState((previous) => insertHistoricalTaperStep(previous, trackerId, input, stepId).state),
    deleteReductionStep: (stepId, confirmed) =>
      setState((previous) => deleteTaperStep(previous, stepId, confirmed).state),
    importWeightHistory: (file) => {
      const result = mergeWeightImport(state.weightEntries ?? [], file);
      setState((previous) => ({ ...previous, weightEntries: mergeWeightImport(previous.weightEntries ?? [], file).entries }));
      return { added: result.added, duplicates: result.duplicates };
    },
    saveWeightEntry: (entry) => setState((previous) => ({ ...previous, weightEntries: upsertWeightEntry(previous.weightEntries ?? [], entry) })),
    saveWeightTdeeProfile: (profile) => setState((previous) => ({ ...previous, weightTdeeProfile: profile })),
    deleteWeightEntry: (date, confirmed) => {
      if (confirmed) setState((previous) => ({ ...previous, weightEntries: (previous.weightEntries ?? []).filter((entry) => entry.date !== date) }));
    },
    setSectionVisibility: (section, visible) => setState((previous) => setSectionVisible(previous, section, visible)),
    setRouteCaloriesInNutrition: (enabled) => setState((previous) => setRouteCaloriesInNutrition(previous, enabled)),
    saveNutritionGoal: (input, id) => setState((previous) => ({ ...previous, nutritionGoals: upsertNutritionGoal(previous.nutritionGoals ?? [], input, id) })),
    deleteNutritionGoal: (id, confirmed) => setState((previous) => ({ ...previous, nutritionGoals: removeNutritionGoal(previous.nutritionGoals ?? [], id, confirmed) })),
    saveNutritionEntry: (input, id) => setState((previous) => ({ ...previous, nutritionEntries: upsertNutritionEntry(previous.nutritionEntries ?? [], input, id) })),
    saveNutritionLogBatch: (batch) => {
      const prepared = prepareNutritionLogBatch(batch);
      setState((previous) => applyNutritionLogBatch(previous, prepared));
    },
    deleteNutritionEntry: (id, confirmed) => setState((previous) => ({ ...previous, nutritionEntries: removeNutritionEntry(previous.nutritionEntries ?? [], id, confirmed) })),
    saveNutritionFood: (input, id) => setState((previous) => ({ ...previous, savedFoods: upsertSavedFood(previous.savedFoods ?? [], input, id) })),
    deleteNutritionFood: (id, confirmed) => setState((previous) => ({ ...previous, savedFoods: removeSavedFood(previous.savedFoods ?? [], id, confirmed) })),
    saveNutritionSavedMeal: (input, id) => {
      const prepared = prepareSavedMeal(input, input.id ?? id);
      setState((previous) => ({ ...previous, savedMeals: applyPreparedSavedMeal(previous.savedMeals ?? [], prepared) }));
    },
    deleteNutritionSavedMeal: (id, confirmed) => setState((previous) => ({ ...previous, savedMeals: removeSavedMeal(previous.savedMeals ?? [], id, confirmed) })),
    saveNutritionMealGroup: (group) => setState((previous) => ({ ...previous, nutritionMealGroups: upsertMealGroup(previous.nutritionMealGroups ?? [], group) })),
    saveActivityRoute: async (route) => {
      const next = { ...state, activityRoutes: [...(state.activityRoutes ?? []).filter((item) => item.id !== route.id), route] };
      await writer.save(JSON.stringify(next));
      setState(next);
    },
    deleteActivityRoute: (id) => setState((previous) => ({ ...previous, activityRoutes: (previous.activityRoutes ?? []).filter((route) => route.id !== id) })),
    saveStepGoal: (date, count) => setState((previous) => ({ ...previous, stepGoals: setDailyStepGoal(previous.stepGoals ?? [], date, count) })),
    getBackupState: () => JSON.parse(JSON.stringify(state)) as TrackerState,
    restoreBackupState: async (backupState) => {
      for (const tracker of state.trackers) await cancelHabitReminder(tracker.habitNotificationId);
      for (const medication of state.medications ?? []) {
        await cancelMedicationNotifications(medication.notificationIds);
      }
      const migrated = migrateStoredState(backupState);
      for (const medication of migrated.medications ?? []) {
        await cancelMedicationNotifications(medication.notificationIds).catch(() => undefined);
      }
      const medications = (migrated.medications ?? []).map((medication) => ({ ...medication, notificationIds: [] }));
      const trackers = await Promise.all(migrated.trackers.map(async (tracker) => {
        try { return { ...tracker, habitNotificationId: await scheduleHabitReminder({ ...tracker, habitNotificationId: undefined }) }; }
        catch { return { ...tracker, habitNotificationId: undefined }; }
      }));
      const restored = { ...migrated, trackers, medications };
      await restoreStepHistory(restored.stepHistory ?? []);
      setState(restored);
      try {
        await writer.save(JSON.stringify(restored));
      } catch {
        throw new Error('The imported history is open in memory but could not be saved on this device. Keep Reclaim open and use Retry save.');
      }
    },
  }), [hydrated, state, saveStatus, writer]);

  return <TrackerContext.Provider value={value}>{hydrated ? needsOnboarding(state)
    ? <OnboardingScreen selected={normalizeOnboardingSelections(state.onboardingSelections)} onChange={value.setOnboardingSelections} onFinish={value.finishOnboarding} />
    : children : !loadFailed ? <BrandedLoading /> :
    <SafeAreaView style={storageStyles.loading}>
        <Text style={storageStyles.title}>Could not open local history</Text>
        <Text style={storageStyles.text}>Your stored data has not been replaced. Retry loading to continue safely.</Text>
        <Pressable accessibilityRole="button" onPress={() => { setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); }} style={storageStyles.button}><Text style={storageStyles.title}>Retry loading</Text></Pressable>
    </SafeAreaView>
  }</TrackerContext.Provider>;
}

const storageStyles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', padding: 28, gap: 16, backgroundColor: colors.background },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  text: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  button: { padding: 16, borderRadius: 16, backgroundColor: colors.surfaceRaised },
});

function migrateStoredState(parsed: TrackerState): TrackerState {
  // Keep older medical records untouched for future full-edition restores.
  return migratePreferences(migrateNutritionState(migrateTaperState(parsed)));
}

export function useTrackers() {
  const context = useContext(TrackerContext);
  if (!context) throw new Error('useTrackers must be used inside TrackerProvider');
  return context;
}

export function findTracker(trackers: Tracker[], id?: string) {
  return trackers.find((tracker) => tracker.id === id);
}
