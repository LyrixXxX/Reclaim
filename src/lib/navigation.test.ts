import { bottomBarLayout, horizontalOverflowState } from './navigation';

describe('horizontal navigation overflow', () => {
  test('shows a right cue when more tabs are off screen', () => {
    expect(horizontalOverflowState({ contentWidth: 360, viewportWidth: 288, offset: 0 })).toEqual({ canScrollLeft: false, canScrollRight: true });
  });

  test('shows both directions while between the edges', () => {
    expect(horizontalOverflowState({ contentWidth: 500, viewportWidth: 288, offset: 80 })).toEqual({ canScrollLeft: true, canScrollRight: true });
  });

  test('hides the right cue at the end', () => {
    expect(horizontalOverflowState({ contentWidth: 360, viewportWidth: 288, offset: 72 })).toEqual({ canScrollLeft: true, canScrollRight: false });
  });

  test('shows no cue when every visible tab fits', () => {
    expect(horizontalOverflowState({ contentWidth: 216, viewportWidth: 288, offset: 0 })).toEqual({ canScrollLeft: false, canScrollRight: false });
  });
});

describe('bottom bar layout', () => {
  const routes = (names: string[]) => names.map((name) => ({ name }));
  test('few sections fit with Settings and no More', () => {
    const layout = bottomBarLayout(routes(['index', 'goals', 'nutrition', 'settings']));
    expect(layout.bar.map((route) => route.name)).toEqual(['index', 'goals', 'nutrition', 'settings']);
    expect(layout.more).toEqual([]);
  });
  test('more than three sections pins the first three and moves the rest, then Settings, to More', () => {
    const layout = bottomBarLayout(routes(['index', 'goals', 'routes', 'activity', 'nutrition', 'workouts', 'settings']));
    expect(layout.bar.map((route) => route.name)).toEqual(['index', 'goals', 'routes', 'activity']);
    expect(layout.more.map((route) => route.name)).toEqual(['nutrition', 'workouts', 'settings']);
  });
});
