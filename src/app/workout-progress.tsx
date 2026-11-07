import { Href, router } from 'expo-router';
import { useState } from 'react';
import { BodyPartTiles } from '@/components/body-part-tiles';
import { WorkoutCard, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { fromKg, workoutElapsedMs, workoutReps, workoutSets, workoutVolumeKg } from '@/lib/workouts';
import { useTrackers } from '@/state/tracker-context';

export default function WorkoutProgress() {
  const { workoutSessions = [], workoutSettings } = useTrackers();
  const [today] = useState(() => new Date());
  const unit = workoutSettings?.weightUnit ?? 'lb';
  const sessions = workoutSessions.filter((item) => !!item.endedAt);
  const duration = sessions.reduce((sum, item) => sum + workoutElapsedMs(item), 0);
  const volume = sessions.reduce((sum, item) => sum + workoutVolumeKg(item), 0);
  const exercises = [...new Map(sessions.flatMap((session) => session.exercises.map((entry) => [entry.exerciseId, entry.name] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const weeks = Array.from({ length: 4 }, (_, offset) => {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset * 7 + 1);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7);
    return { start, count: sessions.filter((session) => Date.parse(session.endedAt!) >= start.getTime() && Date.parse(session.endedAt!) < end.getTime()).length };
  }).reverse();
  return <WorkoutPage><WorkoutTitle>Strength progress</WorkoutTitle>{!sessions.length ? <WorkoutCard><WorkoutText>Finish your first workout to see real strength trends. No sample data is shown.</WorkoutText></WorkoutCard> : <>
    <WorkoutCard><WorkoutText>{sessions.length} sessions · {Math.round(duration / 60000)} min · {sessions.reduce((sum, session) => sum + workoutSets(session).length, 0)} sets · {sessions.reduce((sum, session) => sum + workoutReps(session), 0)} reps</WorkoutText><WorkoutText>{Math.round(fromKg(volume, unit)).toLocaleString()} {unit} logged external-load volume · {duration ? Math.round(fromKg(volume, unit) / (duration / 60000)) : 0} {unit}/min density</WorkoutText><WorkoutText>Volume includes completed warm-up sets; strength-record weights and estimated 1RM exclude warm-ups. Bodyweight resistance is not inferred.</WorkoutText></WorkoutCard>
    <WorkoutCard><WorkoutTitle>Consistency</WorkoutTitle><WorkoutText>{weeks.filter((week) => week.count).length} of 4 recent weeks with workouts</WorkoutText>{weeks.map((week) => <WorkoutText key={week.start.toISOString()}>Week of {week.start.toLocaleDateString()} · {week.count} sessions</WorkoutText>)}</WorkoutCard>
    <WorkoutCard><WorkoutTitle>Strength by body part</WorkoutTitle><WorkoutText>Estimated strength change since you first logged each area. Tap one for its chart.</WorkoutText><BodyPartTiles sessions={sessions} /></WorkoutCard>
    <WorkoutCard><WorkoutTitle>Exercise charts</WorkoutTitle><WorkoutText>Each exercise has its own history, records and actual 1RM log.</WorkoutText>{exercises.map(([id, name]) => <WorkoutRow key={id} title={name} subtitle="Top weight · volume · reps · 1RM" onPress={() => router.push(`/workout-exercise-progress?id=${id}` as Href)} />)}</WorkoutCard>
  </>}</WorkoutPage>;
}
