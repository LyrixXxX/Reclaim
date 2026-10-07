import { createSeedState } from '@/data/seed';
import { formatLocalStartDate, formatLocalStartDateTime } from './date-format';

describe('tracker start date displays', () => {
  const trackers = createSeedState().trackers;

  test.each([
    ['marijuana', 'Started Jul 20, 2026', 'Abstinence started Jul 20, 2026 at 12:00 AM'],
    ['porn', 'Started Jul 23, 2026', 'Abstinence started Jul 23, 2026 at 12:00 AM'],
    ['nicotine', 'Reduction started Jul 20, 2026', 'Reduction started Jul 20, 2026 at 12:00 AM'],
    ['caffeine', 'Reduction started Jul 20, 2026', 'Reduction started Jul 20, 2026 at 12:00 AM'],
  ])('formats the seeded %s start date in local time', (id, cardText, detailText) => {
    const tracker = trackers.find((item) => item.id === id);
    expect(tracker?.startedAt).toBeDefined();

    const prefix = tracker?.mode === 'abstinence' ? 'Started' : 'Reduction started';
    const detailPrefix = tracker?.mode === 'abstinence'
      ? 'Abstinence started'
      : 'Reduction started';

    expect(`${prefix} ${formatLocalStartDate(tracker!.startedAt!)}`).toBe(cardText);
    expect(`${detailPrefix} ${formatLocalStartDateTime(tracker!.startedAt!)}`).toBe(detailText);
  });
});
