import { createStartupHandoff, startupFadeOptions, startupSurface } from './startup';

describe('branded startup handoff', () => {
  test.each([
    [false, false, false, true, 'loading'],
    [false, true, false, true, 'storage-error'],
    [true, false, false, true, 'loading'],
    [true, false, true, true, 'lock'],
    [true, false, true, false, 'app'],
  ] as const)('selects the safe surface for storage=%s error=%s lockReady=%s locked=%s', (hydrated, failed, ready, locked, expected) => {
    expect(startupSurface(hydrated, failed, ready, locked)).toBe(expected);
  });
  test('dismisses on first layout without waiting for storage or successful authentication', () => {
    const hide = jest.fn();
    const layout = createStartupHandoff(hide);
    expect(hide).not.toHaveBeenCalled();
    layout();
    expect(hide).toHaveBeenCalledTimes(1);
  });
  test('subsequent tab layouts, unlocks, retries, or foreground layouts cannot replay the handoff', () => {
    const hide = jest.fn();
    const layout = createStartupHandoff(hide);
    for (let i = 0; i < 8; i++) layout();
    expect(hide).toHaveBeenCalledTimes(1);
  });
  test('reduced motion disables the optional fade; normal exit is 400ms', () => {
    expect(startupFadeOptions(true)).toEqual({ fade: false, duration: 0 });
    expect(startupFadeOptions(false)).toEqual({ fade: true, duration: 400 });
  });
});
