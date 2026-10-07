/** Only the first rendered app surface dismisses the native launch screen. */
export function createStartupHandoff(hide: () => void) {
  let dismissed = false;
  return () => {
    if (dismissed) return;
    hide();
    dismissed = true;
  };
}

export function startupSurface(hydrated: boolean, loadFailed: boolean, lockReady: boolean, locked: boolean) {
  if (!hydrated) return loadFailed ? 'storage-error' : 'loading';
  if (!lockReady) return 'loading';
  return locked ? 'lock' : 'app';
}

export function startupFadeOptions(reducedMotion: boolean) {
  return { fade: !reducedMotion, duration: reducedMotion ? 0 : 400 };
}
