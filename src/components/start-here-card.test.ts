import { DEFAULT_PREFERENCES, migratePreferences } from '@/lib/preferences';
import { TrackerState } from '@/models/tracker';
import { startHereSteps } from './start-here-card';

const sections = { ...DEFAULT_PREFERENCES.visibleSections, goals: true, routes: true, workouts: true, nutrition: true, weight: true };
const base = { trackers: [], checkIns: [] } as unknown as TrackerState;

describe('start here', () => {
  test('lists a step for each visible section, marked used after its first record', () => {
    const steps = startHereSteps({ ...base, weightEntries: [{ id: 'w', date: '2026-11-01', weight: 80, unit: 'kg', recordedAt: '' }] } as TrackerState, sections);
    expect(steps.map((step) => `${step.id}:${step.used}`)).toEqual(['habit:false', 'route:false', 'workout:false', 'food:false', 'weight:true']);
    expect(startHereSteps(base, { ...sections, workouts: false, routes: false }).map((step) => step.id)).toEqual(['habit', 'food', 'weight']);
  });

  test('a workout only counts once it is finished', () => {
    const started = { ...base, workoutSessions: [{ id: 's', name: 'Push', startedAt: '2026-11-01T10:00:00Z', pausedMs: 0, exercises: [] }] } as unknown as TrackerState;
    expect(startHereSteps(started, sections).find((step) => step.id === 'workout')?.used).toBe(false);
    const finished = { ...base, workoutSessions: [{ id: 's', name: 'Push', startedAt: '2026-11-01T10:00:00Z', endedAt: '2026-11-01T11:00:00Z', pausedMs: 0, exercises: [] }] } as unknown as TrackerState;
    expect(startHereSteps(finished, sections).find((step) => step.id === 'workout')?.used).toBe(true);
  });

  test('progress, minimize and dismiss survive loading', () => {
    const loaded = migratePreferences({ ...base, preferences: { ...DEFAULT_PREFERENCES, startHere: { done: ['food', 'food', 7 as unknown as string], collapsed: true, dismissed: false } } });
    expect(loaded.preferences?.startHere).toEqual({ done: ['food'], collapsed: true, dismissed: undefined });
  });
});
