import { clearFinishedRoute, finishRoute, isRouteRecording, pauseRoute, readActiveRoute, readPendingRoute, resumeRoute, startRoute } from './activity-recording';

const mockStorage = new Map<string, string>();
let mockRunning = false;
let mockLocationTask: ((event: { data?: { locations: unknown[] }; error?: unknown }) => Promise<void>) | undefined;
const mockMileNotification = jest.fn((_mile: number, _routeId: string) => Promise.resolve());
const mockReadTodaySteps = jest.fn(() => Promise.resolve({ status: 'available', count: 1000, incomplete: false }));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => Promise.resolve(mockStorage.get(key) ?? null),
  setItem: (key: string, value: string) => { mockStorage.set(key, value); return Promise.resolve(); },
  removeItem: (key: string) => { mockStorage.delete(key); return Promise.resolve(); },
}));
jest.mock('expo-task-manager', () => ({ defineTask: (_name: string, callback: typeof mockLocationTask) => { mockLocationTask = callback; } }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  hasStartedLocationUpdatesAsync: () => Promise.resolve(mockRunning),
  startLocationUpdatesAsync: () => { mockRunning = true; return Promise.resolve(); },
  stopLocationUpdatesAsync: () => { mockRunning = false; return Promise.resolve(); },
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: true }),
  requestBackgroundPermissionsAsync: () => Promise.resolve({ granted: true }),
  hasServicesEnabledAsync: () => Promise.resolve(true),
}));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: () => Promise.resolve({ granted: true }) }));
jest.mock('./route-mile-alerts', () => ({ nextMileAlert: (distance: number, previous: number) => Math.floor(distance / 1609.344) > previous ? Math.floor(distance / 1609.344) : null, notifyRouteMile: (mile: number, routeId: string) => mockMileNotification(mile, routeId) }));
jest.mock('./activity-steps', () => ({ readTodaySteps: () => mockReadTodaySteps() }));

beforeEach(() => { mockStorage.clear(); mockRunning = false; mockMileNotification.mockClear(); mockReadTodaySteps.mockReset(); mockReadTodaySteps.mockResolvedValue({ status: 'available', count: 1000, incomplete: false }); });

test('records points, pauses, resumes, and preserves finished route until explicitly cleared', async () => {
  await startRoute('run', 90);
  expect(await isRouteRecording()).toBe(true);
  const base = Date.now();
  await mockLocationTask?.({ data: { locations: [
    { coords: { latitude: 41.88, longitude: -87.63, accuracy: 5 }, timestamp: base },
    { coords: { latitude: 41.8801, longitude: -87.63, accuracy: 5 }, timestamp: base + 5000 },
  ] } });
  const paused = await pauseRoute();
  expect(paused.pausedAt).toBeTruthy();
  expect(await isRouteRecording()).toBe(false);
  await resumeRoute();
  expect(await isRouteRecording()).toBe(true);
  const finished = await finishRoute();
  expect(finished.kind).toBe('run');
  expect(finished.points).toHaveLength(2);
  expect(finished.distanceMeters).toBeGreaterThan(0);
  expect(await readPendingRoute()).toEqual(finished);
  await expect(startRoute('walk')).rejects.toThrow('Finish the current route');
  await clearFinishedRoute();
  expect(await readPendingRoute()).toBeNull();
});

test('route steps update from the phone counter without counting manual-pause steps', async () => {
  for (const count of [1000, 1012, 1020, 1050, 1060, 1062]) mockReadTodaySteps.mockResolvedValueOnce({ status: 'available', count, incomplete: false });
  await startRoute('walk');
  const base = Date.now();
  await mockLocationTask?.({ data: { locations: [{ coords: { latitude: 41.88, longitude: -87.63, accuracy: 5 }, timestamp: base }] } });
  expect((await readActiveRoute())?.routeSteps).toBe(12);
  await pauseRoute();
  await resumeRoute();
  await mockLocationTask?.({ data: { locations: [{ coords: { latitude: 41.8801, longitude: -87.63, accuracy: 5 }, timestamp: base + 5000 }] } });
  const finished = await finishRoute();
  expect(finished.routeSteps).toBe(32);
  expect(finished.routeStepStatus).toBe('available');
});

