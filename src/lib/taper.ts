import { DatePrecision, TaperStep, TrackerId, TrackerState } from '@/models/tracker';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type TaperStepInput = {
  amount: number;
  unit: string;
  startedAt?: string;
  endedAt?: string;
  datePrecision: DatePrecision;
  note?: string;
};

export type StepResult = { state: TrackerState; error?: string; step?: TaperStep };

export function migrateTaperState(state: TrackerState, recordedAt = new Date().toISOString()): TrackerState {
  const existing = state.taperSteps ?? [];
  const migrated = [...existing];
  for (const tracker of state.trackers.filter((item) => item.mode === 'reduction')) {
    if (migrated.some((step) => step.trackerId === tracker.id)) continue;
    const baseline = tracker.baseline ?? tracker.current ?? 0;
    const current = tracker.current ?? baseline;
    if (baseline === current) {
      migrated.push({
        id: `migrated-${tracker.id}-initial`,
        trackerId: tracker.id,
        amount: baseline,
        unit: tracker.unit ?? '',
        startedAt: tracker.startedAt,
        status: 'current',
        datePrecision: tracker.startedAt ? 'exact' : 'unknown',
        recordedAt,
      });
    } else {
      migrated.push({
        id: `migrated-${tracker.id}-initial`,
        trackerId: tracker.id,
        amount: baseline,
        unit: tracker.unit ?? '',
        startedAt: tracker.startedAt,
        endedAt: tracker.currentStepStartedAt,
        status: 'completed',
        datePrecision: tracker.startedAt ? 'exact' : 'unknown',
        recordedAt,
      });
      migrated.push({
        id: `migrated-${tracker.id}-current`,
        trackerId: tracker.id,
        amount: current,
        unit: tracker.unit ?? '',
        startedAt: tracker.currentStepStartedAt,
        status: 'current',
        datePrecision: tracker.currentStepStartedAt ? 'exact' : 'unknown',
        recordedAt,
      });
    }
  }
  const legacyCaffeine = migrated.filter((step) => step.trackerId === 'caffeine');
  const isUntouchedLegacyCaffeine = legacyCaffeine.length === 2
    && legacyCaffeine.some((step) => step.id === 'migrated-caffeine-initial' && step.amount === 300)
    && legacyCaffeine.some((step) => step.id === 'migrated-caffeine-current' && step.amount === 160);
  if (isUntouchedLegacyCaffeine) {
    migrated.splice(0, migrated.length, ...migrated.filter((step) => step.trackerId !== 'caffeine'), ...seededCaffeineSteps(recordedAt));
  }
  return {
    ...state,
    trackers: state.trackers.map((tracker) => tracker.id === 'caffeine' && isUntouchedLegacyCaffeine ? {
      ...tracker, current: 0, unit: 'mg/day', currentStepStartedAt: '2026-07-25T00:00:00',
    } : tracker),
    taperSteps: migrated,
  };
}

function seededCaffeineSteps(recordedAt: string): TaperStep[] {
  return [
    { id: 'seed-caffeine-initial', trackerId: 'caffeine', amount: 300, unit: 'mg/day', startedAt: '2026-07-20T00:00:00', endedAt: '2026-07-20T00:00:00', status: 'completed', datePrecision: 'date_only', recordedAt },
    { id: 'seed-caffeine-160', trackerId: 'caffeine', amount: 160, unit: 'mg/day', startedAt: '2026-07-20T00:00:00', endedAt: '2026-07-25T00:00:00', status: 'completed', datePrecision: 'approximate', recordedAt },
    { id: 'seed-caffeine-current', trackerId: 'caffeine', amount: 0, unit: 'mg/day', startedAt: '2026-07-25T00:00:00', status: 'current', datePrecision: 'approximate', recordedAt },
  ];
}

export function addTaperStep(
  state: TrackerState,
  trackerId: TrackerId,
  input: TaperStepInput,
  id: string,
  recordedAt = new Date().toISOString(),
): StepResult {
  const validation = validateStepInput(input);
  if (validation) return { state, error: validation };
  const steps = state.taperSteps ?? [];
  const current = steps.find((step) => step.trackerId === trackerId && step.status === 'current');
  if (current?.startedAt && input.startedAt && Date.parse(input.startedAt) <= Date.parse(current.startedAt)) {
    return { state, error: 'The new step must begin after the current step started.' };
  }
  const completed = steps.map((step) => step.id === current?.id
    ? { ...step, status: 'completed' as const, endedAt: input.startedAt }
    : step);
  const step: TaperStep = {
    id,
    trackerId,
    amount: input.amount,
    unit: input.unit.trim(),
    startedAt: input.startedAt,
    status: 'current',
    note: input.note?.trim() || undefined,
    datePrecision: input.datePrecision,
    recordedAt,
  };
  return {
    state: {
      ...state,
      taperSteps: [...completed, step],
      trackers: state.trackers.map((tracker) => tracker.id === trackerId ? {
        ...tracker,
        current: input.amount,
        unit: input.unit.trim(),
        currentStepStartedAt: input.startedAt,
      } : tracker),
    },
    step,
  };
}

