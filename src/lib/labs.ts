import { LabResult, LabTracker, TrackerState } from '@/models/tracker';

export type LabResultInput = Omit<LabResult, 'id' | 'recordedAt'> & { id?: string };
export type LabTrackerInput = Pick<LabTracker, 'name' | 'defaultUnit' | 'notes'> & { id?: string };
export type LabScanDraftInput = {
  panelDate: string;
  resultTime?: string;
  sourceTimezone?: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: string;
};

export function validateLabTracker(input: LabTrackerInput) {
  if (!input.name.trim()) return 'Enter the laboratory test name.';
  return undefined;
}

export function upsertLabTracker(trackers: LabTracker[], input: LabTrackerInput, id = labTrackerId(), createdAt = new Date().toISOString()) {
  const existing = input.id ? trackers.find((item) => item.id === input.id) : undefined;
  const tracker: LabTracker = { id: existing?.id ?? id, name: input.name.trim(), defaultUnit: clean(input.defaultUnit), notes: clean(input.notes), createdAt: existing?.createdAt ?? createdAt };
  return [...trackers.filter((item) => item.id !== tracker.id), tracker].sort((a, b) => a.name.localeCompare(b.name));
}

export function removeLabTracker(state: TrackerState, id: string, confirmed: boolean): TrackerState {
  if (!confirmed) return state;
  return { ...state, labTrackers: (state.labTrackers ?? []).filter((item) => item.id !== id), labResults: (state.labResults ?? []).filter((item) => item.labTrackerId !== id) };
}

export function migrateLabState(state: TrackerState): TrackerState {
  if ((state.labTrackerVersion ?? 0) >= 1) return state;
  const trackers = [...(state.labTrackers ?? [])];
  const byName = new Map(trackers.map((item) => [normalizeName(item.name), item]));
  const results = (state.labResults ?? []).map((result) => {
    if (result.labTrackerId) return result;
    const key = normalizeName(result.marker);
    let tracker = byName.get(key);
    if (!tracker) {
      tracker = { id: legacyLabTrackerId(result.marker), name: result.marker.trim(), defaultUnit: result.unit, createdAt: result.recordedAt };
      trackers.push(tracker);
      byName.set(key, tracker);
    }
    return { ...result, labTrackerId: tracker.id };
  });
  return { ...state, labTrackerVersion: 1, labTrackers: trackers.sort((a, b) => a.name.localeCompare(b.name)), labResults: results };
}

export function validateLabResult(input: LabResultInput) {
  if (!validDate(input.panelDate)) return 'Enter the result date as YYYY-MM-DD.';
  if (input.resultTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.resultTime)) return 'Enter a valid result time.';
  if (!input.marker.trim()) return 'Enter the test name.';
  if (!Number.isFinite(input.value)) return 'Enter a numeric result.';
  if (!input.unit.trim()) return 'Enter the measurement unit.';
  return undefined;
}

export function upsertLabResult(results: LabResult[], input: LabResultInput, id: string, recordedAt = new Date().toISOString()) {
  const existing = input.id ? results.find((item) => item.id === input.id) : undefined;
  const result: LabResult = { ...input, id: existing?.id ?? id, marker: input.marker.trim(), unit: input.unit.trim(), resultTime: clean(input.resultTime), sourceTimezone: clean(input.sourceTimezone), referenceRange: clean(input.referenceRange), flag: clean(input.flag), note: clean(input.note), recordedAt: existing?.recordedAt ?? recordedAt };
  return [...results.filter((item) => item.id !== result.id), result].sort((a, b) => b.panelDate.localeCompare(a.panelDate) || (b.resultTime ?? '').localeCompare(a.resultTime ?? '') || a.marker.localeCompare(b.marker));
}

export function mergeLabResults(results: LabResult[], inputs: LabResultInput[], idFactory = labResultId) {
  let next = results; let added = 0; let duplicates = 0;
  for (const input of inputs) {
    if (next.some((item) => isSameLabResult(item, input))) { duplicates += 1; continue; }
    next = upsertLabResult(next, input, idFactory()); added += 1;
  }
  return { results: next, added, duplicates };
}

export function removeLabResult(results: LabResult[], id: string, confirmed: boolean) { return confirmed ? results.filter((item) => item.id !== id) : results; }
export function labResultId(now = Date.now(), random = Math.random()) { return `lab-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`; }
export function labTrackerId(now = Date.now(), random = Math.random()) { return `lab-tracker-${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`; }