test('optional mile alerts fire once per crossed mile and survive task restarts', async () => {
  const route = await startRoute('walk', 80, true);
  const base = Date.now();
  const sample = (index: number) => ({ coords: { latitude: 41.88 + index * 0.0001, longitude: -87.63, accuracy: 5 }, timestamp: base + index * 5_000 });
  await mockLocationTask?.({ data: { locations: Array.from({ length: 147 }, (_, index) => sample(index)) } });
  expect(mockMileNotification).toHaveBeenCalledWith(1, route.id);
  await mockLocationTask?.({ data: { locations: [sample(147)] } });
  expect(mockMileNotification).toHaveBeenCalledTimes(1);
  await pauseRoute();
  await resumeRoute();
  await mockLocationTask?.({ data: { locations: Array.from({ length: 140 }, (_, index) => sample(index + 148)) } });
  expect(mockMileNotification).toHaveBeenCalledTimes(1);
  await mockLocationTask?.({ data: { locations: Array.from({ length: 12 }, (_, index) => sample(index + 288)) } });
  expect(mockMileNotification).toHaveBeenNthCalledWith(2, 2, route.id);
});

test('a failed mile notification remains eligible for a later retry', async () => {
  const route = await startRoute('walk', 80, true);
  const base = Date.now();
  const sample = (index: number) => ({ coords: { latitude: 41.88 + index * 0.0001, longitude: -87.63, accuracy: 5 }, timestamp: base + index * 5_000 });
  mockMileNotification.mockRejectedValueOnce(new Error('Notification channel blocked'));
  await mockLocationTask?.({ data: { locations: Array.from({ length: 147 }, (_, index) => sample(index)) } });
  const failed = await readActiveRoute();
  expect(failed?.lastMileAlert).toBe(0);
  expect(failed?.mileAlertError).toMatch(/channel blocked/i);
  mockStorage.set('reclaim:active-route:v1', JSON.stringify({ ...failed, lastMileAlertAttemptAt: Date.now() - 31_000 }));
  await mockLocationTask?.({ data: { locations: [sample(147)] } });
  expect(mockMileNotification).toHaveBeenCalledTimes(2);
  expect(mockMileNotification).toHaveBeenLastCalledWith(1, route.id);
  expect((await readActiveRoute())?.lastMileAlert).toBe(1);
  expect((await readActiveRoute())?.mileAlertError).toBeUndefined();
});

test('routes without opted-in alerts never notify', async () => {
  await startRoute('walk');
  const base = Date.now();
  await mockLocationTask?.({ data: { locations: [
    { coords: { latitude: 41.88, longitude: -87.63, accuracy: 5 }, timestamp: base },
    { coords: { latitude: 41.895, longitude: -87.63, accuracy: 5 }, timestamp: base + 600_000 },
  ] } });
  expect(mockMileNotification).not.toHaveBeenCalled();
});

test('auto-pause keeps GPS subscribed and manual pause cannot auto-resume', async () => {
  await startRoute('hike', 80, false, true);
  const base = Date.now() - 30_000;
  const location = (seconds: number, latitude: number) => ({ coords: { latitude, longitude: -87.63, accuracy: 5, speed: 0 }, timestamp: base + seconds * 1000 });
  await mockLocationTask?.({ data: { locations: [location(0, 41.88), location(5, 41.88), location(10, 41.88), location(15, 41.88)] } });
  expect((await readActiveRoute())?.autoPausedAt).toBeTruthy();
  expect(await isRouteRecording()).toBe(true);
  const paused = await pauseRoute();
  expect(paused.pausedAt).toBeTruthy();
  expect(await isRouteRecording()).toBe(false);
  await mockLocationTask?.({ data: { locations: [location(20, 41.8802), location(25, 41.8803)] } });
  expect((await readActiveRoute())?.pausedAt).toBeTruthy();
  expect(await isRouteRecording()).toBe(false);
  const finished = await finishRoute();
  expect(finished.manualPauseIntervals).toHaveLength(1);
  expect(finished.autoPauseIntervals).toHaveLength(1);
});