export function insertHistoricalTaperStep(
  state: TrackerState,
  trackerId: TrackerId,
  input: TaperStepInput,
  id: string,
  recordedAt = new Date().toISOString(),
): StepResult {
  const validation = validateStepInput(input);
  if (validation) return { state, error: validation };
  if (!input.startedAt || input.datePrecision === 'unknown') {
    return { state, error: 'A historical step needs a start date.' };
  }
  const startedAt = input.startedAt;
  const tracker = state.trackers.find((item) => item.id === trackerId);
  if (!tracker) return { state, error: 'Tracker not found.' };
  if (tracker.startedAt && Date.parse(startedAt) < Date.parse(tracker.startedAt)) {
    return { state, error: 'A historical step cannot begin before the original taper start.' };
  }
  const trackerSteps = (state.taperSteps ?? []).filter((step) => step.trackerId === trackerId);
  const current = trackerSteps.find((step) => step.status === 'current');
  if (current?.startedAt && Date.parse(startedAt) >= Date.parse(current.startedAt)) {
    return { state, error: 'A historical step must begin before the preserved current step.' };
  }
  if (trackerSteps.some((step) => step.startedAt && Date.parse(step.startedAt) === Date.parse(startedAt))) {
    return { state, error: 'Another taper step already begins on this date and time.' };
  }
  const step: TaperStep = {
    id,
    trackerId,
    amount: input.amount,
    unit: input.unit.trim(),
    startedAt: input.startedAt,
    status: 'completed',
    note: input.note?.trim() || undefined,
    datePrecision: input.datePrecision,
    recordedAt,
  };
  const recalculated = recalculateTrackerSteps([...trackerSteps, step], current?.id);
  if (recalculated.error) return { state, error: recalculated.error };
  return {
    state: replaceTrackerSteps(state, trackerId, recalculated.steps),
    step: recalculated.steps.find((item) => item.id === id),
  };
}

export function editTaperStep(
  state: TrackerState,
  stepId: string,
  input: TaperStepInput,
  recordedAt = new Date().toISOString(),
): StepResult {
  const validation = validateStepInput(input);
  if (validation) return { state, error: validation };
  const existing = (state.taperSteps ?? []).find((step) => step.id === stepId);
  if (!existing) return { state, error: 'Step not found.' };
  const updated: TaperStep = {
    ...existing,
    amount: input.amount,
    unit: input.unit.trim(),
    startedAt: input.startedAt,
    endedAt: existing.status === 'completed' ? input.endedAt : undefined,
    note: input.note?.trim() || undefined,
    datePrecision: input.datePrecision,
    recordedAt,
  };
  const trackerSteps = (state.taperSteps ?? []).filter((step) => step.trackerId === existing.trackerId);
  const candidate = trackerSteps.map((step) => step.id === stepId ? updated : step);
  const recalculated = recalculateTrackerSteps(candidate, trackerSteps.find((step) => step.status === 'current')?.id);
  if (recalculated.error) return { state, error: recalculated.error };
  return {
    state: replaceTrackerSteps(state, existing.trackerId, recalculated.steps),
    step: recalculated.steps.find((step) => step.id === stepId),
  };
}

export function deleteTaperStep(state: TrackerState, stepId: string, confirmed: boolean): StepResult {
  if (!confirmed) return { state, error: 'Confirm deletion before removing this step.' };
  const existing = (state.taperSteps ?? []).find((step) => step.id === stepId);
  if (!existing) return { state, error: 'Step not found.' };
  const remaining = (state.taperSteps ?? []).filter((step) => step.trackerId === existing.trackerId && step.id !== stepId);
  if (!remaining.length) return { state, error: 'A taper tracker must retain at least one step.' };
  const priorCurrentId = remaining.some((step) => step.status === 'current')
    ? remaining.find((step) => step.status === 'current')?.id
    : sortKnownSteps(remaining).at(-1)?.id;
  const recalculated = recalculateTrackerSteps(remaining, priorCurrentId);
  if (recalculated.error) return { state, error: recalculated.error };
  return { state: replaceTrackerSteps(state, existing.trackerId, recalculated.steps) };
}

export function sortTaperSteps(steps: TaperStep[]) { return sortKnownSteps(steps); }

