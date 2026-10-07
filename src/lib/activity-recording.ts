import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ActivityPoint, ActivityRoute } from '@/models/tracker';
import { activeRouteDurationMs, estimatedRouteCalories, routeDistanceMeters, validActivityPoint } from './activity';

const TASK = 'reclaim-active-route';
const KEY = 'reclaim:active-route:v1';
export type ActiveRoute = { id: string; kind: ActivityRoute['kind']; startedAt: string; endedAt?: string; pausedAt?: string; pausedMs: number; segment: number; points: ActivityPoint[]; estimateWeightKg?: number };

export async function readActiveRoute(): Promise<ActiveRoute | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ActiveRoute; } catch { return null; }
}

async function saveActiveRoute(route: ActiveRoute | null) {
  if (route) await AsyncStorage.setItem(KEY, JSON.stringify(route));
  else await AsyncStorage.removeItem(KEY);
}

TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const route = await readActiveRoute();
  if (!route || route.pausedAt || route.endedAt) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  for (const location of locations) {
    const point: ActivityPoint = { latitude: location.coords.latitude, longitude: location.coords.longitude, timestamp: location.timestamp, accuracy: location.coords.accuracy, segment: route.segment ?? 0 };
    if (validActivityPoint(point, route.points.at(-1))) route.points.push(point);
  }
  if (locations.length) await saveActiveRoute(route);
});

async function startUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 5,
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

export async function startRoute(kind: ActiveRoute['kind'], estimateWeightKg?: number): Promise<ActiveRoute> {
  if (await readActiveRoute()) throw new Error('Finish the current route before starting another.');
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Location access is needed to record a route.');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) throw new Error('Allow background location so your route continues when the screen is locked.');
  const notifications = await Notifications.getPermissionsAsync();
  if (!notifications.granted) await Notifications.requestPermissionsAsync();
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on phone location services before starting.');
  const route: ActiveRoute = { id: `route-${Date.now()}`, kind, startedAt: new Date().toISOString(), pausedMs: 0, segment: 0, points: [], estimateWeightKg };
  await saveActiveRoute(route);
  try { await startUpdates(); } catch (error) { await saveActiveRoute(null); throw error; }
  return route;
}

export async function pauseRoute(): Promise<ActiveRoute> {
  const route = await readActiveRoute();
  if (!route) throw new Error('No route is active.');
  if (route.endedAt) throw new Error('Finish reviewing the completed route first.');
  if (!route.pausedAt) { await stopUpdates(); route.pausedAt = new Date().toISOString(); await saveActiveRoute(route); }
  return route;
}

export async function resumeRoute(): Promise<ActiveRoute> {
  const route = await readActiveRoute();
  if (!route) throw new Error('No route is active.');
  if (route.endedAt) throw new Error('Finish reviewing the completed route first.');
  if (route.pausedAt) {
    route.pausedMs += Math.max(0, Date.now() - Date.parse(route.pausedAt));
    route.segment = (route.segment ?? 0) + 1;
    delete route.pausedAt;
    await saveActiveRoute(route);
  } else if (!await Location.hasStartedLocationUpdatesAsync(TASK)) {
    route.segment = (route.segment ?? 0) + 1;
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
  route.endedAt = new Date().toISOString();
  await saveActiveRoute(route);
  return completedRoute(route);
}

function completedRoute(route: ActiveRoute): ActivityRoute {
  const endedAt = route.endedAt!;
  const distanceMeters = routeDistanceMeters(route.points);
  const estimatedCalories = estimatedRouteCalories(distanceMeters, activeRouteDurationMs(route, Date.parse(endedAt)), route.estimateWeightKg, route.kind);
  const result: ActivityRoute = { id: route.id, kind: route.kind, startedAt: route.startedAt, endedAt, pausedMs: route.pausedMs + (route.pausedAt ? Date.parse(endedAt) - Date.parse(route.pausedAt) : 0), distanceMeters, points: route.points, estimateWeightKg: route.estimateWeightKg, estimatedCalories: estimatedCalories ?? undefined };
  return result;
}

export async function clearFinishedRoute() { await saveActiveRoute(null); }
