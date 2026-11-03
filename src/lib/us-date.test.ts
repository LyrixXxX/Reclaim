import { isoToUs, maskUsDate, usToIso } from './us-date';

describe('US dates', () => {
  test('converts between stored and typed forms', () => {
    expect(isoToUs('2025-10-14')).toBe('10/14/2025');
    expect(isoToUs('')).toBe('');
    expect(usToIso('10/14/2025')).toBe('2025-10-14');
    expect(usToIso('1/4/2026')).toBe('2026-01-04');
  });

  test('rejects incomplete and impossible dates', () => {
    expect(usToIso('10/14')).toBeUndefined();
    expect(usToIso('02/30/2026')).toBeUndefined();
    expect(usToIso('13/01/2026')).toBeUndefined();
  });

  test('adds slashes while typing and lets them be deleted', () => {
    expect(maskUsDate('1', '')).toBe('1');
    expect(maskUsDate('11', '1')).toBe('11/');
    expect(maskUsDate('11/03', '11/0')).toBe('11/03/');
    expect(maskUsDate('11032026', '')).toBe('11/03/2026');
    expect(maskUsDate('11/', '11/0')).toBe('11/');
  });
});
