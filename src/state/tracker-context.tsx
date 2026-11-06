import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text } from 'react-native';
import { BrandedLoading } from '@/components/branded-loading';
import { OnboardingScreen } from '@/components/onboarding-screen';
import { removeSavedTrail, saveTrail, SavedTrail, toggleFavoriteTrail, TrailResult } from '@/lib/trails';
import { updateQuitWidget } from '@/widgets/update-widget';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLocalStateWriter, readLocalState, SaveStatus, STATE_STORAGE_KEY } from '@/lib/local-storage';
import { colors, font } from '@/theme';

import { ActivityRoute, ActualOneRepMax, AppSection, CustomNutrient, DashboardWidget, GoodHabitLog, HistoricalEntry, NavigationSection, NutrientSelection, NutritionGoalProfile, NutritionMealGroup, OnboardingArea, StrengthExercise, SupplementStack, Tracker, TrackerId, TrackerState, WaterLog, WeightEntry, WeightTdeeProfile, WorkoutRoutine, WorkoutSession, WorkoutSettings, CravingEvent, SavingsGoal } from '@/models/tracker';
import { validateNutrientSelection } from '@/lib/nutrient-totals';
import { markSupplementDoseSkipped, recordSupplementDose, saveSupplementDraft, SupplementDraft } from '@/lib/supplements';
import { upsertSupplementStack, validateSupplementStack } from '@/lib/medication-regimen';
import { beginWorkoutState, DEFAULT_WORKOUT_SETTINGS, finishWorkout } from '@/lib/workouts';
import { createFreshState, needsOnboarding, pickedAreas, OnboardingSetupDraft, persistCompletedOnboarding, shouldEnableFirstStepTracking } from '@/lib/onboarding';
import { readTodaySteps } from '@/lib/activity-steps';
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
import { DEFAULT_PREFERENCES, migratePreferences, setBadgesOnHome, setHomeGoalColors, setHomeHabitVisible, setNavigationOrder, setQuittingTaperingOnHome, setRouteCaloriesInNutrition, setSectionVisible, setTrainingOverviewOnHome } from '@/lib/preferences';
import { restoreStepHistory, setDailyStepGoal } from '@/lib/activity-step-history';
import { swapHabitOrder } from '@/lib/habit-order';
import { cancelMedicationNotifications } from '@/lib/medication-notifications';
import { cancelHabitReminder, scheduleHabitReminder } from '@/lib/habit-notifications';
import { logHabitCompletion } from '@/lib/habit-log';
import { removeWaterLog, renameDefaultWaterHabit, saveWaterLog } from '@/lib/water-habit';
import { validHabitLog } from '@/lib/good-habit-templates';
import { applyMealBuilderSave, applyMealGroupEdit, applyNutritionLogBatch, replaceLoggedMeal, applyPreparedSavedMeal, migrateNutritionState, NutritionEntryInput, NutritionLogBatch, prepareNutritionLogBatch, prepareSavedMeal, removeMealGroup, removeNutritionEntry, removeNutritionGoal, removeSavedFood, removeSavedMeal, SavedFoodInput, SavedMealInput, upsertNutritionEntry, upsertNutritionGoal, upsertSavedFood } from '@/lib/nutrition';
import { renameFood } from '@/lib/food-search';