function recalculateTrackerSteps(steps: TaperStep[], currentId?: string) {
  const preservedCurrent = steps.find((step) => step.id === currentId);
  if (preservedCurrent?.startedAt && steps.some((step) => step.id !== currentId && step.startedAt
    && (Date.parse(step.startedAt) > Date.parse(preservedCurrent.startedAt!)
      || (Date.parse(step.startedAt) === Date.parse(preservedCurrent.startedAt!)
        && !step.id.endsWith('-initial'))))) {
    return { steps, error: 'A historical step must remain before the current step.' };
  }
  const sorted = sortKnownSteps(steps);
  if (sorted.some((step, index) => index > 0 && step.startedAt && sorted[index - 1].startedAt
    && (Date.parse(step.startedAt) < Date.parse(sorted[index - 1].startedAt!)
      || (Date.parse(step.startedAt) === Date.parse(sorted[index - 1].startedAt!)
        && !sorted[index - 1].id.endsWith('-initial'))))) {
    return { steps, error: 'Step dates must be in a possible, non-overlapping chronological order.' };
  }
  const currentIndex = sorted.findIndex((step) => step.id === currentId);
  if (currentIndex >= 0 && currentIndex !== sorted.length - 1) {
    return { steps, error: 'A historical change cannot move a step after the current step.' };
  }
  const resolvedCurrentId = currentId ?? sorted.at(-1)?.id;
  return {
    steps: sorted.map((step, index) => ({
      ...step,
      status: step.id === resolvedCurrentId ? 'current' as const : 'completed' as const,
      endedAt: step.id === resolvedCurrentId ? undefined : sorted[index + 1]?.startedAt,
    })),
  };
}

function sortKnownSteps(steps: TaperStep[]) {
  return [...steps].sort((a, b) => {
    if (a.status === 'current' && b.status !== 'current') return 1;
    if (b.status === 'current' && a.status !== 'current') return -1;
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return Date.parse(a.startedAt) - Date.parse(b.startedAt);
  });
}

function replaceTrackerSteps(state: TrackerState, trackerId: TrackerId, steps: TaperStep[]): TrackerState {
  const current = steps.find((step) => step.status === 'current');
  return {
    ...state,
    taperSteps: [...(state.taperSteps ?? []).filter((step) => step.trackerId !== trackerId), ...steps],
    trackers: state.trackers.map((tracker) => tracker.id === trackerId && current ? {
      ...tracker,
      current: current.amount,
      unit: current.unit,
      currentStepStartedAt: current.startedAt,
    } : tracker),
  };
}

export function validateNoOverlaps(steps: TaperStep[]) {
  const known = steps.filter((step) => step.startedAt).sort((a, b) => Date.parse(a.startedAt!) - Date.parse(b.startedAt!));
  for (let index = 0; index < known.length; index += 1) {
    const step = known[index];
    if (step.endedAt && Date.parse(step.endedAt) < Date.parse(step.startedAt!)) {
      return 'A step cannot end before it starts.';
    }
    const next = known[index + 1];
    if (next && step.endedAt && Date.parse(step.endedAt) > Date.parse(next.startedAt!)) {
      return 'Step dates overlap. Adjust the start or end date before saving.';
    }
    if (next && !step.endedAt && step.status !== 'current') {
      return 'A completed historical step needs an end date before the next step begins.';
    }
  }
  return undefined;
}

export function taperReductionPercent(baseline: number, amount: number) {
  if (baseline <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((baseline - amount) / baseline) * 100)));
}

export function liveStepProgress(startedAt: string, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(startedAt));
  return {
    minute: (elapsed % MINUTE) / MINUTE,
    hour: (elapsed % HOUR) / HOUR,
    day: Math.min(1, elapsed / DAY),
    week: Math.min(1, elapsed / (7 * DAY)),
    month: Math.min(1, elapsed / (30 * DAY)),
    year: Math.min(1, elapsed / (365 * DAY)),
  };
}

export function stepDuration(startedAt?: string, endedAt?: string, now = Date.now()) {
  if (!startedAt) return undefined;
  const milliseconds = Math.max(0, (endedAt ? Date.parse(endedAt) : now) - Date.parse(startedAt));
  let seconds = Math.floor(milliseconds / 1000);
  const years = Math.floor(seconds / (365 * 86_400));
  seconds -= years * 365 * 86_400;
  const months = Math.floor(seconds / (30 * 86_400));
  seconds -= months * 30 * 86_400;
  const days = Math.floor(seconds / 86_400);
  seconds -= days * 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds -= hours * 3_600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  return { milliseconds, years, months, days, hours, minutes, seconds };
}

export function formatStepStart(step: Pick<TaperStep, 'startedAt' | 'datePrecision'>) {
  if (step.datePrecision === 'unknown' || !step.startedAt) return 'Date not recorded';
  const date = new Date(step.startedAt);
  const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (step.datePrecision === 'approximate') return `Started approximately ${dateLabel}`;
  if (step.datePrecision === 'date_only') return `Started ${dateLabel} · Exact time unknown`;
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Started ${dateLabel} at ${time}`;
}

export function generateStepId(trackerId: string, now = Date.now(), random = Math.random()) {
  return `step-${trackerId}-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`;
}

function validateStepInput(input: TaperStepInput) {
  if (!Number.isFinite(input.amount) || input.amount < 0) return 'Enter a valid non-negative amount.';
  if (!input.unit.trim()) return 'Measurement unit is required.';
  if (input.datePrecision !== 'unknown' && !input.startedAt) return 'A start date is required for this precision.';
  return undefined;
}