test('auto-pause reconnects an ordinary stop with reliable GPS coverage', async () => {
  await startRoute('walk', 80, false, true);
  const base = Date.now() - 40_000;
  const started = await readActiveRoute();
  mockStorage.set('reclaim:active-route:v1', JSON.stringify({ ...started, startedAt: new Date(base).toISOString() }));
  const location = (seconds: number, latitude: number) => ({ coords: { latitude, longitude: -87.63, accuracy: 5, speed: 0 }, timestamp: base + seconds * 1000 });
  await mockLocationTask?.({ data: { locations: [location(0, 41.88), location(5, 41.88), location(10, 41.88), location(15, 41.88)] } });
  expect((await readActiveRoute())?.autoPausedAt).toBeTruthy();
  await mockLocationTask?.({ data: { locations: [location(20, 41.8801), location(25, 41.8802)] } });
  const resumed = await readActiveRoute();
  expect(resumed?.autoPausedAt).toBeUndefined();
  expect(resumed?.segment).toBe(0);
  expect(resumed?.autoPauseIntervals).toHaveLength(1);
  expect(await isRouteRecording()).toBe(true);
  const finished = await finishRoute();
  expect(finished.stoppedMs).toBeGreaterThan(0);
  expect(finished.points.at(-1)?.segment).toBe(0);
  expect(new Set(finished.points.map((point) => point.segment))).toEqual(new Set([0]));
});

test('five-minute stationary pause keeps one segment when reliable fixes continue', async () => {
  await startRoute('hike', 80, false, true);
  const base = Date.now() - 400_000;
  const started = await readActiveRoute();
  mockStorage.set('reclaim:active-route:v1', JSON.stringify({ ...started, startedAt: new Date(base).toISOString() }));
  const location = (seconds: number, latitude: number, accuracy = 5) => ({ coords: { latitude, longitude: -87.63, accuracy, speed: 0 }, timestamp: base + seconds * 1000 });
  await mockLocationTask?.({ data: { locations: [location(0, 41.88), location(5, 41.88012), location(10, 41.88024), location(15, 41.88024), location(20, 41.88024), location(25, 41.88024), location(30, 41.88024)] } });
  expect((await readActiveRoute())?.autoPausedAt).toBeTruthy();
  for (let second = 35; second <= 325; second += 5) {
    await mockLocationTask?.({ data: { locations: [location(second, 41.88024)] } });
  }
  await mockLocationTask?.({ data: { locations: [location(330, 41.88034), location(335, 41.88044)] } });
  const finished = await finishRoute();
  expect(finished.autoPauseIntervals).toHaveLength(1);
  expect(finished.points.length).toBeGreaterThan(2);
  expect(new Set(finished.points.map((point) => point.segment))).toEqual(new Set([0]));
  expect(finished.distanceMeters).toBeGreaterThan(30);
  expect(finished.stoppedMs).toBeGreaterThan(0);
  expect(await readPendingRoute()).toEqual(finished);
});

test('weak fixes and a real tracking interruption do not draw a false bridge', async () => {
  await startRoute('walk', 80, false, true);
  const base = Date.now() - 140_000;
  const location = (seconds: number, latitude: number, accuracy = 5) => ({ coords: { latitude, longitude: -87.63, accuracy, speed: 0 }, timestamp: base + seconds * 1000 });
  await mockLocationTask?.({ data: { locations: [location(0, 41.88), location(5, 41.88012), location(10, 41.88024), location(15, 41.88024), location(20, 41.88024), location(25, 41.88024), location(30, 41.88024)] } });
  expect((await readActiveRoute())?.autoPausedAt).toBeTruthy();
  await mockLocationTask?.({ data: { locations: [location(35, 41.88024, 100), location(90, 41.8812), location(95, 41.8813)] } });
  const finished = await finishRoute();
  expect(finished.points.some((point) => point.segment === 1)).toBe(true);
  expect(finished.distanceMeters).toBeLessThan(100);
});

