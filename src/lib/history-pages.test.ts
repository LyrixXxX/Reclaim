import { historyPage, HISTORY_PAGE_SIZE, initialHistoryPage } from './history-pages';

describe('shared seven-entry history pages', () => {
  const records = Array.from({ length: 23 }, (_, id) => ({ id, date: '2026-09-22' }));
  test('shows seven entries per page with a shorter final page', () => {
    expect(HISTORY_PAGE_SIZE).toBe(7);
    expect(historyPage(records, 0)).toMatchObject({ first: 1, last: 7, pageCount: 4, total: 23 });
    expect(historyPage(records, 3)).toMatchObject({ first: 22, last: 23, page: 3 });
  });
  test('Activity histories can show five entries without changing the shared default', () => {
    expect(historyPage(records, 0, 5)).toMatchObject({ first: 1, last: 5, pageCount: 5 });
    expect(historyPage(records, 4, 5).items.map((item) => item.id)).toEqual([20, 21, 22]);
    expect(initialHistoryPage(23, 'last', 5)).toBe(4);
    expect(historyPage(records, 0).items).toHaveLength(7);
  });
  test('can open weight history on its newest page without changing other histories', () => {
    expect(initialHistoryPage(142, 'last')).toBe(20);
    expect(historyPage(records, initialHistoryPage(records.length, 'last')).items.at(-1)?.id).toBe(22);
    expect(initialHistoryPage(records.length)).toBe(0);
    expect(initialHistoryPage(0, 'last')).toBe(0);
  });
  test('all records remain reachable exactly once, including multiple records on one day', () => {
    const visited = Array.from({ length: 4 }, (_, page) => historyPage(records, page).items).flat();
    expect(visited).toEqual(records);
    expect(new Set(visited.map((item) => item.id)).size).toBe(23);
  });
  test('handles empty, short and exact-multiple histories', () => {
    expect(historyPage([], 9)).toEqual({ items: [], page: 0, pageCount: 1, total: 0, first: 0, last: 0 });
    expect(historyPage(records.slice(0, 3), 0).items).toHaveLength(3);
    expect(historyPage(records.slice(0, 14), 1)).toMatchObject({ pageCount: 2, first: 8, last: 14 });
  });
  test('clamps invalid pages and deletions from the final page safely', () => {
    expect(historyPage(records, -1).page).toBe(0);
    expect(historyPage(records, NaN).page).toBe(0);
    expect(historyPage(records, 100).page).toBe(3);
    expect(historyPage(records.slice(0, 21), 3)).toMatchObject({ page: 2, first: 15, last: 21 });
  });
  test('edits are visible on older pages without changing source order or truncating data', () => {
    const original = JSON.stringify(records);
    const updated = records.map((item) => item.id === 9 ? { ...item, date: '2026-08-01' } : item);
    expect(historyPage(updated, 1).items.find((item) => item.id === 9)?.date).toBe('2026-08-01');
    expect(JSON.stringify(records)).toBe(original);
    expect(updated).toHaveLength(23);
  });
});
