import type { TrackerState } from '@/models/tracker';

import { HOME_CARDS, hiddenCardsLast, HomeCardId, moveHomeCard, normalizeHiddenHomeCards, normalizeHomeCardOrder, reorderForVisibility } from './home-cards';
import { migratePreferences } from './preferences';

const all = HOME_CARDS.map((card) => card.id) as HomeCardId[];

test('anyone who has not chosen an order keeps the current layout', () => {
  expect(normalizeHomeCardOrder(undefined)).toEqual(all);
  expect(migratePreferences({ trackers: [], checkIns: [] } as unknown as TrackerState).preferences?.homeCardOrder).toEqual(all);
});

test('a saved order is kept, junk is dropped and new cards land at the end', () => {
  const order = normalizeHomeCardOrder(['weight', 'nope', 'weight', 'progress']);
  expect(order.slice(0, 2)).toEqual(['weight', 'progress']);
  expect(order).toHaveLength(all.length);
  expect(new Set(order).size).toBe(all.length);
});

test('hidden cards ignore anything unknown', () => {
  expect(normalizeHiddenHomeCards(['badge', 'nope', 'badge'])).toEqual(['badge']);
  expect(normalizeHiddenHomeCards('badge')).toEqual([]);
});

test('weight can move to the very top', () => {
  expect(moveHomeCard(all, 'weight', -all.length)[0]).toBe('weight');
});

test('moves stop at either end', () => {
  expect(moveHomeCard(all, 'quit', -1)).toEqual(all);
  expect(moveHomeCard(all, 'weight', 1)).toEqual(all);
});

test('a move skips over cards this person cannot see', () => {
  const available: HomeCardId[] = ['progress', 'nutrition', 'weight'];
  const moved = moveHomeCard(all, 'weight', -1, available);
  expect(moved.filter((id) => available.includes(id))).toEqual(['progress', 'weight', 'nutrition']);
  expect(moved.indexOf('quit')).toBe(all.indexOf('quit'));
  expect(moved.indexOf('badge')).toBe(all.indexOf('badge'));
});

test('turned-off cards sort below the rest, keeping their order', () => {
  expect(hiddenCardsLast(['quit', 'weather', 'progress', 'weight'], ['weather', 'quit'])).toEqual(['progress', 'weight', 'quit', 'weather']);
});

test('a card turned off drops to the very bottom', () => {
  expect(reorderForVisibility(['quit', 'weather', 'progress', 'weight'], ['weight'], 'quit', false)).toEqual(['weather', 'progress', 'weight', 'quit']);
});

test('a card turned back on joins the end of the visible cards', () => {
  expect(reorderForVisibility(['progress', 'weight', 'quit', 'weather'], ['quit', 'weather'], 'weather', true)).toEqual(['progress', 'weight', 'weather', 'quit']);
});
