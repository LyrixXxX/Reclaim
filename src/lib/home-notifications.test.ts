import { DEFAULT_PREFERENCES } from './preferences';
import { homeNotifications } from './home-notifications';
import { Tracker, TrackerState } from '@/models/tracker';

const NOW = new Date(2026, 10, 3, 12);
const quit = (id: string, days: number): Tracker => ({ id, name: id, icon: '•', color: '#fff', mode: 'abstinence', startedAt: new Date(NOW.getTime() - days * 86_400_000 - 3_600_000).toISOString() } as Tracker);
const state = (extra: Partial<TrackerState> = {}) => ({ trackers: [], checkIns: [], preferences: { ...DEFAULT_PREFERENCES, visibleSections: { ...DEFAULT_PREFERENCES.visibleSections, goals: true } }, ...extra }) as TrackerState;

describe('home notifications', () => {
  test('to-dos come first and can’t be cleared', () => {
    const notes = homeNotifications(state(), [{ id: 'supplement-x-08:00', title: 'Supplement: Vitamin D', detail: '8:00 AM · Not logged yet', href: '/supplements' }], NOW);
    expect(notes).toEqual([expect.objectContaining({ id: 'supplement-x-08:00', kind: 'action', dismissible: false })]);
  });

  test('a quit milestone reached today shows until it is cleared', () => {
    const base = state({ trackers: [quit('Nicotine', 30), quit('Sugar', 31)] });
    expect(homeNotifications(base, [], NOW).map((note) => note.title)).toEqual(['1 month free of nicotine']);
    const cleared = state({ trackers: [quit('Nicotine', 30)], preferences: { ...base.preferences!, dismissedNotices: ['milestone-Nicotine-30'] } });
    expect(homeNotifications(cleared, [], NOW)).toEqual([]);
  });
});
