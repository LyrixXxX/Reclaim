import { labInputsForCollectionDate, labMarkerSeries, labTrackerSeries, mergeLabResults, migrateLabState, parseLabHistoryText, parseLabText, removeLabResult, removeLabTracker, upsertLabResult, upsertLabTracker, validateLabResult } from './labs';
import { TrackerState } from '@/models/tracker';

describe('laboratory results', () => {
  test('conservatively parses numeric lab rows for confirmation', () => { expect(parseLabText('Testosterone 525 ng/dL 264-916\nA1C 5.4 % 4.8-5.6\nNot a result', '2026-09-18')).toMatchObject([{ marker: 'Testosterone', value: 525, unit: 'ng/dL' }, { marker: 'A1C', value: 5.4, unit: '%' }]); });
  test('validates, edits, sorts, charts, and safely removes results', () => { const input = { panelDate: '2026-09-18', marker: 'LH', value: 4.2, unit: 'mIU/mL' }; expect(validateLabResult(input)).toBeUndefined(); const first = upsertLabResult([], input, 'lab-1'); const second = upsertLabResult(first, { panelDate: '2026-08-01', marker: 'LH', value: 3.8, unit: 'mIU/mL' }, 'lab-2'); expect(labMarkerSeries(second, 'lh').map((item) => item.value)).toEqual([3.8, 4.2]); expect(removeLabResult(second, 'lab-1', false)).toHaveLength(2); expect(removeLabResult(second, 'lab-1', true)).toHaveLength(1); });
  test('changing a scanned report date preserves corrected OCR fields', () => {
    const corrected = [{ marker: 'Free Testosterone', value: '18.7', unit: 'ng/dL', referenceRange: '5-21', flag: '' }];
    expect(labInputsForCollectionDate(corrected, '2026-09-10', 'local-photo')).toEqual([expect.objectContaining({ panelDate: '2026-09-10', marker: 'Free Testosterone', value: 18.7, unit: 'ng/dL', referenceRange: '5-21', photoUri: 'local-photo' })]);
    expect(labInputsForCollectionDate(corrected, '2026-09-12', 'local-photo')).toEqual([expect.objectContaining({ panelDate: '2026-09-12', marker: 'Free Testosterone', value: 18.7, unit: 'ng/dL', referenceRange: '5-21', photoUri: 'local-photo' })]);
  });
  test('extracts every dated row from a history-style report without a shared collection date', () => {
    const text = `Glucose Lvl
86 mg/dL
Date: Aug 27, 2026 10:32 a.m. EDT
Reference Range: 70 mg/dL - 99 mg/dL
95 mg/dL
Date: Jul 28, 2026 10:58 a.m. EDT
Reference Range: 70 mg/dL - 99 mg/dL`;
    expect(parseLabHistoryText(text)).toEqual([
      { panelDate: '2026-08-27', resultTime: '10:32', sourceTimezone: 'EDT', value: '86', unit: 'mg/dL', referenceRange: '70 mg/dL - 99 mg/dL', flag: '' },
      { panelDate: '2026-07-28', resultTime: '10:58', sourceTimezone: 'EDT', value: '95', unit: 'mg/dL', referenceRange: '70 mg/dL - 99 mg/dL', flag: '' },
    ]);
  });
  test('creates stable lab trackers and scopes graph series by tracker id', () => {
    const tracker = upsertLabTracker([], { name: 'Glucose Lvl', defaultUnit: 'mg/dL' }, 'glucose')[0];
    const results = [
      { id: 'g1', labTrackerId: tracker.id, panelDate: '2026-08-27', marker: tracker.name, value: 86, unit: 'mg/dL', recordedAt: '2026-08-27T12:00:00Z' },
      { id: 'a1', labTrackerId: 'a1c', panelDate: '2026-08-27', marker: 'A1C', value: 5.4, unit: '%', recordedAt: '2026-08-27T12:00:00Z' },
    ];
    expect(labTrackerSeries(results, tracker.id).map((item) => item.value)).toEqual([86]);
  });
  test('migrates legacy marker history without losing results', () => {
    const state = { trackers: [], checkIns: [], labResults: [{ id: 'old', panelDate: '2026-08-27', marker: 'Glucose Lvl', value: 86, unit: 'mg/dL', recordedAt: '2026-08-27T12:00:00Z' }] } as TrackerState;
    const migrated = migrateLabState(state);
    expect(migrated.labTrackers).toEqual([expect.objectContaining({ name: 'Glucose Lvl' })]);
    expect(migrated.labResults?.[0]).toMatchObject({ id: 'old', labTrackerId: migrated.labTrackers?.[0].id });
    expect(migrateLabState(migrated)).toBe(migrated);
  });
  test('skips exact rescans while retaining different dated values', () => {
    const input = { labTrackerId: 'glucose', panelDate: '2026-08-27', resultTime: '10:32', marker: 'Glucose Lvl', value: 86, unit: 'mg/dL' };
    const first = mergeLabResults([], [input], () => 'first');
    const second = mergeLabResults(first.results, [input, { ...input, panelDate: '2026-07-28', value: 95 }], () => 'second');
    expect(second).toMatchObject({ added: 1, duplicates: 1 });
    expect(second.results).toHaveLength(2);
  });
  test('deleting a lab tracker requires confirmation and removes only its related results', () => {
    const state = { trackers: [], checkIns: [], labTrackers: [{ id: 'glucose', name: 'Glucose', createdAt: '2026-01-01T00:00:00Z' }, { id: 'a1c', name: 'A1C', createdAt: '2026-01-01T00:00:00Z' }], labResults: [{ id: 'g', labTrackerId: 'glucose', panelDate: '2026-08-27', marker: 'Glucose', value: 86, unit: 'mg/dL', recordedAt: '2026-08-27T12:00:00Z' }, { id: 'a', labTrackerId: 'a1c', panelDate: '2026-08-27', marker: 'A1C', value: 5.4, unit: '%', recordedAt: '2026-08-27T12:00:00Z' }] } as TrackerState;
    expect(removeLabTracker(state, 'glucose', false)).toBe(state);
    const removed = removeLabTracker(state, 'glucose', true);
    expect(removed.labTrackers?.map((item) => item.id)).toEqual(['a1c']);
    expect(removed.labResults?.map((item) => item.id)).toEqual(['a']);
  });
});
