import { formatClockTime, parseClockTime } from '@/lib/clock-time';

describe('12-hour clock conversion', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['09:05', '9:05 AM'],
    ['12:00', '12:00 PM'],
    ['18:15', '6:15 PM'],
    ['23:59', '11:59 PM'],
  ])('shows %s as %s and round-trips to storage', (stored, display) => {
    expect(formatClockTime(stored)).toBe(display);
    expect(parseClockTime(display)).toBe(stored);
  });

  it('rejects ambiguous and invalid entries', () => {
    expect(parseClockTime('9:30')).toBeUndefined();
    expect(parseClockTime('13:30 PM')).toBeUndefined();
    expect(parseClockTime('12:60 AM')).toBeUndefined();
  });
});
