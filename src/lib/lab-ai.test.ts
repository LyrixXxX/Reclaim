import { validateLabHistoryResponse } from './lab-ai';

describe('lab AI response validation', () => {
  test('maps strict dated rows into editable scan drafts', () => {
    expect(validateLabHistoryResponse({ schemaVersion: 1, rows: [{ resultDate: '2026-08-27', resultTime: '10:32', sourceTimezone: 'EDT', value: 86, unit: 'mg/dL', referenceRange: '70-99 mg/dL', flag: null }] })).toEqual([{ panelDate: '2026-08-27', resultTime: '10:32', sourceTimezone: 'EDT', value: '86', unit: 'mg/dL', referenceRange: '70-99 mg/dL', flag: '' }]);
  });
  test('rejects invalid dates and nonnumeric values', () => {
    expect(() => validateLabHistoryResponse({ schemaVersion: 1, rows: [{ resultDate: 'Aug 27', value: 86, unit: 'mg/dL' }] })).toThrow(/invalid date/);
    expect(() => validateLabHistoryResponse({ schemaVersion: 1, rows: [{ resultDate: '2026-08-27', value: '86', unit: 'mg/dL' }] })).toThrow(/invalid value/);
  });
});
