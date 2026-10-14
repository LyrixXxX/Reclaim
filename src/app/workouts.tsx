import { Href, router } from 'expo-router';
import { Header } from '@/components/header';
import { WorkoutButton, WorkoutCard, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { useTrackers } from '@/state/tracker-context';
import { fromKg, recentStrengthRecords, workoutElapsedMs, workoutSets, workoutVolumeKg } from '@/lib/workouts';
import { useState } from 'react';
import { Alert } from 'react-native';

export default function WorkoutsHome() {
  const { activeWorkout, workoutSessions = [], workoutRoutines = [], beginWorkout, workoutSettings } = useTrackers();
  const sessions = [...workoutSessions].sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
  const [weekStart] = useState(() => Date.now() - 7 * 86_400_000);
  const week = sessions.filter((item) => Date.parse(item.endedAt ?? item.startedAt) >= weekStart);
  const unit = workoutSettings?.weightUnit ?? 'lb';
  const records = recentStrengthRecords(workoutSessions).slice(0, 3);
  const today = new Date().getDay();
  const assigned = workoutRoutines.filter((item) => item.weekdays?.includes(today));
  const launch = (routine: typeof workoutRoutines[number]) => { if (activeWorkout) return Alert.alert('Workout already active', 'Finish or discard the current session before starting a routine.'); beginWorkout(routine.name, routine); router.push('/workout-session' as Href); };
  return <WorkoutPage><Header /><WorkoutTitle>Workouts</WorkoutTitle><WorkoutText>Strength training, your way. Your logs stay on this device.</WorkoutText>
    {activeWorkout ? <WorkoutCard><WorkoutTitle>Workout in progress</WorkoutTitle><WorkoutText>{activeWorkout.name} · {workoutSets(activeWorkout).length} sets logged</WorkoutText><WorkoutButton label="Resume workout" onPress={() => router.push('/workout-session' as Href)} /></WorkoutCard> : <WorkoutButton label="Start empty workout" onPress={() => { beginWorkout('Workout'); router.push('/workout-session' as Href); }} />}
    {!!assigned.length && <WorkoutCard><WorkoutTitle>Assigned for today</WorkoutTitle>{assigned.map((routine) => <WorkoutRow key={routine.id} title={routine.name} subtitle={`${routine.exercises.length} exercises · tap to start`} onPress={() => launch(routine)} />)}</WorkoutCard>}
    <WorkoutButton label="Create a routine" secondary onPress={() => router.push('/workout-routines?create=1' as Href)} />
    <WorkoutCard><WorkoutTitle>Saved routines</WorkoutTitle>{workoutRoutines.slice(0, 3).map((routine) => <WorkoutRow key={routine.id} title={routine.name} subtitle={`${routine.exercises.length} exercises · tap to start`} onPress={() => launch(routine)} />)}{!workoutRoutines.length && <WorkoutText>Build a routine by choosing exercises. Sets and weights come later.</WorkoutText>}<WorkoutButton label="All routines" secondary onPress={() => router.push('/workout-routines' as Href)} /></WorkoutCard>
    <WorkoutCard><WorkoutTitle>Recent workout</WorkoutTitle>{sessions[0] ? <WorkoutRow title={sessions[0].name} subtitle={`${new Date(sessions[0].endedAt!).toLocaleDateString()} · ${workoutSets(sessions[0]).length} sets · ${Math.round(workoutElapsedMs(sessions[0]) / 60000)} min`} onPress={() => router.push('/workout-history' as Href)} /> : <WorkoutText>Your first finished workout will appear here.</WorkoutText>}</WorkoutCard>
    <WorkoutCard><WorkoutTitle>Recent personal records</WorkoutTitle>{records.length ? records.map((item) => <WorkoutText key={`${item.name}-${item.at}`}>{item.name} · {Math.round(fromKg(item.weightKg, unit) * 10) / 10} {unit} · {new Date(item.at).toLocaleDateString()}</WorkoutText>) : <WorkoutText>Records appear as you log heavier working sets for the same exercise.</WorkoutText>}</WorkoutCard>
    <WorkoutCard><WorkoutTitle>This week</WorkoutTitle><WorkoutText>{week.length} sessions · {Math.round(week.reduce((sum, item) => sum + workoutElapsedMs(item), 0) / 60000)} min · {Math.round(week.reduce((sum, item) => sum + workoutVolumeKg(item), 0) * (unit === 'lb' ? 2.2046226218 : 1)).toLocaleString()} {unit} volume</WorkoutText></WorkoutCard>
    <WorkoutRow title="Routines" subtitle="Build and repeat your own plans" onPress={() => router.push('/workout-routines' as Href)} /><WorkoutRow title="Exercise library" subtitle="Browse and add custom movements" onPress={() => router.push('/workout-exercises' as Href)} /><WorkoutRow title="History" onPress={() => router.push('/workout-history' as Href)} /><WorkoutRow title="Progress" onPress={() => router.push('/workout-progress' as Href)} /><WorkoutRow title="Workout settings" onPress={() => router.push('/workout-settings' as Href)} />
  </WorkoutPage>;
}