test('manual pause always remains a separate segment', async () => {
  await startRoute('walk', 80, false, true);
  const base = Date.now() - 40_000;
  const location = (seconds: number, latitude: number) => ({ coords: { latitude, longitude: -87.63, accuracy: 5, speed: 0 }, timestamp: base + seconds * 1000 });
  await mockLocationTask?.({ data: { locations: [location(0, 41.88), location(5, 41.88012)] } });
  await pauseRoute();
  await resumeRoute();
  await mockLocationTask?.({ data: { locations: [location(20, 41.88024), location(25, 41.88036)] } });
  const finished = await finishRoute();
  expect(finished.points.map((point) => point.segment)).toContain(1);
  expect(finished.manualPauseIntervals).toHaveLength(1);
});

test('continuous walking with Auto Pause enabled remains a single line', async () => {
  await startRoute('walk', 80, false, true);
  const base = Date.now() - 120_000;
  const locations = Array.from({ length: 21 }, (_, index) => ({ coords: { latitude: 41.88 + index * 0.0001, longitude: -87.63, accuracy: 5, speed: 1.5 }, timestamp: base + index * 5_000 }));
  await mockLocationTask?.({ data: { locations } });
  expect((await readActiveRoute())?.autoPausedAt).toBeUndefined();
  const finished = await finishRoute();
  expect(new Set(finished.points.map((point) => point.segment))).toEqual(new Set([0]));
  expect(finished.distanceMeters).toBeGreaterThan(200);
});

test('brief weak GPS under tree cover does not force a gap after a stop', async () => {
  await startRoute('hike', 80, false, true);
  const base = Date.now() - 100_000;
  const location = (seconds: number, latitude: number, accuracy = 5) => ({ coords: { latitude, longitude: -87.63, accuracy, speed: 0 }, timestamp: base + seconds * 1000 });
  await mockLocationTask?.({ data: { locations: [location(0, 41.88), location(5, 41.88012), location(10, 41.88024), location(15, 41.88024), location(20, 41.88025, 25), location(25, 41.88024, 25), location(30, 41.88024)] } });
  expect((await readActiveRoute())?.autoPausedAt).toBeTruthy();
  await mockLocationTask?.({ data: { locations: [location(35, 41.88025, 80), location(40, 41.88024), location(45, 41.88034), location(50, 41.88044)] } });
  const finished = await finishRoute();
  expect(new Set(finished.points.map((point) => point.segment))).toEqual(new Set([0]));
});

test('validated movement fixes during Auto Pause resume are kept in the route', async () => {
  await startRoute('walk', 80, false, true);
  const base = Date.now() - 70_000;
  const location = (seconds: number, latitude: number) => ({ coords: { latitude, longitude: -87.63, accuracy: 5, speed: 0 }, timestamp: base + seconds * 1000 });
  await mockLocationTask?.({ data: { locations: [location(0, 41.88), location(5, 41.88012), location(10, 41.88024), location(15, 41.88024), location(20, 41.88024), location(25, 41.88024), location(30, 41.88024)] } });
  expect((await readActiveRoute())?.autoPausedAt).toBeTruthy();
  await mockLocationTask?.({ data: { locations: [location(32, 41.88032), location(34, 41.88040)] } });
  const finished = await finishRoute();
  expect(finished.points.map((point) => point.latitude)).toContain(41.88032);
  expect(finished.points.map((point) => point.latitude)).toContain(41.88040);
  expect(new Set(finished.points.map((point) => point.segment))).toEqual(new Set([0]));
});

test('lost GPS while moving creates a segment instead of counting an unknown straight path', async () => {
  await startRoute('walk');
  const base = Date.now() - 90_000;
  const location = (seconds: number, latitude: number) => ({ coords: { latitude, longitude: -87.63, accuracy: 5, speed: 1.5 }, timestamp: base + seconds * 1000 });
  await mockLocationTask?.({ data: { locations: [location(0, 41.88), location(5, 41.88012)] } });
  await mockLocationTask?.({ data: { locations: [location(60, 41.8812), location(65, 41.88132)] } });
  const finished = await finishRoute();
  expect(finished.points.map((point) => point.segment)).toEqual([0, 0, 1, 1]);
  expect(finished.distanceMeters).toBeLessThan(40);
});
