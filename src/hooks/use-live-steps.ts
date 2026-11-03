import { useCallback, useSyncExternalStore } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { readActiveRoute } from '@/lib/activity-recording';
import { readTodaySteps, readWalkingIntervals, StepResult } from '@/lib/activity-steps';
import type { HomeWalkingData } from '@/lib/home-overview';
import { localDateKey } from '@/lib/progress';

/** How often the phone's saved step count is re-read while a screen shows it. Reading is a local lookup. */
const STEP_POLL_MS = 2_000;
/** Walking minutes come from the same sensor; re-read them often enough to feel live. */
const WALK_POLL_MS = 5_000;

type Snapshot = { steps: StepResult; walking: HomeWalkingData; readAt: number };

// One shared reading for every screen, so Home and Steps always show the same numbers.
let snapshot: Snapshot = { steps: { status: 'permission-needed' }, walking: { intervals: null }, readAt: 0 };
const listeners = new Set<() => void>();
let watchers = 0;
let walkWatchers = 0;
let stepTimer: ReturnType<typeof setInterval> | undefined;
let walkTimer: ReturnType<typeof setInterval> | undefined;
let appState: AppStateStatus = (AppState.currentState ?? 'active') as AppStateStatus;
let appSubscription: { remove: () => void } | undefined;

const emit = (next: Partial<Snapshot>) => { snapshot = { ...snapshot, ...next }; listeners.forEach((listener) => listener()); };
const sameSteps = (a: StepResult, b: StepResult) => a.status === b.status && a.count === b.count && a.incomplete === b.incomplete && a.message === b.message;

async function refreshSteps() {
  const steps = await readTodaySteps(false);
  if (!sameSteps(steps, snapshot.steps)) emit({ steps, readAt: Date.now() });
}

async function refreshWalking() {
  const date = localDateKey();
  const [intervals, activeRoute] = await Promise.all([readWalkingIntervals(date), readActiveRoute().catch(() => null)]);
  if (JSON.stringify({ date, intervals, activeRoute }) !== JSON.stringify(snapshot.walking)) emit({ walking: { date, intervals, activeRoute }, readAt: Date.now() });
  // Walking minutes depend on the clock as well as new steps, so move it on even when nothing changed.
  else if (Date.now() - snapshot.readAt > 30_000) emit({ readAt: Date.now() });
}

function schedule() {
  const active = appState === 'active';
  if (active && watchers > 0 && !stepTimer) { void refreshSteps(); stepTimer = setInterval(() => { void refreshSteps(); }, STEP_POLL_MS); }
  if ((!active || watchers === 0) && stepTimer) { clearInterval(stepTimer); stepTimer = undefined; }
  if (active && walkWatchers > 0 && !walkTimer) { void refreshWalking(); walkTimer = setInterval(() => { void refreshWalking(); }, WALK_POLL_MS); }
  if ((!active || walkWatchers === 0) && walkTimer) { clearInterval(walkTimer); walkTimer = undefined; }
  if (watchers + walkWatchers > 0 && !appSubscription) {
    appSubscription = AppState.addEventListener('change', (status) => { appState = status; schedule(); });
  } else if (watchers + walkWatchers === 0 && appSubscription) {
    appSubscription.remove(); appSubscription = undefined;
  }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;

/**
 * Today's phone step count (and, when asked, walking intervals), kept current while the screen is in view.
 * Every screen shares one reading, refreshed every couple of seconds and right away when the app returns.
 */
export function useLiveSteps({ enabled = true, walking = false }: { enabled?: boolean; walking?: boolean } = {}) {
  useFocusEffect(useCallback(() => {
    if (!enabled && !walking) return undefined;
    if (enabled) watchers += 1;
    if (walking) walkWatchers += 1;
    schedule();
    return () => {
      if (enabled) watchers -= 1;
      if (walking) walkWatchers -= 1;
      schedule();
    };
  }, [enabled, walking]));
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...current, refresh: refreshSteps };
}
