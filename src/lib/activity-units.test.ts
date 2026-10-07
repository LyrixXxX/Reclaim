import { formatMiles } from './activity-units';

describe('Activity distance display', () => {
  it('shows miles without changing stored meters', () => {
    expect(formatMiles(1609.344)).toBe('1.00 mi');
    expect(formatMiles(804.672)).toBe('0.50 mi');
    expect(formatMiles(0)).toBe('0.00 mi');
  });
});