type TrackerContextValue = TrackerState & {
  hydrated: boolean;
  setOnboardingSelections: (selected: OnboardingArea[] | ((previous: OnboardingArea[]) => OnboardingArea[])) => void;
  setOnboardingSetupDraft: (draft: OnboardingSetupDraft | ((previous: OnboardingSetupDraft) => OnboardingSetupDraft)) => void;
  finishOnboarding: () => Promise<void>;
  saveDashboard: (widgets: DashboardWidget[]) => void;
  setHomeHabitVisible: (id: string, visible: boolean) => void;
  setHomeGoalColors: (colors: Record<string, string>) => void;
  setQuittingTaperingOnHome: (visible: boolean) => void;
  setTrainingOverviewOnHome: (visible: boolean) => void;
  setBadgesOnHome: (visible: boolean) => void;
  markBadgesSeen: (keys: string[]) => void;
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
  setWaterShortcuts: (id: TrackerId, shortcuts: Pick<Tracker, 'waterQuickAddOz' | 'waterPresetOz'>) => void;
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
  setNavigationOrder: (order: NavigationSection[]) => void;
  setRouteCaloriesInNutrition: (enabled: boolean) => void;
  saveNutritionGoal: (input: Omit<NutritionGoalProfile, 'id' | 'recordedAt'>, id?: string) => void;
  dismissMacroUpdate: (weightLb: number) => void;
  saveNutrientSelection: (selection: NutrientSelection) => void;
  removeNutrientSelection: (id: string) => void;
  saveCustomNutrient: (nutrient: CustomNutrient) => void;
  setSupplementNutrientsInNutrition: (enabled: boolean) => void;
  deleteNutritionGoal: (id: string, confirmed: boolean) => void;
  saveNutritionEntry: (input: NutritionEntryInput, id?: string) => void;
  saveNutritionLogBatch: (batch: NutritionLogBatch) => void;
  deleteNutritionEntry: (id: string, confirmed: boolean) => void;
  saveNutritionFood: (input: SavedFoodInput, id?: string) => void;
  renameLoggedFood: (food: { foodId?: string; name: string; servingLabel: string }, name: string) => void;
  deleteNutritionFood: (id: string, confirmed: boolean) => void;
  saveNutritionSavedMeal: (input: SavedMealInput, id?: string) => void;
  saveNutritionMealBuilder: (meal: SavedMealInput, batch?: NutritionLogBatch, standaloneFoods?: SavedFoodInput[]) => void;
  replaceNutritionLoggedMeal: (instanceId: string, batch: NutritionLogBatch) => void;
  deleteNutritionSavedMeal: (id: string, confirmed: boolean) => void;
  saveNutritionMealGroup: (group: NutritionMealGroup) => void;
  deleteNutritionMealGroup: (id: string) => void;
  saveActivityRoute: (route: ActivityRoute) => Promise<void>;
  deleteActivityRoute: (id: string) => void;
  saveStepGoal: (date: string, count: number) => void;
  saveStrengthExercise: (exercise: StrengthExercise) => void;
  saveWorkoutRoutine: (routine: WorkoutRoutine) => void;
  deleteWorkoutRoutine: (id: string) => void;
  beginWorkout: (name: string, routine?: WorkoutRoutine) => void;
  updateActiveWorkout: (update: (session: WorkoutSession) => WorkoutSession) => void;
  completeWorkout: () => void;
  discardWorkout: () => void;
  editWorkoutHistory: (session: WorkoutSession) => void;
  deleteWorkoutHistory: (id: string) => void;
  saveActualOneRepMax: (record: ActualOneRepMax) => void;
  deleteActualOneRepMax: (id: string) => void;
  logCraving: (craving: CravingEvent) => void;
  deleteCraving: (id: string) => void;
  saveSavingsGoal: (goal: SavingsGoal) => void;
  deleteSavingsGoal: (id: string) => void;
  saveTrailPlace: (trail: TrailResult) => void;
  toggleFavoriteTrailPlace: (trail: TrailResult | SavedTrail) => void;
  removeTrailPlace: (id: string) => void;
  setFeaturedTracker: (trackerId: string | undefined) => void;
  markSwipeHintSeen: () => void;
  updateStartHere: (update: { done?: string[]; collapsed?: boolean; dismissed?: boolean }) => void;
  dismissNotice: (id: string) => void;
  updateWorkoutSettings: (update: Partial<WorkoutSettings>) => void;
  setWorkoutCaloriesInNutrition: (enabled: boolean) => void;
  saveSupplement: (draft: SupplementDraft, id: string) => void;
  archiveSupplement: (id: string, archived: boolean) => void;
  logSupplement: (id: string, eventId: string, outcome?: 'taken' | 'skipped', scheduledFor?: string, unitsTaken?: number) => void;
  deleteSupplementLog: (id: string) => void;
  markSupplementLogSkipped: (id: string) => void;
  saveSupplementStack: (stack: SupplementStack) => string | undefined;
  deleteSupplementStack: (id: string) => void;
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
          for (const tracker of parsed.trackers) if (tracker.habitTemplate === 'exercise') await cancelHabitReminder(tracker.habitNotificationId);
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

  // Keep the home-screen widget in step, without redrawing it on every keystroke.
  useEffect(() => {
    if (!hydrated || state.onboardingStatus === 'pending') return;
    const timer = setTimeout(() => updateQuitWidget(state), 1500);
    return () => clearTimeout(timer);
  }, [hydrated, state]);

  // Steps change without changing saved state, so also refresh the widget whenever the app is left.
  const widgetState = useRef(state);
  useEffect(() => { widgetState.current = state; }, [state]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => { if (status === 'background' && widgetState.current.onboardingStatus !== 'pending') updateQuitWidget(widgetState.current); });
    return () => subscription.remove();
  }, []);

  const value = useMemo<TrackerContextValue>(() => ({
    ...state,
    hydrated,
    setOnboardingSelections: (selected) => setState((previous) => previous.onboardingStatus === 'pending'
      ? { ...previous, onboardingSelections: pickedAreas(typeof selected === 'function' ? selected(pickedAreas(previous.onboardingSelections)) : selected) }
      : previous),
    setOnboardingSetupDraft: (draft) => setState((previous) => previous.onboardingStatus === 'pending'
      ? { ...previous, onboardingSetupDraft: typeof draft === 'function' ? draft(previous.onboardingSetupDraft ?? {}) : draft }
      : previous),
    finishOnboarding: async () => {
      if (state.onboardingStatus !== 'pending') return;
      const next = await persistCompletedOnboarding(state, writer.save);
      setState(next);
      if (shouldEnableFirstStepTracking(state)) {
        const result = await readTodaySteps(true);
        if (result.status !== 'available') Alert.alert('Step tracking not enabled', `${result.message ?? 'This phone could not start step counting.'} You can try again from Activity; your daily goal was saved.`);
      }
    },
    saveDashboard: (widgets) => setState((previous) => saveDashboardLayout(previous, previous.preferences ?? DEFAULT_PREFERENCES, widgets)),
    setHomeHabitVisible: (id, visible) => setState((previous) => setHomeHabitVisible(previous, id, visible)),
    setHomeGoalColors: (selected) => setState((previous) => setHomeGoalColors(previous, selected)),
    setQuittingTaperingOnHome: (visible) => setState((previous) => setQuittingTaperingOnHome(previous, visible)),
    setTrainingOverviewOnHome: (visible) => setState((previous) => setTrainingOverviewOnHome(previous, visible)),
    setBadgesOnHome: (visible) => setState((previous) => setBadgesOnHome(previous, visible)),
    markBadgesSeen: (keys) => setState((previous) => {
      const preferences = previous.preferences ?? DEFAULT_PREFERENCES;
      const current = preferences.seenBadges;
      const added = keys.filter((key) => !current?.includes(key));
      return current && !added.length ? previous : { ...previous, preferences: { ...preferences, seenBadges: [...(current ?? []), ...added] } };
    }),
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
      if (draft.habitTemplate === 'exercise') throw new Error('Exercise habit goals are archived. Use Workouts for new strength sessions.');
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
      if (current?.habitTemplate === 'exercise') throw new Error('Legacy Exercise habit goals are read-only.');
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
    setWaterShortcuts: (id, shortcuts) => setState((previous) => ({ ...previous, trackers: previous.trackers.map((tracker) => tracker.id === id ? { ...tracker, ...shortcuts } : tracker) })),
    deleteWaterDrink: (id) => setState((previous) => removeWaterLog(previous, id)),
    saveGoodHabitLog: (log) => setState((previous) => {
      const tracker = previous.trackers.find((item) => item.id === log.trackerId && item.habitTemplate && item.habitTemplate !== 'water' && !item.archived);
      if (!tracker || tracker.habitTemplate === 'exercise' || !validHabitLog(log) || (log.nutritionEntryId && tracker.habitTemplate !== 'produce')) return previous;
      return { ...previous, goodHabitLogs: [...(previous.goodHabitLogs ?? []).filter((item) => item.id !== log.id
        && !(log.checklistItemId && item.trackerId === log.trackerId && item.eventDate === log.eventDate && item.checklistItemId === log.checklistItemId)
        && !(log.nutritionEntryId && item.trackerId === log.trackerId && item.nutritionEntryId === log.nutritionEntryId)), log] };
    }),
    deleteGoodHabitLog: (id) => setState((previous) => ({ ...previous, goodHabitLogs: (previous.goodHabitLogs ?? []).filter((log) => log.id !== id) })),
    setArchived: (id, archived) => {
      const tracker = state.trackers.find((item) => item.id === id);
      if (tracker?.habitTemplate === 'exercise' && !archived) return;
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
    setNavigationOrder: (order) => setState((previous) => setNavigationOrder(previous, order)),
    setRouteCaloriesInNutrition: (enabled) => setState((previous) => setRouteCaloriesInNutrition(previous, enabled)),
    saveNutritionGoal: (input, id) => setState((previous) => {
      const selections = previous.nutrientSelections ?? [];
      const fiber = selections.find((item) => item.nutrientId === 'fiber');
      return { ...previous, nutritionGoals: upsertNutritionGoal(previous.nutritionGoals ?? [], input, id),
        macroUpdateDismissedWeightLb: undefined,
        nutrientSelections: input.fiberGrams > 0 && !fiber ? [...selections, { nutrientId: 'fiber', state: 'goal' as const, goalType: 'minimum' as const, goalAmount: input.fiberGrams, order: selections.length, legacyFiberGoal: true }] : selections };
    }),
    dismissMacroUpdate: (weightLb) => setState((previous) => ({ ...previous, macroUpdateDismissedWeightLb: weightLb })),
    saveNutrientSelection: (selection) => setState((previous) => {
      validateNutrientSelection(selection, previous);
      const current = previous.nutrientSelections ?? [];
      const existing = current.find((item) => item.nutrientId === selection.nutrientId);
      const order = existing && existing.state !== selection.state
        ? Math.max(-1, ...current.filter((item) => item.state === selection.state).map((item) => item.order)) + 1
        : selection.order;
      return { ...previous, nutrientSelections: [...current.filter((item) => item.nutrientId !== selection.nutrientId), { ...selection, order }] };
    }),
    removeNutrientSelection: (id) => setState((previous) => ({ ...previous, nutrientSelections: (previous.nutrientSelections ?? []).filter((item) => item.nutrientId !== id) })),
    saveCustomNutrient: (nutrient) => setState((previous) => ({ ...previous, customNutrients: [...(previous.customNutrients ?? []).filter((item) => item.id !== nutrient.id), nutrient] })),
    setSupplementNutrientsInNutrition: (enabled) => setState((previous) => ({ ...previous, preferences: { ...(previous.preferences ?? DEFAULT_PREFERENCES), includeSupplementNutrientsInNutrition: enabled } })),
    deleteNutritionGoal: (id, confirmed) => setState((previous) => ({ ...previous, nutritionGoals: removeNutritionGoal(previous.nutritionGoals ?? [], id, confirmed) })),
    saveNutritionEntry: (input, id) => setState((previous) => ({ ...previous, nutritionEntries: upsertNutritionEntry(previous.nutritionEntries ?? [], input, id) })),
    saveNutritionLogBatch: (batch) => {
      const prepared = prepareNutritionLogBatch(batch);
      setState((previous) => applyNutritionLogBatch(previous, prepared));
    },
    replaceNutritionLoggedMeal: (instanceId, batch) => {
      const prepared = prepareNutritionLogBatch(batch);
      setState((previous) => replaceLoggedMeal(previous, instanceId, prepared));
    },
    deleteNutritionEntry: (id, confirmed) => setState((previous) => ({ ...previous, nutritionEntries: removeNutritionEntry(previous.nutritionEntries ?? [], id, confirmed) })),
    renameLoggedFood: (food, name) => setState((previous) => renameFood(previous, food, name)),
    saveNutritionFood: (input, id) => setState((previous) => ({ ...previous, savedFoods: upsertSavedFood(previous.savedFoods ?? [], input, id) })),
    deleteNutritionFood: (id, confirmed) => setState((previous) => ({ ...previous, savedFoods: removeSavedFood(previous.savedFoods ?? [], id, confirmed) })),
    saveNutritionSavedMeal: (input, id) => {
      const prepared = prepareSavedMeal(input, input.id ?? id);
      setState((previous) => ({ ...previous, savedMeals: applyPreparedSavedMeal(previous.savedMeals ?? [], prepared) }));
    },
    saveNutritionMealBuilder: (meal, batch, standaloneFoods) => {
      const preparedMeal = prepareSavedMeal(meal, meal.id);
      const preparedBatch = batch ? prepareNutritionLogBatch(batch) : undefined;
      const preparedFoods = (standaloneFoods ?? []).map((food) => upsertSavedFood([], food, food.id)[0]);
      if (new Set(preparedFoods.map((food) => food.id)).size !== preparedFoods.length) throw new Error('A saved food appears twice in this meal.');
      setState((previous) => applyMealBuilderSave(previous, preparedMeal, preparedBatch, preparedFoods));
    },
    deleteNutritionSavedMeal: (id, confirmed) => setState((previous) => ({ ...previous, savedMeals: removeSavedMeal(previous.savedMeals ?? [], id, confirmed) })),
    saveNutritionMealGroup: (group) => setState((previous) => applyMealGroupEdit(previous, group)),
    deleteNutritionMealGroup: (id) => setState((previous) => removeMealGroup(previous, id)),
    saveActivityRoute: async (route) => {
      const next = { ...state, activityRoutes: [...(state.activityRoutes ?? []).filter((item) => item.id !== route.id), route] };
      await writer.save(JSON.stringify(next));
      setState(next);
    },
    deleteActivityRoute: (id) => setState((previous) => ({ ...previous, activityRoutes: (previous.activityRoutes ?? []).filter((route) => route.id !== id) })),
    saveStepGoal: (date, count) => setState((previous) => ({ ...previous, stepGoals: setDailyStepGoal(previous.stepGoals ?? [], date, count) })),
    saveStrengthExercise: (exercise) => setState((previous) => ({ ...previous, strengthExercises: [...(previous.strengthExercises ?? []).filter((item) => item.id !== exercise.id), exercise] })),
    saveWorkoutRoutine: (routine) => setState((previous) => ({ ...previous, workoutRoutines: [...(previous.workoutRoutines ?? []).filter((item) => item.id !== routine.id), routine] })),
    deleteWorkoutRoutine: (id) => setState((previous) => ({ ...previous, workoutRoutines: (previous.workoutRoutines ?? []).filter((item) => item.id !== id) })),
    beginWorkout: (name, routine) => setState((previous) => beginWorkoutState(previous, name, routine)),
    updateActiveWorkout: (update) => setState((previous) => previous.activeWorkout ? { ...previous, activeWorkout: update(previous.activeWorkout) } : previous),
    completeWorkout: () => setState((previous) => finishWorkout(previous)),
    discardWorkout: () => setState((previous) => ({ ...previous, activeWorkout: undefined })),
    editWorkoutHistory: (session) => setState((previous) => ({ ...previous, workoutSessions: (previous.workoutSessions ?? []).map((item) => item.id === session.id ? session : item) })),
    deleteWorkoutHistory: (id) => setState((previous) => ({ ...previous, workoutSessions: (previous.workoutSessions ?? []).filter((item) => item.id !== id) })),
    saveActualOneRepMax: (record) => setState((previous) => ({ ...previous, actualOneRepMaxes: [...(previous.actualOneRepMaxes ?? []).filter((item) => item.id !== record.id), record] })),
    deleteActualOneRepMax: (id) => setState((previous) => ({ ...previous, actualOneRepMaxes: (previous.actualOneRepMaxes ?? []).filter((item) => item.id !== id) })),
    logCraving: (craving) => setState((previous) => ({ ...previous, cravings: [...(previous.cravings ?? []).filter((item) => item.id !== craving.id), craving] })),
    deleteCraving: (id) => setState((previous) => ({ ...previous, cravings: (previous.cravings ?? []).filter((item) => item.id !== id) })),
    saveSavingsGoal: (goal) => setState((previous) => ({ ...previous, savingsGoals: [...(previous.savingsGoals ?? []).filter((item) => item.id !== goal.id), goal] })),
    deleteSavingsGoal: (id) => setState((previous) => ({ ...previous, savingsGoals: (previous.savingsGoals ?? []).filter((item) => item.id !== id) })),
    saveTrailPlace: (trail) => setState((previous) => ({ ...previous, savedTrails: saveTrail(previous.savedTrails ?? [], trail) })),
    toggleFavoriteTrailPlace: (trail) => setState((previous) => ({ ...previous, savedTrails: toggleFavoriteTrail(previous.savedTrails ?? [], trail) })),
    removeTrailPlace: (id) => setState((previous) => ({ ...previous, savedTrails: removeSavedTrail(previous.savedTrails ?? [], id) })),
    setFeaturedTracker: (trackerId) => setState((previous) => ({ ...previous, preferences: { ...(previous.preferences ?? DEFAULT_PREFERENCES), featuredTrackerId: trackerId } })),
    dismissNotice: (id) => setState((previous) => { const preferences = previous.preferences ?? DEFAULT_PREFERENCES; const current = preferences.dismissedNotices ?? []; return current.includes(id) ? previous : { ...previous, preferences: { ...preferences, dismissedNotices: [...current, id].slice(-100) } }; }),
    updateStartHere: ({ done, collapsed, dismissed }) => setState((previous) => {
      const preferences = previous.preferences ?? DEFAULT_PREFERENCES;
      const current = preferences.startHere ?? {};
      const nextDone = done ? [...new Set([...(current.done ?? []), ...done])] : current.done;
      if ((nextDone?.length ?? 0) === (current.done?.length ?? 0) && (collapsed === undefined || collapsed === !!current.collapsed) && (dismissed === undefined || dismissed === !!current.dismissed)) return previous;
      return { ...previous, preferences: { ...preferences, startHere: { ...current, done: nextDone, ...(collapsed === undefined ? {} : { collapsed }), ...(dismissed === undefined ? {} : { dismissed }) } } };
    }),
    markSwipeHintSeen: () => setState((previous) => ({ ...previous, preferences: { ...(previous.preferences ?? DEFAULT_PREFERENCES), swipeHintSeen: true } })),
    updateWorkoutSettings: (update) => setState((previous) => ({ ...previous, workoutSettings: { ...DEFAULT_WORKOUT_SETTINGS, ...previous.workoutSettings, ...update } })),
    setWorkoutCaloriesInNutrition: (enabled) => setState((previous) => ({ ...previous, preferences: { ...(previous.preferences ?? DEFAULT_PREFERENCES), includeWorkoutCaloriesInNutrition: enabled } })),
    saveSupplement: (draft, id) => setState((previous) => ({ ...previous, medications: saveSupplementDraft(previous.medications ?? [], draft, id) })),
    archiveSupplement: (id, archived) => setState((previous) => ({ ...previous, medications: (previous.medications ?? []).map((item) => item.id === id && item.kind === 'supplement' ? { ...item, archived } : item) })),
    logSupplement: (id, eventId, outcome = 'taken', scheduledFor, unitsTaken) => setState((previous) => {
      const item = (previous.medications ?? []).find((entry) => entry.id === id && entry.kind === 'supplement');
      return item ? { ...previous, medicationEvents: recordSupplementDose(previous.medicationEvents ?? [], item, eventId, outcome, scheduledFor, new Date(), unitsTaken, previous.customNutrients ?? []) } : previous;
    }),
    deleteSupplementLog: (id) => setState((previous) => {
      const supplementIds = new Set((previous.medications ?? []).filter((item) => item.kind === 'supplement').map((item) => item.id));
      return { ...previous, medicationEvents: (previous.medicationEvents ?? []).filter((event) => event.id !== id || !supplementIds.has(event.medicationId)) };
    }),
    markSupplementLogSkipped: (id) => setState((previous) => {
      const supplementIds = new Set((previous.medications ?? []).filter((item) => item.kind === 'supplement').map((item) => item.id));
      return { ...previous, medicationEvents: markSupplementDoseSkipped(previous.medicationEvents ?? [], supplementIds, id) };
    }),
    saveSupplementStack: (stack) => {
      const problem = validateSupplementStack(stack, state.supplementStacks ?? [], state.medications ?? []);
      if (!problem) setState((previous) => ({ ...previous, supplementStacks: upsertSupplementStack(previous.supplementStacks ?? [], stack) }));
      return problem;
    },
    deleteSupplementStack: (id) => setState((previous) => ({ ...previous, supplementStacks: (previous.supplementStacks ?? []).filter((stack) => stack.id !== id) })),
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
    ? <OnboardingScreen selected={pickedAreas(state.onboardingSelections)} draft={state.onboardingSetupDraft ?? {}} onChange={value.setOnboardingSelections} onDraftChange={value.setOnboardingSetupDraft} onFinish={value.finishOnboarding} />
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
  title: { color: colors.text, fontFamily: font.bold, fontSize: 16 },
  text: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, lineHeight: 21 },
  button: { padding: 16, borderRadius: 16, backgroundColor: colors.surfaceRaised },
});

function migrateStoredState(parsed: TrackerState): TrackerState {
  // Keep older medical records untouched for future full-edition restores.
  const migrated = migratePreferences(renameDefaultWaterHabit(migrateNutritionState(migrateTaperState(parsed))));
  return { ...migrated, trackers: migrated.trackers.map((item) => item.habitTemplate === 'exercise' ? { ...item, archived: true, habitReminderTime: undefined, habitNotificationId: undefined } : item) };
}

export function useTrackers() {
  const context = useContext(TrackerContext);
  if (!context) throw new Error('useTrackers must be used inside TrackerProvider');
  return context;
}

export function findTracker(trackers: Tracker[], id?: string) {
  return trackers.find((tracker) => tracker.id === id);
}
