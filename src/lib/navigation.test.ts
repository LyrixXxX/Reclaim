import { horizontalOverflowState } from './navigation';

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
