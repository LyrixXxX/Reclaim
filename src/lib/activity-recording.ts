import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ActivityPoint, ActivityRoute } from '@/models/tracker';
import { activeRouteDurationMs, estimatedRouteCalories, routeDistanceMeters, validActivityPoint } from './activity';
import { nextMileAlert, notifyRouteMile } from './route-mile-alerts';
import { addMotionFix, closeMotion, freshMotionState, motionTotals, MotionState, TimeInterval } from './activity-motion';
import { canBridgeAutoPause, lostFixCoverage, nearbyRouteFix, plausibleRouteFix } from './route-continuity';
import { readTodaySteps } from './activity-steps';
import { localDateKey } from './progress';
import { updateRouteSteps, type RouteStepState } from './route-steps';

const TASK = 'reclaim-active-route';
const KEY = 'reclaim:active-route:v1';
export type ActiveRoute = RouteStepState & { id: string; photos?: string[]; kind: ActivityRoute['kind']; startedAt: string; endedAt?: string; pausedAt?: string; pausedMs: number; segment: number; points: ActivityPoint[]; estimateWeightKg?: number; mileAlerts?: boolean; lastMileAlert?: number; lastMileAlertAttemptAt?: number; mileAlertError?: string; autoPause?: boolean; autoPausedAt?: string; autoPauseIntervals?: TimeInterval[]; motion?: MotionState; manualPauseIntervals?: TimeInterval[]; lastReliableFix?: ActivityPoint; autoPauseCoverageBroken?: boolean; autoPauseResumePoints?: ActivityPoint[] };

export async function readActiveRoute(): Promise<ActiveRoute | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ActiveRoute; } catch { return null; }
}

async function saveActiveRoute(route: ActiveRoute | null) {
  if (route) await AsyncStorage.setItem(KEY, JSON.stringify(route));
  else await AsyncStorage.removeItem(KEY);
}

async function captureRouteSteps(route: ActiveRoute, reset = false) {
  const result = await readTodaySteps(false);
  updateRouteSteps(route, localDateKey(), result.status === 'available' ? result.count : undefined, reset);
}

TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const route = await readActiveRoute();
  if (!route || route.pausedAt || route.endedAt) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  let mileToNotify: number | null = null;
  for (const location of locations) {
    route.motion ??= freshMotionState();
    const fix: ActivityPoint = { latitude: location.coords.latitude, longitude: location.coords.longitude, timestamp: location.timestamp, accuracy: location.coords.accuracy, altitudeMeters: location.coords.altitude, altitudeAccuracyMeters: location.coords.altitudeAccuracy, segment: route.segment ?? 0 };
    const priorReliable = route.lastReliableFix;
    const plausible = plausibleRouteFix(priorReliable, fix);
    if (plausible) {
      const coverageGap = lostFixCoverage(priorReliable, fix);
      if (route.autoPausedAt) {
        // Keep receiving fixes during a stop without counting their wobble as
        // distance. A gap or displacement away from the stop forbids a bridge.
        if (coverageGap || (route.motion.candidate !== 'moving' && route.points.length > 0 && !nearbyRouteFix(route.points.at(-1), fix))) route.autoPauseCoverageBroken = true;
      } else if (coverageGap && route.points.length > 0) {
        // No reliable samples support drawing the intervening path.
        route.segment = (route.segment ?? 0) + 1;
        fix.segment = route.segment;
      }
      route.lastReliableFix = fix;
    }
    const wasStopped = route.motion.status === 'stopped';
    const wasAutoPaused = !!route.autoPausedAt;
    addMotionFix(route.motion, { latitude: location.coords.latitude, longitude: location.coords.longitude, timestamp: location.timestamp, accuracy: location.coords.accuracy, speed: location.coords.speed, segment: route.segment ?? 0 });
    if (route.autoPause && !wasStopped && route.motion.status === 'stopped') {
      route.autoPausedAt = new Date(location.timestamp).toISOString();
      route.autoPauseCoverageBroken = !plausible;
      route.autoPauseResumePoints = [];
    } else if (wasAutoPaused && route.motion.candidate === 'moving' && plausible) {
      route.autoPauseResumePoints ??= [];
      route.autoPauseResumePoints.push(fix);
      if (route.autoPauseResumePoints.length > 16) {
        route.autoPauseResumePoints.shift();
        route.autoPauseCoverageBroken = true;
      }
    } else if (wasAutoPaused && route.motion.status !== 'moving') {
      route.autoPauseResumePoints = [];
    }
    let resumedPoints: ActivityPoint[] | undefined;
    if (route.autoPause && route.motion.status === 'moving' && route.autoPausedAt) {
      resumedPoints = [...(route.autoPauseResumePoints ?? []), fix];
      const first = resumedPoints[0];
      route.autoPauseIntervals ??= [];
      route.autoPauseIntervals.push({ startedAt: route.autoPausedAt, endedAt: new Date(location.timestamp).toISOString() });
      delete route.autoPausedAt;
      if (!canBridgeAutoPause(route.points.at(-1), first, route.autoPauseCoverageBroken)) {
        route.segment = (route.segment ?? 0) + 1;
        if (route.motion.lastFix) route.motion.lastFix.segment = route.segment;
        if (route.lastReliableFix) route.lastReliableFix.segment = route.segment;
      }
      delete route.autoPauseCoverageBroken;
      delete route.autoPauseResumePoints;
    }
    if (route.autoPausedAt || (route.autoPause && route.motion.candidate === 'stopped')) continue;
    for (const recordedFix of resumedPoints ?? [fix]) {
      const point: ActivityPoint = { ...recordedFix, segment: route.segment ?? 0 };
      if (validActivityPoint(point, route.points.at(-1))) {
        route.points.push(point);
        if (route.mileAlerts) {
          const crossed = nextMileAlert(routeDistanceMeters(route.points), route.lastMileAlert ?? 0);
          if (crossed !== null) mileToNotify = crossed;
        }
      }
    }
  }
  if (locations.length) { await captureRouteSteps(route); await saveActiveRoute(route); }
  if (mileToNotify !== null && Date.now() - (route.lastMileAlertAttemptAt ?? 0) >= 30_000) {
    try {
      await notifyRouteMile(mileToNotify, route.id);
      route.lastMileAlert = mileToNotify;
      delete route.lastMileAlertAttemptAt;
      delete route.mileAlertError;
    } catch (error) {
      route.lastMileAlertAttemptAt = Date.now();
      route.mileAlertError = error instanceof Error ? error.message : 'Could not deliver the notification. Check Android notification settings.';
    }
    await saveActiveRoute(route);
  }
});

async function startUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    // Motion accounting needs fixes during a stop as well as while moving.
    distanceInterval: 0,
    timeInterval: 5000,
    foregroundService: { notificationTitle: 'Reclaim is recording your route', notificationBody: 'Tap to view or finish your walk or hike.', killServiceOnDestroy: false },
    pausesUpdatesAutomatically: false,
  });
}

async function stopUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
}
export async function isRouteRecording() { return Location.hasStartedLocationUpdatesAsync(TASK); }
export async function readPendingRoute(): Promise<ActivityRoute | null> {
  const route = await readActiveRoute();
  return route?.endedAt ? completedRoute(route) : null;
}

