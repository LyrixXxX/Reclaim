import { createFreshState } from './onboarding';
import { swapHabitOrder } from './habit-order';
import { Tracker } from '@/models/tracker';

const tracker = (id: string, mode: Tracker['mode'], archived = false): Tracker => ({ id, name: id, icon: '•', color: '#fff', mode, archived, startedAt: '2026-01-01T00:00:00' });

test('reorders quitting trackers without changing their records or other sections', () => {
  const state = { ...createFreshState(), trackers: [tracker('nicotine', 'abstinence'), tracker('sugar', 'reduction'), tracker('caffeine', 'abstinence'), tracker('walk', 'habit')] };
  const next = swapHabitOrder(state, 'nicotine', 'caffeine');
  expect(next.trackers.map((item) => item.id)).toEqual(['caffeine', 'sugar', 'nicotine', 'walk']);
  expect(next.trackers[0]).toBe(state.trackers[2]);
  expect(next.trackers[2]).toBe(state.trackers[0]);
  expect(swapHabitOrder(state, 'nicotine', 'sugar')).toBe(state);
});

test('will not move archived trackers or missing ids', () => {
  const state = { ...createFreshState(), trackers: [tracker('a', 'abstinence'), tracker('b', 'abstinence', true)] };
  expect(swapHabitOrder(state, 'a', 'b')).toBe(state);
  expect(swapHabitOrder(state, 'a', 'missing')).toBe(state);
});
