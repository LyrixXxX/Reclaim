import { Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatChange } from '@/components/body-part-tiles';
import { NotepadPill } from '@/components/workout-notepad';
import { WorkoutTrendChart } from '@/components/workout-trend-chart';
import { WorkoutCard, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { BodyPart, BODY_PART_LABELS, BODY_PARTS, detailMusclesFor, muscleLabel } from '@/lib/body-parts';
import { bodyPartTrend } from '@/lib/body-part-progress';
import { MuscleGroup } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';

type Range = '3M' | '6M' | '1Y' | 'ALL';
const RANGE_MONTHS: Record<Range, number> = { '3M': 3, '6M': 6, '1Y': 12, ALL: 1200 };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function BodyPartProgress() {
  const params = useLocalSearchParams<{ part?: string }>();
  const part = (BODY_PARTS as string[]).includes(params.part ?? '') ? params.part as BodyPart : 'chest';
  const { workoutSessions = [] } = useTrackers();
  const [range, setRange] = useState<Range>('ALL');
  const [detail, setDetail] = useState<MuscleGroup | 'all'>('all');
  const trend = useMemo(() => bodyPartTrend(workoutSessions, part, detail === 'all' ? undefined : detail), [workoutSessions, part, detail]);
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - RANGE_MONTHS[range], now.getDate()).getTime();
  const visible = trend.points.filter((point) => range === 'ALL' || Date.parse(point.date) >= cutoff);
  const details = detailMusclesFor(part);
  const label = BODY_PART_LABELS[part];

  return <WorkoutPage>
    <Stack.Screen options={{ title: `${label} strength` }} />
    <WorkoutTitle>{trend.changePercent === null ? label : `${label} ${formatChange(trend.changePercent)}`}</WorkoutTitle>
    <WorkoutText>{trend.changePercent === null
      ? `No ${label.toLowerCase()} lifts with weight or reps logged yet. Tag exercises as ${label} and log a few workouts to see your trend.`
      : `Estimated strength across your ${label.toLowerCase()} exercises, compared with when you first logged each one (since ${shortDate(trend.firstDate!)}).`}</WorkoutText>
    {details.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {(['all', ...details] as const).map((item) => <NotepadPill key={item} label={item === 'all' ? `All ${label.toLowerCase()}` : muscleLabel(item)} active={detail === item} onPress={() => setDetail(item)} />)}
    </View>}
    {trend.points.length > 0 && <WorkoutCard>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(Object.keys(RANGE_MONTHS) as Range[]).map((item) => <NotepadPill key={item} label={item === 'ALL' ? 'All' : item} active={range === item} onPress={() => setRange(item)} />)}</View>
      <WorkoutTrendChart points={visible} unit="%" baseline={0} />
      <WorkoutText>Each point is a week. Exercises you skip that week keep their last value, so switching movements does not swing the line.</WorkoutText>
    </WorkoutCard>}
    {trend.exercises.length > 0 && <WorkoutCard>
      <WorkoutTitle>Exercises</WorkoutTitle>
      {trend.exercises.map((exercise) => <WorkoutRow key={exercise.exerciseId} title={`${exercise.name}  ${formatChange(exercise.changePercent)}`}
        subtitle={`${muscleLabel(exercise.muscle)} · ${exercise.sessions} ${exercise.sessions === 1 ? 'session' : 'sessions'} · since ${shortDate(exercise.firstDate)}`}
        onPress={() => router.push(`/workout-exercise-progress?id=${encodeURIComponent(exercise.exerciseId)}` as Href)} />)}
    </WorkoutCard>}
    <WorkoutText>Timed holds, carries, and assisted movements are logged but not charted here, since they have no comparable strength number.</WorkoutText>
  </WorkoutPage>;
}
