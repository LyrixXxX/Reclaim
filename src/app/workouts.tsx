import { Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { MainScreenHeader } from '@/components/main-screen-header';
import { WorkoutTrendChart } from '@/components/workout-trend-chart';
import { WorkoutButton, WorkoutCard, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { formatMiles } from '@/lib/activity-units';
import { exerciseProgress } from '@/lib/workout-analytics';
import { dashboardStart, DashboardRange, recentWeeks, routineProgress, RoutineMetric, routineValue, trainingTotals } from '@/lib/fitness-dashboard';
import { fromKg, recentStrengthRecords, workoutElapsedMs, workoutSets } from '@/lib/workouts';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

const ranges: Record<DashboardRange, string> = { week: 'This week', month: 'This month', '3m': '3 months', '6m': '6 months', year: 'This year', all: 'All time' };
const metrics: Record<RoutineMetric, string> = { volume: 'Volume', sets: 'Sets', reps: 'Reps', duration: 'Minutes', exercises: 'Exercises' };
type RoutineRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';
const chips = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 };
const stats = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 };

export default function WorkoutsHome() {
  const { activeWorkout, workoutSessions = [], workoutRoutines = [], activityRoutes = [], actualOneRepMaxes = [], beginWorkout, workoutSettings } = useTrackers();
  const [range, setRange] = useState<DashboardRange>('week');
  const [comparison, setComparison] = useState<'duration' | 'sessions'>('duration');
  const [routineId, setRoutineId] = useState<string>();
  const [routineMetric, setRoutineMetric] = useState<RoutineMetric>('volume');
  const [routineRange, setRoutineRange] = useState<RoutineRange>('3M');
  const [selectedSession, setSelectedSession] = useState<string>();
  const unit = workoutSettings?.weightUnit ?? 'lb';
  const now = new Date();
  const sessions = useMemo(() => workoutSessions.filter((item) => !!item.endedAt).sort((a, b) => b.endedAt!.localeCompare(a.endedAt!)), [workoutSessions]);
  const totals = trainingTotals(sessions, activityRoutes, dashboardStart(range, now), now);
  const weeks = recentWeeks(sessions, activityRoutes, now);
  const routine = workoutRoutines.find((item) => item.id === routineId) ?? workoutRoutines[0];
  const points = routine ? routineProgress(sessions, routine.id) : [];
  const cutoff = new Date(now.getFullYear(), now.getMonth() - ({ '1M': 1, '3M': 3, '6M': 6, '1Y': 12, ALL: 1200 }[routineRange]), now.getDate());
  const visiblePoints = points.filter((point) => routineRange === 'ALL' || Date.parse(point.at) >= cutoff.getTime());
  const assigned = workoutRoutines.filter((item) => item.weekdays?.includes(now.getDay()));
  const recentRecords = useMemo(() => { const seen = new Set<string>(); return recentStrengthRecords(sessions).filter((item) => { const key = `${item.name}:${item.at.slice(0, 10)}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3); }, [sessions]);
  const highlights = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const session of sessions) for (const entry of session.exercises) if (entry.sets.length) counts.set(entry.exerciseId, { name: entry.name, count: (counts.get(entry.exerciseId)?.count ?? 0) + 1 });
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3).map(([id, info]) => ({ id, name: info.name, latest: exerciseProgress(sessions, id).at(-1), previous: exerciseProgress(sessions, id).at(-2), actual: actualOneRepMaxes.filter((item) => item.exerciseId === id).reduce((best, item) => Math.max(best, item.weightKg), 0) }));
  }, [sessions, actualOneRepMaxes]);
  const volume = (kg: number) => `${Math.round(fromKg(kg, unit)).toLocaleString()} ${unit}`;
  const minutes = (value: number) => `${Math.round(value).toLocaleString()} min`;
  const launch = (selected: typeof workoutRoutines[number]) => { if (activeWorkout) return Alert.alert('Workout already active', 'Finish or discard the current session before starting another.'); beginWorkout(selected.name, selected); router.push('/workout-session' as Href); };
  const currentWeek = weeks.at(-1)?.totals;
  const previousWeek = weeks.at(-2)?.totals;
  const latestRoutineValue = points.length ? routineValue(points.at(-1)!, routineMetric) : 0;
  const previousRoutineValue = points.length > 1 ? routineValue(points.at(-2)!, routineMetric) : null;
  const routineDelta = previousRoutineValue === null ? null : latestRoutineValue - previousRoutineValue;
  return <WorkoutPage><MainScreenHeader title="Workouts" subtitle="Strength and cardio activity side by side, from logs saved on this device." accent={colors.workoutsNav} />
    {activeWorkout ? <WorkoutCard><WorkoutTitle>Workout in progress</WorkoutTitle><WorkoutText>{activeWorkout.name} · {workoutSets(activeWorkout).length} sets logged</WorkoutText><WorkoutButton label="Resume workout" onPress={() => router.push('/workout-session' as Href)} /></WorkoutCard> : <WorkoutButton label={assigned[0] ? `Start ${assigned[0].name}` : 'Start workout'} onPress={() => assigned[0] ? launch(assigned[0]) : router.push('/workout-routines' as Href)} />}
    {!!assigned.length && <WorkoutCard><WorkoutText>Scheduled today</WorkoutText>{assigned.map((item) => <WorkoutRow key={item.id} title={item.name} subtitle={`${item.exercises.length} exercises · tap to start`} onPress={() => launch(item)} />)}</WorkoutCard>}
    {!workoutRoutines.length && <WorkoutCard><WorkoutText>Create a routine with at least one exercise to start training.</WorkoutText></WorkoutCard>}
    <WorkoutButton label="Saved routines" secondary onPress={() => router.push('/workout-routines' as Href)} /><WorkoutButton label="Build a training week" secondary onPress={() => router.push('/workout-plan' as Href)} />

    <WorkoutCard><WorkoutTitle>Training overview</WorkoutTitle><View style={chips}>{(Object.keys(ranges) as DashboardRange[]).map((item) => <Chip key={item} label={ranges[item]} selected={range === item} onPress={() => setRange(item)} />)}</View><View style={stats}><Stat label="Strength sessions" value={String(totals.strengthSessions)} /><Stat label="Cardio routes" value={String(totals.cardioSessions)} /><Stat label="Strength time" value={minutes(totals.strengthMinutes)} /><Stat label="Cardio time" value={minutes(totals.cardioMinutes)} /><Stat label="Cardio distance" value={formatMiles(totals.cardioMeters)} /><Stat label="External-load volume" value={volume(totals.volumeKg)} /></View><WorkoutText>Strength and cardio time may overlap; they are not added into one unique total.</WorkoutText></WorkoutCard>

    <WorkoutCard><WorkoutTitle>Strength vs. cardio</WorkoutTitle><View style={chips}><Chip label="Minutes" selected={comparison === 'duration'} onPress={() => setComparison('duration')} /><Chip label="Sessions" selected={comparison === 'sessions'} onPress={() => setComparison('sessions')} /></View>{weeks.every((week) => !week.totals.strengthSessions && !week.totals.cardioSessions) ? <WorkoutText>Finish a workout or save a route to see your weekly balance.</WorkoutText> : weeks.map((week) => {
      const strength = comparison === 'duration' ? week.totals.strengthMinutes : week.totals.strengthSessions;
      const cardio = comparison === 'duration' ? week.totals.cardioMinutes : week.totals.cardioSessions;
      const max = Math.max(1, ...weeks.flatMap((item) => comparison === 'duration' ? [item.totals.strengthMinutes, item.totals.cardioMinutes] : [item.totals.strengthSessions, item.totals.cardioSessions]));
      return <View key={week.start.toISOString()} style={{ gap: 4 }}><WorkoutText>Week of {week.start.toLocaleDateString()}</WorkoutText><Bar label="Strength" value={strength} max={max} color={colors.workoutsNav} /><Bar label="Cardio" value={cardio} max={max} color={colors.activityNav} /></View>;
    })}<WorkoutText>Teal: strength · blue: cardio. Both series show {comparison === 'duration' ? 'minutes' : 'session counts'}.</WorkoutText></WorkoutCard>

    <WorkoutCard><WorkoutTitle>Weekly fitness breakdown</WorkoutTitle><WorkoutText>This week so far / previous full week. The current week is incomplete.</WorkoutText><View style={stats}><Stat label="Strength workouts" value={`${currentWeek?.strengthSessions ?? 0} / ${previousWeek?.strengthSessions ?? 0}`} /><Stat label="Completed sets" value={`${currentWeek?.sets ?? 0} / ${previousWeek?.sets ?? 0}`} /><Stat label="Repetitions" value={`${currentWeek?.reps ?? 0} / ${previousWeek?.reps ?? 0}`} /><Stat label="Strength time" value={`${minutes(currentWeek?.strengthMinutes ?? 0)} / ${minutes(previousWeek?.strengthMinutes ?? 0)}`} /><Stat label="Training volume" value={`${volume(currentWeek?.volumeKg ?? 0)} / ${volume(previousWeek?.volumeKg ?? 0)}`} /><Stat label="Cardio sessions" value={`${currentWeek?.cardioSessions ?? 0} / ${previousWeek?.cardioSessions ?? 0}`} /><Stat label="Cardio time" value={`${minutes(currentWeek?.cardioMinutes ?? 0)} / ${minutes(previousWeek?.cardioMinutes ?? 0)}`} /><Stat label="Cardio distance" value={`${formatMiles(currentWeek?.cardioMeters ?? 0)} / ${formatMiles(previousWeek?.cardioMeters ?? 0)}`} /></View><WorkoutText>Cardio uses saved GPS routes; steps remain separate.</WorkoutText></WorkoutCard>

    <WorkoutCard><WorkoutTitle>Routine progress</WorkoutTitle>{!routine ? <WorkoutText>Create a routine to begin tracking its progress.</WorkoutText> : <><View style={chips}>{workoutRoutines.map((item) => <Chip key={item.id} label={item.name} selected={routine.id === item.id} onPress={() => { setRoutineId(item.id); setSelectedSession(undefined); }} />)}</View><View style={chips}>{(Object.keys(metrics) as RoutineMetric[]).map((item) => <Chip key={item} label={metrics[item]} selected={routineMetric === item} onPress={() => setRoutineMetric(item)} />)}</View><View style={chips}>{(['1M', '3M', '6M', '1Y', 'ALL'] as RoutineRange[]).map((item) => <Chip key={item} label={item} selected={routineRange === item} onPress={() => setRoutineRange(item)} />)}</View>{!points.length ? <WorkoutText>Complete this routine once to establish a baseline.</WorkoutText> : <><WorkoutTrendChart points={visiblePoints.map((point) => ({ id: point.id, date: point.at, value: routineMetric === 'volume' ? fromKg(point.volumeKg, unit) : routineValue(point, routineMetric) }))} unit={routineMetric === 'volume' ? unit : routineMetric === 'duration' ? 'min' : metrics[routineMetric].toLowerCase()} onSelect={(point) => setSelectedSession(point.id)} /><WorkoutText>Latest: {new Date(points.at(-1)!.at).toLocaleDateString()} · {routineMetric === 'volume' ? volume(points.at(-1)!.volumeKg) : Math.round(latestRoutineValue)}{previousRoutineValue === null ? ' · first-session baseline' : ` · previous ${routineMetric === 'volume' ? volume(points.at(-2)!.volumeKg) : Math.round(previousRoutineValue)}`}</WorkoutText>{routineDelta !== null && <WorkoutText>{routineDelta > 0 ? 'Increased' : routineDelta < 0 ? 'Decreased' : 'Unchanged'} by {routineMetric === 'volume' ? volume(Math.abs(routineDelta)) : Math.round(Math.abs(routineDelta))}{previousRoutineValue ? ` (${Math.round(Math.abs(routineDelta / previousRoutineValue) * 100)}%)` : ''} versus the previous session.</WorkoutText>}{selectedSession && <WorkoutButton label="Open selected workout" secondary onPress={() => router.push(`/workout-history?id=${selectedSession}` as Href)} />}<WorkoutText>Volume changes show workload, not guaranteed strength gains. Editing a routine never changes completed sessions.</WorkoutText></>}</>}</WorkoutCard>

    <WorkoutCard><WorkoutTitle>Exercise highlights</WorkoutTitle>{highlights.length ? highlights.map((item) => <WorkoutRow key={item.id} title={item.name} subtitle={`Latest top: ${item.latest?.topWeightKg ? volume(item.latest.topWeightKg) : 'no load logged'}${item.previous?.topWeightKg ? ` · previous ${volume(item.previous.topWeightKg)}` : ''}${item.actual ? ` · confirmed 1RM ${volume(item.actual)}` : ''}`} onPress={() => router.push(`/workout-exercise-progress?id=${item.id}` as Href)} />) : <WorkoutText>Logged exercises appear here after a workout.</WorkoutText>}<WorkoutButton label="View all exercise progress" secondary onPress={() => router.push('/workout-progress' as Href)} /></WorkoutCard>
    <WorkoutCard><WorkoutTitle>Recent personal records</WorkoutTitle>{recentRecords.length ? recentRecords.map((item) => <WorkoutText key={`${item.name}-${item.at}`}>{item.name} · new top working weight {volume(item.weightKg)} · {new Date(item.at).toLocaleDateString()}</WorkoutText>) : <WorkoutText>New top working weights appear here as you train.</WorkoutText>}</WorkoutCard>
    <WorkoutCard><WorkoutTitle>Recent workouts</WorkoutTitle>{sessions.slice(0, 3).map((session) => <WorkoutRow key={session.id} title={session.name} subtitle={`${new Date(session.endedAt!).toLocaleDateString()} · ${workoutSets(session).length} sets · ${Math.round(workoutElapsedMs(session) / 60_000)} min`} onPress={() => router.push(`/workout-history?id=${session.id}` as Href)} />)}{!sessions.length && <WorkoutText>Your first completed workout will appear here.</WorkoutText>}<WorkoutButton label="Workout history" secondary onPress={() => router.push('/workout-history' as Href)} /></WorkoutCard>
    <WorkoutRow title="Exercise library" subtitle="Browse and add custom movements" onPress={() => router.push('/workout-exercises' as Href)} /><WorkoutRow title="Workout settings" onPress={() => router.push('/workout-settings' as Href)} />
  </WorkoutPage>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 40, borderRadius: 10, paddingHorizontal: 11, justifyContent: 'center', backgroundColor: selected ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: selected ? colors.background : colors.text, fontWeight: '700' }}>{label}</Text></Pressable>; }
function Stat({ label, value }: { label: string; value: string }) { return <View style={{ width: '48%', minWidth: 130, flexGrow: 1, borderRadius: 12, padding: 11, backgroundColor: colors.surfaceRaised, gap: 5 }}><Text style={{ color: colors.textMuted, fontSize: 11 }}>{label}</Text><Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{value}</Text></View>; }
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) { return <View accessibilityLabel={`${label}: ${Math.round(value)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={{ color: colors.textMuted, width: 54, fontSize: 11 }}>{label}</Text><View style={{ flex: 1, height: 8, borderRadius: 5, backgroundColor: colors.surfaceRaised }}><View style={{ width: `${Math.max(0, Math.min(100, value / max * 100))}%`, height: 8, borderRadius: 5, backgroundColor: color }} /></View><Text style={{ color: colors.text, width: 40, textAlign: 'right', fontSize: 11 }}>{Math.round(value)}</Text></View>; }
