import { migratePreferences } from './preferences';
import { TrackerState } from '@/models/tracker';

const { existsSync, readFileSync } = jest.requireActual<{ existsSync: (path: string) => boolean; readFileSync: (path: string, encoding: string) => string }>('node:fs');

const unavailableRoutes = [
  'health', 'health-history', 'doctor-summary', 'medications', 'medication-reminder-settings',
  'labs', 'cpap', 'cpap-history', 'cpap-care', 'cpap-settings', 'cpap-doctor-summary',
];

test('medical screens are absent from the wellness edition router', () => {
  for (const route of unavailableRoutes) expect(existsSync(`src/app/${route}.tsx`)).toBe(false);
  const layout = readFileSync('src/app/_layout.tsx', 'utf8');
  for (const route of unavailableRoutes) expect(layout).not.toContain(`<Stack.Screen name="${route}"`);
});

test('legacy records survive preference migration while medical sections stay unavailable', () => {
  const old: TrackerState = {
    trackers: [], checkIns: [],
    cpapReadings: [{ id: 'night', sleepDate: '2026-10-01', usedMinutes: 200, averagePressure: 6, p95Pressure: 8, ahi: 1, cai: 0, averageLeak: 1, p95Leak: 2, recordedAt: '2026-10-02T08:00:00Z' }],
    preferences: {
      visibleSections: { goals: true, health: true, cpap: true, weight: true, nutrition: true, activity: true },
      visibleHealthModules: { bloodPressure: true, medications: true, labs: true },
      dashboard: [],
    },
  };
  const result = migratePreferences(old);
  expect(result.cpapReadings).toBe(old.cpapReadings);
  expect(result.preferences?.visibleSections).toMatchObject({ health: false, cpap: false });
  expect(result.preferences?.visibleHealthModules).toEqual({ bloodPressure: false, medications: false, labs: false });
});
