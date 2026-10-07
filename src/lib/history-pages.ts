export const HISTORY_PAGE_SIZE = 7;

export function initialHistoryPage(itemCount: number, startAt: 'first' | 'last' = 'first', pageSize = HISTORY_PAGE_SIZE) {
  return startAt === 'last' ? Math.max(0, Math.ceil(itemCount / pageSize) - 1) : 0;
}

/** Presentation only: never truncate the stored records or chart input. */
export function historyPage<T>(items: readonly T[], requestedPage: number, pageSize = HISTORY_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.max(0, Math.min(pageCount - 1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
  const start = page * pageSize;
  return { page, pageCount, items: items.slice(start, start + pageSize), total: items.length, first: items.length ? start + 1 : 0, last: Math.min(start + pageSize, items.length) };
}