export async function startRoute(kind: ActiveRoute['kind'], estimateWeightKg?: number, mileAlerts = false, autoPause = false): Promise<ActiveRoute> {
  if (await readActiveRoute()) throw new Error('Finish the current route before starting another.');
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Location access is needed to record a route.');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) throw new Error('Allow background location so your route continues when the screen is locked.');
  let notificationPermissionGranted = true;
  if (mileAlerts) {
    const notifications = await Notifications.getPermissionsAsync();
    notificationPermissionGranted = notifications.granted || (notifications.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  }
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on phone location services before starting.');
  const route: ActiveRoute = { id: `route-${Date.now()}`, kind, startedAt: new Date().toISOString(), pausedMs: 0, segment: 0, points: [], estimateWeightKg, mileAlerts, lastMileAlert: 0, mileAlertError: notificationPermissionGranted ? undefined : 'Allow Reclaim notifications in Android settings to receive mile alerts.', autoPause, motion: freshMotionState(), manualPauseIntervals: [], autoPauseIntervals: [] };
  await captureRouteSteps(route, true);
  await saveActiveRoute(route);
  try { await startUpdates(); } catch (error) { await saveActiveRoute(null); throw error; }
  return route;
}

export async function pauseRoute(): Promise<ActiveRoute> {
  const route = await readActiveRoute();
  if (!route) throw new Error('No route is active.');
  if (route.endedAt) throw new Error('Finish reviewing the completed route first.');
  if (!route.pausedAt) {
    await stopUpdates();
    await captureRouteSteps(route);
    route.pausedAt = new Date().toISOString();
    if (route.autoPausedAt) {
      route.autoPauseIntervals ??= [];
      route.autoPauseIntervals.push({ startedAt: route.autoPausedAt, endedAt: route.pausedAt });
      delete route.autoPausedAt;
      delete route.autoPauseCoverageBroken;
      delete route.autoPauseResumePoints;
    }
    if (route.motion) closeMotion(route.motion, Date.parse(route.pausedAt));
    await saveActiveRoute(route);
  }
  return route;
}

export async function resumeRoute(): Promise<ActiveRoute> {
  const route = await readActiveRoute();
  if (!route) throw new Error('No route is active.');
  if (route.endedAt) throw new Error('Finish reviewing the completed route first.');
  if (route.pausedAt) {
    const resumedAt = new Date().toISOString();
    route.pausedMs += Math.max(0, Date.parse(resumedAt) - Date.parse(route.pausedAt));
    route.manualPauseIntervals ??= [];
    route.manualPauseIntervals.push({ startedAt: route.pausedAt, endedAt: resumedAt });
    route.segment = (route.segment ?? 0) + 1;
    delete route.lastReliableFix;
    delete route.pausedAt;
    await captureRouteSteps(route, true);
    await saveActiveRoute(route);
  } else if (!await Location.hasStartedLocationUpdatesAsync(TASK)) {
    route.segment = (route.segment ?? 0) + 1;
    delete route.lastReliableFix;
    await saveActiveRoute(route);
  }
  await startUpdates();
  return route;
}

export async function finishRoute(): Promise<ActivityRoute> {
  const route = await readActiveRoute();
  if (!route) throw new Error('No route is active.');
  if (route.endedAt) return completedRoute(route);
  await stopUpdates();
  if (!route.pausedAt) await captureRouteSteps(route);
  route.endedAt = new Date().toISOString();
  if (route.autoPausedAt) {
    route.autoPauseIntervals ??= [];
    route.autoPauseIntervals.push({ startedAt: route.autoPausedAt, endedAt: route.endedAt });
    delete route.autoPausedAt;
  }
  if (route.motion) closeMotion(route.motion, Date.parse(route.endedAt));
  await saveActiveRoute(route);
  return completedRoute(route);
}

function completedRoute(route: ActiveRoute): ActivityRoute {
  const endedAt = route.endedAt!;
  const distanceMeters = routeDistanceMeters(route.points);
  const pausedMs = route.pausedMs + (route.pausedAt ? Date.parse(endedAt) - Date.parse(route.pausedAt) : 0);
  const activeMs = activeRouteDurationMs(route, Date.parse(endedAt));
  const times = motionTotals(route.motion, activeMs);
  const estimatedCalories = estimatedRouteCalories(distanceMeters, route.motion ? times.movingMs ?? 0 : activeMs, route.estimateWeightKg, route.kind);
  const result: ActivityRoute = { id: route.id, photos: route.photos, kind: route.kind, startedAt: route.startedAt, endedAt, pausedMs, distanceMeters, points: route.points, movingMs: times.movingMs ?? undefined, stoppedMs: times.stoppedMs ?? undefined, unclassifiedMs: times.unclassifiedMs, manualPauseIntervals: [...(route.manualPauseIntervals ?? []), ...(route.pausedAt ? [{ startedAt: route.pausedAt, endedAt }] : [])], stationaryIntervals: route.motion?.stationaryIntervals ?? [], autoPauseIntervals: route.autoPauseIntervals ?? [], estimateWeightKg: route.estimateWeightKg, estimatedCalories: estimatedCalories ?? undefined, routeSteps: route.routeSteps, routeStepStatus: route.routeStepStatus };
  return result;
}

export async function clearFinishedRoute() { await saveActiveRoute(null); }

/** Keeps photos added on the summary page with the finished route, so they survive the app closing before it's saved. */
export async function setPendingRoutePhotos(photos: string[]) {
  const route = await readActiveRoute();
  if (route?.endedAt) await saveActiveRoute({ ...route, photos });
}
