import { clearFinishedRoute, finishRoute, isRouteRecording, pauseRoute, readPendingRoute, resumeRoute, startRoute } from './activity-recording';

const mockStorage = new Map<string, string>();
let mockRunning = false;
let mockLocationTask: ((event: { data?: { locations: unknown[] }; error?: unknown }) => Promise<void>) | undefined;

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

beforeEach(() => { mockStorage.clear(); mockRunning = false; });

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
