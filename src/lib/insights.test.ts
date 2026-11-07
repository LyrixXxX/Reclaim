import { CravingEvent } from '@/models/tracker';
import { crossAreaInsights } from './insights';
import { localDateKey } from './progress';

const NOW = new Date(2026, 10, 3, 12).getTime();
const at = (daysAgo: number, hour: number) => { const d = new Date(NOW - daysAgo * 86_400_000); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const craving = (id: number, daysAgo: number, hour: number, outcome: CravingEvent['outcome'] = 'beaten', helped?: CravingEvent['helped']): CravingEvent => ({ id: String(id), at: at(daysAgo, hour), outcome, helped });

describe('cross-area insights', () => {
  test('says nothing without enough data', () => {
    expect(crossAreaInsights({ cravings: [craving(1, 1, 20)], now: NOW })).toEqual([]);
  });

  test('finds the time of day cravings cluster and the beat rate', () => {
    const cravings = [craving(1, 1, 20, 'beaten', 'walk'), craving(2, 2, 21, 'beaten', 'walk'), craving(3, 3, 19, 'slipped'), craving(4, 4, 9, 'beaten'), craving(5, 5, 20, 'beaten', 'breathing')];
    const ids = crossAreaInsights({ cravings, now: NOW });
    expect(ids.find((item) => item.id === 'craving-time')?.title).toBe('Cravings hit hardest in the evening');
    expect(ids.find((item) => item.id === 'craving-rate')).toMatchObject({ title: 'You beat 80% of your cravings', detail: expect.stringContaining('walking (2') });
  });

  test('compares cravings on days with walks against quiet days', () => {
    const walkDays = [1, 3, 5, 7, 9];
    const routes = walkDays.map((day) => ({ id: `r${day}`, kind: 'walk' as const, startedAt: at(day, 8), endedAt: at(day, 9), pausedMs: 0, distanceMeters: 2000, points: [] }));
    const cravings = [2, 4, 6, 8, 10, 12, 14].map((day, index) => craving(index, day, 20));
    const insight = crossAreaInsights({ cravings, routes, now: NOW }).find((item) => item.id === 'move-less-craving');
    expect(insight?.title).toBe('100% fewer cravings on days you move');
    expect(localDateKey(new Date(routes[0].startedAt))).toBe('2026-11-02');
  });
});
