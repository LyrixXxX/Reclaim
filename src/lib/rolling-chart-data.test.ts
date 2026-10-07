import { activityRange } from './activity-overview';
import { cpapPeriodAxis, cpapPeriodBounds, cpapPeriodReadings, rollingCpapPeriod } from './cpap-calendar';
import { CpapReading } from '@/models/tracker';

describe('rolling chart data', () => {
  test('step chart retains days from the previous calendar week and leaves missing dates blank', () => {
    const chart = activityRange([{ date: '2026-09-27', count: 1200, incomplete: false }, { date: '2026-09-29', count: 1500, incomplete: false }], [], '7D', 0, new Date(2026, 8, 30));
    expect(chart.start).toBe('2026-09-24');
    expect(chart.slots.find((slot) => slot.date === '2026-09-27')?.count).toBe(1200);
    expect(chart.slots.find((slot) => slot.date === '2026-09-28')?.count).toBeUndefined();
    expect(chart.average).toBe(1350);
  });
  test('CPAP seven nights end on last completed sleep date and show empty nights', () => {
    const reading = { id: 'one', sleepDate: '2026-09-29' } as CpapReading;
    const period = rollingCpapPeriod('7D', 0, new Date(2026, 9, 1), [reading]);
    expect(cpapPeriodBounds(period)).toEqual({ start: '2026-09-24', end: '2026-09-30' });
    expect(cpapPeriodAxis(period)).toHaveLength(7);
    expect(cpapPeriodReadings([reading], period)).toEqual([reading]);
  });
});
