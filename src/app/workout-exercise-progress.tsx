import { Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { WorkoutTrendChart } from '@/components/workout-trend-chart';
import { WorkoutButton, WorkoutCard, WorkoutInput, WorkoutPage, WorkoutRow, WorkoutText, WorkoutTitle } from '@/components/workout-ui';
import { exerciseProgress, exerciseRecords, recordIsNewActualBest, validWorkoutDate } from '@/lib/workout-analytics';
import { BUILTIN_EXERCISES, fromKg, newId, toKg } from '@/lib/workouts';
import { ActualOneRepMax } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

type Metric = 'weight' | 'volume' | 'reps' | 'estimated' | 'actual' | 'hold' | 'distance' | 'assisted' | 'bodyweight';
type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL';
const ranges: Range[] = ['1M', '3M', '6M', '1Y', 'ALL'];
const metricLabels: Record<Metric, string> = { weight: 'Top weight', volume: 'Exercise volume', reps: 'Reps at weight', estimated: 'Estimated 1RM', actual: 'Actual 1RM', hold: 'Hold duration', distance: 'Carry distance', assisted: 'Best reps', bodyweight: 'Best reps' };
const display = (kg: number, unit: 'lb' | 'kg') => String(Math.round(fromKg(kg, unit) * 10) / 10);

export default function WorkoutExerciseProgress() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { workoutSessions = [], actualOneRepMaxes = [], strengthExercises = [], workoutSettings, saveActualOneRepMax, deleteActualOneRepMax } = useTrackers();
  const unit = workoutSettings?.weightUnit ?? 'lb';
  const exercise = [...BUILTIN_EXERCISES, ...strengthExercises].find((item) => item.id === id);
  const historicalName = workoutSessions.flatMap((session) => session.exercises).find((item) => item.exerciseId === id)?.name;
  const measurement = exercise?.measurementType ?? workoutSessions.flatMap((session) => session.exercises).find((item) => item.exerciseId === id)?.measurementType;
  const strengthMetrics = measurement !== 'timed_hold' && measurement !== 'distance_carry' && measurement !== 'assisted_reps';
  const supportsOneRepMax = strengthMetrics && measurement !== 'bodyweight_reps';
  const [metric, setMetric] = useState<Metric>(measurement === 'timed_hold' ? 'hold' : measurement === 'distance_carry' ? 'distance' : measurement === 'assisted_reps' ? 'assisted' : measurement === 'bodyweight_reps' ? 'bodyweight' : 'weight');
  const visibleMetric = strengthMetrics ? metric : measurement === 'timed_hold' ? 'hold' : measurement === 'distance_carry' ? 'distance' : 'assisted';
  const [range, setRange] = useState<Range>('6M');
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [repWeight, setRepWeight] = useState<number>();
  const [editingId, setEditingId] = useState<string>();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [context, setContext] = useState('');
  const points = useMemo(() => exerciseProgress(workoutSessions, id ?? ''), [workoutSessions, id]);
  const actuals = actualOneRepMaxes.filter((item) => item.exerciseId === id).sort((a, b) => a.date.localeCompare(b.date));
  const records = exerciseRecords(points, actuals);
  const weights = [...new Set(points.flatMap((point) => point.repsByWeight.map((item) => item.weightKg)))].sort((a, b) => b - a);
  const chosenWeight = repWeight ?? weights[0];
  const cutoff = new Date();
  if (range !== 'ALL') cutoff.setMonth(cutoff.getMonth() - ({ '1M': 1, '3M': 3, '6M': 6, '1Y': 12 } as const)[range]);
  const inRange = (value: string) => range === 'ALL' || Date.parse(value) >= cutoff.getTime();
  const chart = visibleMetric === 'actual' ? actuals.filter((item) => inRange(item.date)).map((item) => ({ id: item.id, date: `${item.date}T12:00:00`, value: fromKg(item.weightKg, unit) })) : points.filter((item) => inRange(item.date)).flatMap((item) => {
    const value = visibleMetric === 'weight' ? item.topWeightKg : visibleMetric === 'volume' ? item.volumeKg : visibleMetric === 'estimated' ? item.bestEstimatedOneRepMaxKg : visibleMetric === 'hold' ? item.bestHoldSeconds : visibleMetric === 'distance' ? item.bestDistanceMeters : visibleMetric === 'assisted' || visibleMetric === 'bodyweight' ? item.bestReps : item.repsByWeight.find((entry) => entry.weightKg === chosenWeight)?.reps;
    return value === undefined ? [] : [{ id: item.sessionId, date: item.date, value: visibleMetric === 'reps' || visibleMetric === 'hold' || visibleMetric === 'distance' || visibleMetric === 'assisted' || visibleMetric === 'bodyweight' ? value : fromKg(value, unit) }];
  });
  const lastTwo = chart.slice(-2);
  const singles = workoutSessions.flatMap((session) => session.exercises.filter((entry) => entry.exerciseId === id && !['timed_hold','distance_carry','assisted_reps','bodyweight_reps'].includes(entry.measurementType ?? '')).flatMap((entry) => entry.sets.filter((set) => set.reps === 1 && set.weightKg !== undefined && set.kind !== 'warmup').map((set) => ({ session, set }))));
  const save = (sourceSetId?: string, sourceWeightKg?: number, sourceDate?: string) => {
    const value = sourceWeightKg ?? (weight.trim() ? toKg(Number(weight.replace(',', '.')), unit) : NaN);
    const recordDate = sourceDate ?? date;
    if (!supportsOneRepMax) return Alert.alert('Not applicable', 'One-rep maximum is not calculated for this exercise type.');
    if (!Number.isFinite(value) || value <= 0 || value > 2500 || !validWorkoutDate(recordDate) || recordDate > new Date().toISOString().slice(0, 10)) return Alert.alert('Check actual 1RM', 'Enter a valid completed weight and date (YYYY-MM-DD, not in the future).');
    if (sourceSetId && actuals.some((item) => item.sourceSetId === sourceSetId)) return Alert.alert('Already confirmed', 'This single is already in your actual 1RM history.');
    if (!editingId && actuals.some((item) => item.date === recordDate && item.weightKg === value && !item.sourceSetId)) return Alert.alert('Already recorded', 'This weight and date are already in your confirmed 1RM history.');
    const original = actuals.find((item) => item.id === editingId);
    const record: ActualOneRepMax = { id: sourceSetId ? newId() : editingId ?? newId(), exerciseId: id!, weightKg: value, date: recordDate, notes: notes.trim() || undefined, context: context.trim() || undefined, sourceSetId: sourceSetId ?? original?.sourceSetId };
    const isBest = recordIsNewActualBest(actuals, record);
    saveActualOneRepMax(record); setEditingId(undefined); setWeight(''); setNotes(''); setContext('');
    if (isBest) Alert.alert('New confirmed 1RM best', `${display(value, unit)} ${unit} · ${recordDate}`);
  };
  const edit = (item: ActualOneRepMax) => { setEditingId(item.id); setWeight(display(item.weightKg, unit)); setDate(item.date); setNotes(item.notes ?? ''); setContext(item.context ?? ''); };
  if (!id) return <WorkoutPage><WorkoutText>Choose an exercise from Strength progress.</WorkoutText></WorkoutPage>;
  return <WorkoutPage><WorkoutTitle>{exercise?.name ?? historicalName ?? 'Exercise'} progress</WorkoutTitle><WorkoutText>Only this exercise’s ID is compared. No other machine or similarly named movement is mixed in.</WorkoutText>
    <WorkoutCard><WorkoutText>{points.length} logged sessions{supportsOneRepMax ? ` · ${actuals.length} confirmed 1RM records` : ''}</WorkoutText>{strengthMetrics ? <><WorkoutText>Best {measurement === 'bodyweight_reps' ? 'added ' : ''}weight {records.topWeightKg ? `${display(records.topWeightKg, unit)} ${unit}` : '—'} · best external-load volume {records.topVolumeKg ? `${display(records.topVolumeKg, unit)} ${unit}` : '—'}</WorkoutText>{supportsOneRepMax && <WorkoutText>Heaviest completed single {records.bestSingleKg ? `${display(records.bestSingleKg, unit)} ${unit}` : '—'} · estimated 1RM {records.bestEstimatedOneRepMaxKg ? `${display(records.bestEstimatedOneRepMaxKg, unit)} ${unit}` : '—'} · confirmed actual 1RM {records.bestActualOneRepMaxKg ? `${display(records.bestActualOneRepMaxKg, unit)} ${unit}` : '—'}</WorkoutText>}</> : <WorkoutText>{measurement === 'timed_hold' ? 'Best hold and its history' : measurement === 'distance_carry' ? 'Best distance and its history' : 'Assisted reps are logged without treating assistance as lifted weight.'}</WorkoutText>}</WorkoutCard>
    <WorkoutCard><WorkoutText>Metric</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(supportsOneRepMax ? ['weight','volume','reps','estimated','actual'] : measurement === 'bodyweight_reps' ? ['bodyweight','weight','volume'] : measurement === 'timed_hold' ? ['hold'] : measurement === 'distance_carry' ? ['distance'] : ['assisted']).map((item) => <Chip key={item} label={metricLabels[item as Metric]} selected={visibleMetric === item} onPress={() => { setMetric(item as Metric); setSelectedSessionId(undefined); }} />)}</View>
      <WorkoutText>Range</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{ranges.map((item) => <Chip key={item} label={item} selected={range === item} onPress={() => setRange(item)} />)}</View>
      {visibleMetric === 'reps' && <><WorkoutText>Compare reps only at the same logged weight</WorkoutText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{weights.map((item) => <Chip key={item} label={`${display(item, unit)} ${unit}`} selected={chosenWeight === item} onPress={() => setRepWeight(item)} />)}</View></>}
      <WorkoutTrendChart points={chart} unit={visibleMetric === 'reps' || visibleMetric === 'assisted' || visibleMetric === 'bodyweight' ? 'reps' : visibleMetric === 'hold' ? 'sec' : visibleMetric === 'distance' ? 'm' : unit} onSelect={(point) => setSelectedSessionId(visibleMetric === 'actual' ? undefined : point.id)} />
      {lastTwo.length === 2 && <WorkoutText>Latest change: {lastTwo[1].value > lastTwo[0].value ? '+' : ''}{Math.round((lastTwo[1].value - lastTwo[0].value) * 10) / 10} {visibleMetric === 'reps' || visibleMetric === 'assisted' || visibleMetric === 'bodyweight' ? 'reps' : visibleMetric === 'hold' ? 'sec' : visibleMetric === 'distance' ? 'm' : unit}. {visibleMetric === 'volume' ? 'More volume does not necessarily mean more strength.' : ''}</WorkoutText>}
      {selectedSessionId && <WorkoutButton label="Open selected workout" secondary onPress={() => router.push(`/workout-history?id=${selectedSessionId}` as Href)} />}
    </WorkoutCard>
    {supportsOneRepMax && <WorkoutCard><WorkoutTitle>Actual 1RM</WorkoutTitle><WorkoutText>Record only a maximum-effort attempt you personally confirm. A completed single is not automatically a maximum. Estimated 1RM uses Epley (weight × (1 + reps / 30)) for 1–10 reps and remains separate.</WorkoutText>
      <WorkoutInput label={`Confirmed weight (${unit})`} value={weight} onChangeText={setWeight} numeric /><WorkoutInput label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} /><WorkoutInput label="Notes (optional)" value={notes} onChangeText={setNotes} /><WorkoutInput label="Equipment/context (optional)" value={context} onChangeText={setContext} />
      <WorkoutButton label={editingId ? 'Save edited actual 1RM' : 'Record actual 1RM'} onPress={() => save()} />{editingId && <WorkoutButton label="Cancel edit" secondary onPress={() => { setEditingId(undefined); setWeight(''); setNotes(''); setContext(''); }} />}
      {actuals.slice().reverse().map((item) => <WorkoutRow key={item.id} title={`${item.date} · ${display(item.weightKg, unit)} ${unit}`} subtitle={`${item.context ?? 'Confirmed attempt'} · tap to edit`} onPress={() => Alert.alert('Actual 1RM', `${display(item.weightKg, unit)} ${unit} on ${item.date}`, [{ text: 'Cancel' }, { text: 'Edit', onPress: () => edit(item) }, { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Delete this attempt?', 'This cannot be undone.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteActualOneRepMax(item.id) }]) }])} />)}
      {singles.filter(({ set }) => !actuals.some((item) => item.sourceSetId === set.id)).slice(-5).reverse().map(({ session, set }) => <WorkoutButton key={set.id} label={`Confirm logged single · ${display(set.weightKg!, unit)} ${unit} · ${new Date(session.startedAt).toLocaleDateString()}`} secondary onPress={() => Alert.alert('Confirm actual 1RM?', 'Was this a genuine maximum-effort attempt? Ordinary singles should stay unconfirmed.', [{ text: 'No' }, { text: 'Yes, confirm', onPress: () => save(set.id, set.weightKg, set.completedAt.slice(0, 10)) }])} />)}
    </WorkoutCard>}
  </WorkoutPage>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 42, paddingHorizontal: 11, justifyContent: 'center', borderRadius: 10, backgroundColor: selected ? colors.workoutsNav : colors.surfaceRaised }}><Text style={{ color: selected ? colors.background : colors.text }}>{label}</Text></Pressable>;
}
