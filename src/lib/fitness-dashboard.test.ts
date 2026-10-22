import { ActivityRoute, WorkoutSession } from '@/models/tracker';
import { dashboardStart, localWeekStart, recentWeeks, routineProgress, trainingTotals } from './fitness-dashboard';

const session = (id: string, routineId: string, endedAt: string): WorkoutSession => ({
  id, name: 'Push', routineId, startedAt: new Date(Date.parse(endedAt) - 30 * 60_000).toISOString(), endedAt,
  pausedMs: 0, exercises: [{ id: `${id}-exercise`, exerciseId: 'press', name: 'Press', primaryMuscle: 'chest', equipment: 'machine', sets: [{ id: `${id}-set`, kind: 'working', weightKg: 50, reps: 10, completedAt: endedAt }] }],
});
const route = (id: string, endedAt: string): ActivityRoute => ({ id, kind: 'walk', startedAt: new Date(Date.parse(endedAt) - 20 * 60_000).toISOString(), endedAt, pausedMs: 0, distanceMeters: 2000, points: [] });

describe('fitness dashboard calculations', () => {
  const now = new Date(2026, 9, 19, 12);
  const first = session('s1', 'stable-routine-id', '2026-10-19T10:00:00.000Z');
  const second = session('s2', 'stable-routine-id', '2026-10-12T10:00:00.000Z');
  const cardio = route('r1', '2026-10-19T11:00:00.000Z');

  test('uses local calendar week boundaries and keeps strength and cardio separate', () => {
    expect(localWeekStart(now).getDay()).toBe(1);
    expect(dashboardStart('month', now)).toEqual(new Date(2026, 9, 1));
    const totals = trainingTotals([first, first], [cardio, cardio], dashboardStart('week', now), now);
    expect(totals).toMatchObject({ strengthSessions: 1, cardioSessions: 1, strengthMinutes: 30, cardioMinutes: 20, cardioMeters: 2000, volumeKg: 500, sets: 1, reps: 10 });
  });

  test('groups weeks without assuming fixed 24-hour day lengths', () => {
    const weeks = recentWeeks([first, second], [cardio], now, 2);
    expect(weeks.map((week) => week.totals.strengthSessions)).toEqual([1, 1]);
    expect(weeks.map((week) => week.totals.cardioSessions)).toEqual([0, 1]);
  });

  test('tracks a stable routine ID regardless of name and reflects edited history', () => {
    const renamed = { ...first, name: 'Renamed Push' };
    expect(routineProgress([second, renamed], 'stable-routine-id').map((point) => point.id)).toEqual(['s2', 's1']);
    expect(routineProgress([renamed], 'other-id')).toEqual([]);
    const edited = { ...renamed, exercises: [{ ...renamed.exercises[0], sets: [{ ...renamed.exercises[0].sets[0], reps: 12 }] }] };
    expect(routineProgress([edited], 'stable-routine-id')[0].volumeKg).toBe(600);
  });
});
