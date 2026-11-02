import { FrequencyPeriod, Tracker, TrackerId, TrackerMode, TrackerState } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';
import { reconcileSavingsExpenses, SavingsExpenseDraft, validateSavingsDrafts } from '@/lib/habit-savings';
import { parseClockTime } from '@/lib/clock-time';
import { checklistOn, exerciseModeOn, exerciseRegimenOn, goalOn, templateConfig } from '@/lib/good-habit-templates';

export type TrackerDraft = {
  name: string;
  displayName?: string;
  mode: TrackerMode;
  startDate: string;
  startTime?: string;
  startPeriod?: 'AM' | 'PM';
  icon: string;
  color: string;
  unit?: string;
  baseline?: string;
  current?: string;
  target?: string;
  frequencyCount?: string;
  frequencyPeriod?: FrequencyPeriod;
  habitLogStyle?: 'done' | 'count';
  habitTemplate?: Tracker['habitTemplate'];
  habitGoalValue?: string;
  mindfulnessVisualMode?: 'breathing' | 'quiet';
  exerciseGoalMode?: 'times' | 'minutes';
  exerciseRegimenRows?: { id: string; label: string; days: number[] }[];
  producePresets?: number[];
  habitChecklistItems?: { id: string; label: string }[];
  waterGoalOz?: string;
  waterQuickAddOz?: string;
  waterDisplayUnit?: 'fl oz' | 'mL';
  waterPresetOz?: number[];
  habitReminderTime?: string;
  notes?: string;
  savingsExpenses?: SavingsExpenseDraft[];
};

export type TrackerValidation = Partial<Record<keyof TrackerDraft, string>>;

export function validateTrackerDraft(draft: TrackerDraft): TrackerValidation {
  const errors: TrackerValidation = {};
  if (!draft.name.trim()) errors.name = 'Tracker name is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) errors.startDate = 'Use YYYY-MM-DD.';
  const timePattern = draft.startPeriod ? /^(0?[1-9]|1[0-2]):[0-5]\d$/ : /^([01]\d|2[0-3]):[0-5]\d$/;
  if (draft.startTime && !timePattern.test(draft.startTime)) {
    errors.startTime = draft.startPeriod ? 'Use a time like 8:30.' : 'Use HH:MM.';
  }
  if (!draft.icon) errors.icon = 'Choose an icon.';
  if (!draft.color) errors.color = 'Choose a color.';

  if (draft.mode === 'reduction') {
    if (!draft.unit?.trim()) errors.unit = 'Measurement unit is required.';
    if (!isNonNegativeNumber(draft.baseline)) errors.baseline = 'Enter a valid baseline.';
    if (!isNonNegativeNumber(draft.current)) errors.current = 'Enter a valid current amount.';
    if (draft.target && !isNonNegativeNumber(draft.target)) errors.target = 'Enter a valid target.';
  }
  if (draft.mode === 'habit') {
    if (draft.habitTemplate === 'water') {
      if (!positiveOunces(draft.waterGoalOz)) errors.waterGoalOz = 'Enter a daily goal greater than zero.';
      if (!positiveOunces(draft.waterQuickAddOz)) errors.waterQuickAddOz = 'Enter a serving greater than zero.';
      if (draft.waterDisplayUnit && !['fl oz', 'mL'].includes(draft.waterDisplayUnit)) errors.waterDisplayUnit = 'Choose fl oz or mL.';
      if (draft.waterPresetOz?.some((amount) => !Number.isFinite(amount) || amount <= 0 || amount > 1000) || (draft.waterPresetOz?.length ?? 0) > 8) errors.waterPresetOz = 'Use up to eight valid drink shortcuts.';
    } else if (draft.habitTemplate && templateConfig(draft.habitTemplate)) {
      const config = templateConfig(draft.habitTemplate)!;
      if (config.checklist) {
        if (!draft.habitChecklistItems?.length || draft.habitChecklistItems.some((item) => !item.id || !item.label.trim())) errors.habitChecklistItems = 'Add at least one named checklist step.';
      } else if (!Number.isFinite(Number(draft.habitGoalValue)) || Number(draft.habitGoalValue) <= 0 || Number(draft.habitGoalValue) > 10000) errors.habitGoalValue = 'Choose a goal greater than zero.';
      if (draft.habitTemplate === 'exercise') {
        if (draft.exerciseGoalMode && !['times', 'minutes'].includes(draft.exerciseGoalMode)) errors.exerciseGoalMode = 'Choose Times or Minutes.';
        if ((draft.exerciseGoalMode ?? 'times') === 'times' && !Number.isInteger(Number(draft.habitGoalValue))) errors.habitGoalValue = 'Enter a whole number of workouts.';
        if (draft.exerciseRegimenRows && (draft.exerciseRegimenRows.length > 20 || new Set(draft.exerciseRegimenRows.map((row) => row.id)).size !== draft.exerciseRegimenRows.length || draft.exerciseRegimenRows.some((row) => !row.id || !row.label.trim() || row.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)))) errors.exerciseRegimenRows = 'Use up to 20 uniquely named regimen rows with valid days.';
      }
      if (draft.habitTemplate === 'produce' && draft.producePresets && (draft.producePresets.length > 8 || draft.producePresets.some((value) => !Number.isFinite(value) || value <= 0 || value > 20))) errors.producePresets = 'Use up to eight valid serving shortcuts.';
      if (draft.habitTemplate === 'mindfulness' && draft.mindfulnessVisualMode && !['breathing', 'quiet'].includes(draft.mindfulnessVisualMode)) errors.mindfulnessVisualMode = 'Choose a visual style.';
    } else {
      const count = Number(draft.frequencyCount);
      if (!Number.isInteger(count) || count < 1) errors.frequencyCount = 'Enter a whole number of at least 1.';
      if (!draft.frequencyPeriod) errors.frequencyPeriod = 'Choose a frequency period.';
    }
    if (draft.habitReminderTime && !parseClockTime(draft.habitReminderTime)) errors.habitReminderTime = 'Use a time like 9:00 AM.';
  }
  if (draft.mode !== 'habit' && draft.savingsExpenses?.length) {
    const error = validateSavingsDrafts(draft.savingsExpenses);
    if (error) errors.savingsExpenses = error;
  }
  return errors;
}

