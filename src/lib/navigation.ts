export type HorizontalOverflowMetrics = {
  contentWidth: number;
  viewportWidth: number;
  offset: number;
};

export function horizontalOverflowState({ contentWidth, viewportWidth, offset }: HorizontalOverflowMetrics, tolerance = 2) {
  const maximumOffset = Math.max(0, contentWidth - viewportWidth);
  return {
    canScrollLeft: maximumOffset > tolerance && offset > tolerance,
    canScrollRight: maximumOffset > tolerance && offset < maximumOffset - tolerance,
  };
}

/** Sections shown directly in the bar; the rest live under More. */
export const PINNED_SECTION_COUNT = 3;

/**
 * Splits the pager's routes into the bar and the More sheet. Home is always first. With three or
 * fewer sections everything fits, so Settings takes the last slot and there is no More.
 */
export function bottomBarLayout<T extends { name: string }>(routes: readonly T[]) {
  const home = routes.find((route) => route.name === 'index');
  const settings = routes.find((route) => route.name === 'settings');
  const sections = routes.filter((route) => route.name !== 'index' && route.name !== 'settings');
  if (sections.length <= PINNED_SECTION_COUNT) {
    return { bar: [home, ...sections, settings].filter((route): route is T => !!route), more: [] as T[] };
  }
  return {
    bar: [home, ...sections.slice(0, PINNED_SECTION_COUNT)].filter((route): route is T => !!route),
    more: [...sections.slice(PINNED_SECTION_COUNT), ...(settings ? [settings] : [])],
  };
}
