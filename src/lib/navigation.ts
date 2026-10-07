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