function isNonNegativeNumber(value?: string) {
  return value !== undefined && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function positiveOunces(value?: string) { return value !== undefined && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1000; }

export function trackerFromDraft(draft: TrackerDraft, id: TrackerId, existing?: Tracker): Tracker {
  return {
    id,
    name: draft.name.trim(),
    displayName: draft.displayName?.trim() || undefined,
    mode: draft.mode,
    startedAt: draft.habitTemplate && existing?.startedAt ? existing.startedAt : `${draft.startDate}T${startTime24Hour(draft) || '00:00'}:00`,
    icon: draft.icon,
    color: draft.color,
    unit: draft.mode === 'reduction' ? draft.unit?.trim() : undefined,
    baseline: draft.mode === 'reduction' ? Number(draft.baseline) : undefined,
    current: draft.mode === 'reduction' ? Number(draft.current) : undefined,
    target: draft.mode === 'reduction' && draft.target ? Number(draft.target) : undefined,
    frequencyCount: draft.mode === 'habit' && !draft.habitTemplate ? Number(draft.frequencyCount) : undefined,
    frequencyPeriod: draft.mode === 'habit' && !draft.habitTemplate ? draft.frequencyPeriod : undefined,
    habitLogStyle: draft.mode === 'habit' ? 'count' : undefined,
    habitTemplate: draft.mode === 'habit' ? draft.habitTemplate : undefined,
    habitGoalHistory: draft.mode === 'habit' && draft.habitTemplate && templateConfig(draft.habitTemplate) && !templateConfig(draft.habitTemplate)?.checklist
      ? reconcileDated(existing?.habitGoalHistory ?? [], Number(draft.habitGoalValue), localDateKey()) : existing?.habitGoalHistory,
    mindfulnessVisualMode: draft.habitTemplate === 'mindfulness' ? draft.mindfulnessVisualMode ?? existing?.mindfulnessVisualMode ?? 'breathing' : existing?.mindfulnessVisualMode,
    exerciseGoalModes: draft.habitTemplate === 'exercise' ? reconcileExerciseModes(existing?.exerciseGoalModes ?? [], draft.exerciseGoalMode ?? 'times', localDateKey()) : existing?.exerciseGoalModes,
    exerciseRegimenHistory: draft.habitTemplate === 'exercise' ? reconcileRegimen(existing?.exerciseRegimenHistory ?? [], draft.exerciseRegimenRows ?? [], localDateKey()) : existing?.exerciseRegimenHistory,
    producePresets: draft.habitTemplate === 'produce' ? draft.producePresets ?? existing?.producePresets ?? [0.5, 1] : existing?.producePresets,
    habitChecklistHistory: draft.mode === 'habit' && draft.habitTemplate && templateConfig(draft.habitTemplate)?.checklist
      ? reconcileChecklist(existing?.habitChecklistHistory ?? [], draft.habitChecklistItems ?? [], localDateKey()) : existing?.habitChecklistHistory,
    waterQuickAddOz: draft.mode === 'habit' && draft.habitTemplate === 'water' ? Number(draft.waterQuickAddOz) : undefined,
    waterDisplayUnit: draft.mode === 'habit' && draft.habitTemplate === 'water' ? draft.waterDisplayUnit ?? 'fl oz' : undefined,
    waterPresetOz: draft.mode === 'habit' && draft.habitTemplate === 'water' ? draft.waterPresetOz ?? existing?.waterPresetOz ?? [] : undefined,
    waterGoals: draft.mode === 'habit' && draft.habitTemplate === 'water'
      ? reconcileWaterGoals(existing?.waterGoals ?? [], Number(draft.waterGoalOz), localDateKey()) : undefined,
    habitReminderTime: draft.mode === 'habit' && draft.habitReminderTime ? parseClockTime(draft.habitReminderTime) : undefined,
    notes: draft.notes?.trim() || undefined,
    savingsExpenses: draft.mode !== 'habit' && draft.savingsExpenses?.length || existing?.savingsExpenses?.length
      ? reconcileSavingsExpenses(existing?.savingsExpenses ?? [], draft.savingsExpenses ?? [], localDateKey())
      : undefined,
    checkpointDays: draft.mode === 'abstinence'
      ? [1, 3, 7, 14, 30, 60, 90, 180, 365]
      : undefined,
  };
}

function reconcileWaterGoals(goals: NonNullable<Tracker['waterGoals']>, ounces: number, today: string) {
  const latest = [...goals].filter((goal) => goal.effectiveDate <= today).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  if (latest?.ounces === ounces) return goals;
  return [...goals.filter((goal) => goal.effectiveDate !== today), { effectiveDate: today, ounces }]
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

function reconcileDated(history: NonNullable<Tracker['habitGoalHistory']>, value: number, date: string) {
  if (history.length && goalOn({ habitGoalHistory: history } as Tracker, date) === value) return history;
  return [...history.filter((item) => item.effectiveDate !== date), { effectiveDate: date, value }].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}
function reconcileExerciseModes(history: NonNullable<Tracker['exerciseGoalModes']>, mode: 'times' | 'minutes', date: string) {
  if (history.length && exerciseModeOn({ exerciseGoalModes: history } as Tracker, date) === mode) return history;
  return [...history.filter((item) => item.effectiveDate !== date), { effectiveDate: date, mode }].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}
function reconcileRegimen(history: NonNullable<Tracker['exerciseRegimenHistory']>, rows: NonNullable<TrackerDraft['exerciseRegimenRows']>, date: string) {
  if (history.length && JSON.stringify(exerciseRegimenOn({ exerciseRegimenHistory: history } as Tracker, date)) === JSON.stringify(rows)) return history;
  return [...history.filter((item) => item.effectiveDate !== date), { effectiveDate: date, rows }].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}
function reconcileChecklist(history: NonNullable<Tracker['habitChecklistHistory']>, items: NonNullable<TrackerDraft['habitChecklistItems']>, date: string) {
  if (history.length && JSON.stringify(checklistOn({ habitChecklistHistory: history } as Tracker, date)) === JSON.stringify(items)) return history;
  return [...history.filter((item) => item.effectiveDate !== date), { effectiveDate: date, items }].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function startTime24Hour(draft: Pick<TrackerDraft, 'startTime' | 'startPeriod'>) {
  if (!draft.startTime) return '';
  if (!draft.startPeriod) return draft.startTime;
  const [hourText, minute] = draft.startTime.split(':');
  let hour = Number(hourText) % 12;
  if (draft.startPeriod === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

export function createTracker(
  state: TrackerState,
  draft: TrackerDraft,
  id: TrackerId,
) {
  const errors = validateTrackerDraft(draft);
  if (Object.keys(errors).length) return { state, errors };
  const tracker = trackerFromDraft(draft, id);
  return { state: { ...state, trackers: [...state.trackers, tracker] }, errors, tracker };
}

export function editTracker(state: TrackerState, id: TrackerId, draft: TrackerDraft) {
  const errors = validateTrackerDraft(draft);
  if (Object.keys(errors).length) return { state, errors };
  const existing = state.trackers.find((tracker) => tracker.id === id);
  if (!existing) return { state, errors: { name: 'Tracker not found.' } as TrackerValidation };
  const updated = { ...existing, ...trackerFromDraft(draft, id, existing), archived: existing.archived };
  if (existing.mode === 'abstinence' && existing.startedAt && updated.startedAt && existing.startedAt !== updated.startedAt && updated.savingsExpenses) {
    const oldStart = localDateKey(new Date(existing.startedAt));
    const newStart = localDateKey(new Date(updated.startedAt));
    updated.savingsExpenses = updated.savingsExpenses.map((expense) => ({
      ...expense,
      rates: expense.rates.map((rate, index) => index === 0 && rate.effectiveDate === oldStart ? { ...rate, effectiveDate: newStart } : rate),
    }));
  }
  const taperSteps = state.taperSteps?.map((step) =>
    step.trackerId === id
      && existing.mode === 'reduction'
      && (step.id.endsWith('-initial') || step.startedAt === existing.startedAt)
      ? { ...step, startedAt: updated.startedAt }
      : step);
  return {
    state: {
      ...state,
      trackers: state.trackers.map((tracker) => tracker.id === id ? updated : tracker),
      taperSteps,
    },
    errors,
    tracker: updated,
  };
}

export function setTrackerArchived(state: TrackerState, id: TrackerId, archived: boolean) {
  return {
    ...state,
    trackers: state.trackers.map((tracker) =>
      tracker.id === id ? { ...tracker, archived } : tracker),
  };
}

export function trackerHasHistory(state: TrackerState, id: TrackerId) {
  return (state.waterLogs ?? []).some((log) => log.trackerId === id)
    || (state.goodHabitLogs ?? []).some((log) => log.trackerId === id)
    || (state.historicalEntries ?? []).some((entry) => entry.trackerId === id)
    || (state.lapseEvents ?? []).some((entry) => entry.trackerId === id)
    || (state.taperSteps ?? []).some((step) => step.trackerId === id);
}

export function permanentlyDeleteTracker(
  state: TrackerState,
  id: TrackerId,
  confirmed: boolean,
  confirmationText = '',
) {
  const tracker = state.trackers.find((item) => item.id === id);
  if (!tracker || !confirmed) return state;
  if (trackerHasHistory(state, id)
    && confirmationText !== 'DELETE'
    && confirmationText !== tracker.name) return state;

  return {
    ...state,
    trackers: state.trackers.filter((item) => item.id !== id),
    historicalEntries: (state.historicalEntries ?? []).filter((entry) => entry.trackerId !== id),
    waterLogs: (state.waterLogs ?? []).filter((log) => log.trackerId !== id),
    goodHabitLogs: (state.goodHabitLogs ?? []).filter((log) => log.trackerId !== id),
    lapseEvents: (state.lapseEvents ?? []).filter((entry) => entry.trackerId !== id),
    taperSteps: (state.taperSteps ?? []).filter((step) => step.trackerId !== id),
    preferences: state.preferences ? {
      ...state.preferences,
      dashboard: state.preferences.dashboard?.map((widget) => widget.id === 'habits' && widget.selectedIds
        ? { ...widget, selectedIds: widget.selectedIds.filter((selectedId) => selectedId !== id) }
        : widget),
    } : undefined,
  };
}

export function trackerDisplayName(tracker: Tracker) {
  return tracker.displayName || tracker.name;
}

export function generateTrackerId(now = Date.now(), random = Math.random()) {
  return `custom-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`;
}