export function labInputsForTracker(drafts: LabScanDraftInput[], tracker: LabTracker, photoUri?: string): LabResultInput[] {
  return drafts.map((draft) => ({ labTrackerId: tracker.id, panelDate: draft.panelDate, resultTime: clean(draft.resultTime), sourceTimezone: clean(draft.sourceTimezone), marker: tracker.name, value: Number(draft.value), unit: draft.unit || tracker.defaultUnit || '', referenceRange: draft.referenceRange, flag: draft.flag, photoUri }));
}

/** Legacy helper retained for older imports. */
export function labInputsForCollectionDate(drafts: (Omit<LabScanDraftInput, 'panelDate'> & { marker: string })[], panelDate: string, photoUri?: string): LabResultInput[] {
  return drafts.map((draft) => ({ panelDate, marker: draft.marker, value: Number(draft.value), unit: draft.unit, referenceRange: draft.referenceRange, flag: draft.flag, photoUri }));
}

// General single-row parser retained as an offline fallback.
export function parseLabText(text: string, panelDate = localDateKey()): LabResultInput[] {
  const rows: LabResultInput[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const match = line.match(/^([A-Za-z][A-Za-z0-9 ()/%.,+_-]{1,45}?)\s+([<>]?\s*-?\d+(?:\.\d+)?)\s+([a-zA-Zµμ%/][a-zA-Z0-9µμ%/^².-]{0,18})(?:\s+(.+))?$/);
    if (!match) continue;
    const value = Number(match[2].replace(/[<>\s]/g, ''));
    if (Number.isFinite(value)) rows.push({ panelDate, marker: match[1].trim(), value, unit: match[3], referenceRange: match[4]?.trim() });
  }
  return rows;
}

/** Parses history reports where each displayed value is followed by its own Date row. */
export function parseLabHistoryText(text: string, defaultUnit = ''): LabScanDraftInput[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const rows: LabScanDraftInput[] = [];
  let pending: Omit<LabScanDraftInput, 'panelDate'> | undefined;
  for (const line of lines) {
    const value = line.match(/^([<>]?\s*-?\d+(?:\.\d+)?)\s*([a-zA-Zµμ%/][a-zA-Z0-9µμ%/^².-]{0,18})$/);
    if (value) { pending = { value: value[1].replace(/\s/g, ''), unit: value[2] || defaultUnit, referenceRange: '', flag: '' }; continue; }
    const date = line.match(/(?:Date\s*:?\s*)?([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([ap])\.?m\.?)?(?:\s+([A-Z]{2,5}))?/i);
    if (pending && date) {
      const panelDate = parsedDateKey(date[1], date[2], date[3]);
      if (panelDate) { rows.push({ ...pending, panelDate, resultTime: date[4] ? to24Hour(date[4], date[5], date[6]) : undefined, sourceTimezone: date[7] }); pending = undefined; }
      continue;
    }
    const range = line.match(/Reference\s*Range\s*:?\s*(.+)$/i);
    if (range && rows.length) rows[rows.length - 1] = { ...rows[rows.length - 1], referenceRange: range[1].trim() };
  }
  return rows;
}

export function labTrackerSeries(results: LabResult[], trackerId: string) { return results.filter((item) => item.labTrackerId === trackerId).sort((a, b) => a.panelDate.localeCompare(b.panelDate) || (a.resultTime ?? '').localeCompare(b.resultTime ?? '')); }
export function labMarkerSeries(results: LabResult[], marker: string) { return results.filter((item) => normalizeName(item.marker) === normalizeName(marker)).sort((a, b) => a.panelDate.localeCompare(b.panelDate)); }
export function isSameLabResult(item: LabResult, input: LabResultInput) { return item.labTrackerId === input.labTrackerId && item.panelDate === input.panelDate && (item.resultTime ?? '') === (input.resultTime ?? '') && item.value === input.value && normalizeName(item.unit) === normalizeName(input.unit); }

function legacyLabTrackerId(name: string) { const slug = normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'lab'; let hash = 2166136261; for (const character of normalizeName(name)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619); return `lab-tracker-legacy-${slug}-${(hash >>> 0).toString(36)}`; }
function normalizeName(value: string) { return value.trim().toLocaleLowerCase(); }
function clean(value?: string) { return value?.trim() || undefined; }
function validDate(value: string) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return false; const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12); return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]); }
function localDateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function parsedDateKey(month: string, day: string, year: string) { const parsed = new Date(`${month} ${day}, ${year} 12:00:00`); return Number.isNaN(parsed.getTime()) ? undefined : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`; }
function to24Hour(hour: string, minute: string, period: string) { const value = (Number(hour) % 12) + (period.toLocaleLowerCase() === 'p' ? 12 : 0); return `${String(value).padStart(2, '0')}:${minute}`; }
