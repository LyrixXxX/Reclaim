import { habitMilestones } from './habit-milestones';
import { HistoricalEntry, Tracker } from '@/models/tracker';

const tracker: Tracker = { id: 'test', name: 'Test', icon: '', color: '#fff', mode: 'abstinence', startedAt: '2026-01-01T12:00:00' };
const entry = (date: string, outcome: HistoricalEntry['outcome'], value?: number): HistoricalEntry => ({ id: date, trackerId: 'test', eventDate: date, outcome, value, recordedAt: `${date}T12:00:00Z` });

describe('habit milestones', () => {
  test('awards every fixed threshold and repeats without overwriting earned dates', () => {
    const awards = habitMilestones(tracker, [], undefined, new Date(2027, 0, 2, 12));
    expect(awards.find((award) => award.days === 1)?.dates).toEqual(['2026-01-02']);
    expect(awards.find((award) => award.days === 7)?.dates).toHaveLength(52);
    expect(awards.find((award) => award.days === 30)?.dates).toHaveLength(12);
    expect(awards.find((award) => award.days === 365)?.dates).toEqual(['2027-01-01']);
  });

  test('a lapse preserves prior awards and starts a new qualifying run', () => {
    const awards = habitMilestones(tracker, [entry('2026-01-10', 'lapse')], undefined, new Date(2026, 0, 20, 12));
    expect(awards.find((award) => award.days === 1)?.dates).toEqual(['2026-01-02', '2026-01-12']);
    expect(awards.find((award) => award.days === 7)?.dates).toEqual(['2026-01-08', '2026-01-18']);
    expect(awards.find((award) => award.days === 30)?.dates).toEqual([]);
  });

  test('backfilled missing data prevents an inferred quitting award', () => {
    expect(habitMilestones(tracker, [entry('2026-01-05', 'no_data')], undefined, new Date(2026, 0, 8, 12)).find((award) => award.days === 7)?.dates).toEqual([]);
  });

  test('positive daily habits need the configured goal and do not infer missing days', () => {
    const positive = { ...tracker, mode: 'habit' as const, frequencyCount: 2, frequencyPeriod: 'day' as const };
    const entries = Array.from({ length: 8 }, (_, index) => entry(`2026-01-${String(index + 1).padStart(2, '0')}`, 'stayed_on_plan', index === 3 ? 1 : 2));
    expect(habitMilestones(positive, entries, undefined, new Date(2026, 0, 8, 12)).find((award) => award.days === 7)?.dates).toEqual([]);
    entries[3] = entry('2026-01-04', 'stayed_on_plan', 2);
    const earned = habitMilestones(positive, entries, undefined, new Date(2026, 0, 8, 12));
    expect(earned.find((award) => award.days === 1)?.dates).toEqual(['2026-01-01']);
    expect(earned.find((award) => award.days === 7)?.dates).toEqual(['2026-01-07']);
  });

  test('positive weekly habits earn a badge only when a complete week meets its goal', () => {
    const positive = { ...tracker, mode: 'habit' as const, frequencyCount: 2, frequencyPeriod: 'week' as const };
    const entries = [entry('2026-01-06', 'stayed_on_plan', 2), entry('2026-01-13', 'stayed_on_plan', 2)];
    expect(habitMilestones(positive, entries, undefined, new Date(2026, 0, 9, 12)).find((award) => award.days === 7)?.dates).toEqual([]);
    expect(habitMilestones(positive, entries, undefined, new Date(2026, 0, 18, 12)).find((award) => award.days === 7)?.dates).toEqual(['2026-01-11', '2026-01-18']);
  });
});
