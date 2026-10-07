import { FrequencyPeriod, Tracker, TrackerId, TrackerMode, TrackerState } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';
import { reconcileSavingsExpenses, SavingsExpenseDraft, validateSavingsDrafts } from '@/lib/habit-savings';

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
    const count = Number(draft.frequencyCount);
    if (!Number.isInteger(count) || count < 1) errors.frequencyCount = 'Enter a whole number of at least 1.';
    if (!draft.frequencyPeriod) errors.frequencyPeriod = 'Choose a frequency period.';
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

export function trackerFromDraft(draft: TrackerDraft, id: TrackerId, existing?: Tracker): Tracker {
  return {
    id,
    name: draft.name.trim(),
    displayName: draft.displayName?.trim() || undefined,
    mode: draft.mode,
    startedAt: `${draft.startDate}T${startTime24Hour(draft) || '00:00'}:00`,
    icon: draft.icon,
    color: draft.color,
    unit: draft.mode === 'reduction' ? draft.unit?.trim() : undefined,
    baseline: draft.mode === 'reduction' ? Number(draft.baseline) : undefined,
    current: draft.mode === 'reduction' ? Number(draft.current) : undefined,
    target: draft.mode === 'reduction' && draft.target ? Number(draft.target) : undefined,
    frequencyCount: draft.mode === 'habit' ? Number(draft.frequencyCount) : undefined,
    frequencyPeriod: draft.mode === 'habit' ? draft.frequencyPeriod : undefined,
    notes: draft.notes?.trim() || undefined,
    savingsExpenses: draft.mode !== 'habit' && draft.savingsExpenses?.length || existing?.savingsExpenses?.length
      ? reconcileSavingsExpenses(existing?.savingsExpenses ?? [], draft.savingsExpenses ?? [], localDateKey())
      : undefined,
    checkpointDays: draft.mode === 'abstinence'
      ? [1, 3, 7, 14, 30, 60, 90, 180, 365]
      : undefined,
  };
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
  return (state.historicalEntries ?? []).some((entry) => entry.trackerId === id)
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
