import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { MainScreenHeader } from '@/components/main-screen-header';
import { HistoryPages } from '@/components/history-pages';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { activityRange } from '@/lib/activity-overview';
import { goalForDate, readStepHistory } from '@/lib/activity-step-history';
import { localDateKey } from '@/lib/progress';
import { RollingRange } from '@/lib/rolling-range';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { readTodaySteps } from '@/lib/activity-steps';
import { useLiveSteps } from '@/hooks/use-live-steps';
import { stepCalories } from '@/lib/step-calories';
import { formatMiles, stepDistanceMiles, strideNote, walkingStride } from '@/lib/stride';
import { StepDay } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';

export default function ActivityOverview() {
  const { stepGoals = [], weightEntries = [], saveStepGoal, preferences = DEFAULT_PREFERENCES, setSectionVisibility, activityRoutes, weightTdeeProfile, nutritionGoals } = useTrackers();
  const stride = walkingStride({ activityRoutes, weightTdeeProfile, nutritionGoals });
  const { steps, refresh: refreshSteps } = useLiveSteps();
  const [days, setDays] = useState<StepDay[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [chartRange, setChartRange] = useState<RollingRange>('7D');
  const [chartOffset, setChartOffset] = useState(0);
  const refresh = useCallback(async () => {
    setNow(new Date());
    setDays(await readStepHistory().catch(() => []));
  }, []);
  useFocusEffect(useCallback(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]));
  const today = localDateKey(now);
  const goal = goalForDate(stepGoals, today);
  const count = steps.count;
  const progress = goal && count !== undefined ? Math.min(1, count / goal) : 0;
  const burn = steps.status === 'available' ? stepCalories(count, weightEntries, today, stride.meters) : undefined;
  const miles = steps.status === 'available' && count !== undefined ? stepDistanceMiles(count, stride) : undefined;
  // Today's saved history lags the live counter; show the live count so the chart matches the ring.
  const liveDays = steps.status === 'available' && count !== undefined ? [...days.filter((day) => day.date !== today), { date: today, count, incomplete: !!steps.incomplete }] : days;
  const week = activityRange(liveDays, stepGoals, chartRange, chartOffset, now);
  const maxSteps = Math.max(goal, ...week.slots.map((slot) => slot.count ?? 0), 1);
  const saveGoal = () => {
    try { saveStepGoal(today, Number(goalDraft)); setEditingGoal(false); }
    catch (error) { Alert.alert('Step goal', error instanceof Error ? error.message : 'Enter a valid goal.'); }
  };
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content}>
    <MainScreenHeader title="Steps" subtitle="Daily movement and your step goal." accent={colors.activityNav} />
    <View style={styles.card}>
      <View style={styles.titleRow}><Text style={styles.title}>Today’s steps</Text>{steps.status === 'available' && <InfoButton label="About these estimates" onPress={() => Alert.alert('About these estimates', [
        miles !== undefined ? strideNote(stride) : undefined,
        burn ? `Calories are estimated from ${burn.fromWeighIn ? 'your latest weigh-in' : 'an average weight; add a weigh-in for a closer estimate'}.` : undefined,
        'Steps are counted by this phone.',
      ].filter(Boolean).join('\n\n'))} />}</View>
      <View style={styles.stepRow}><View style={styles.ring}><Svg width={164} height={164} viewBox="0 0 164 164"><Circle cx="82" cy="82" r="68" fill="none" stroke={colors.border} strokeWidth="12" /><Circle cx="82" cy="82" r="68" fill="none" stroke={colors.activityNav} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 68}`} strokeDashoffset={2 * Math.PI * 68 * (1 - progress)} rotation="-90" origin="82, 82" /></Svg><View style={styles.ringLabel}><Text style={styles.big}>{count === undefined ? '—' : count.toLocaleString()}</Text><Text style={styles.muted}>{goal ? `of ${goal.toLocaleString()}` : 'No goal'}</Text></View></View>
        <View style={styles.goalBox}><Text style={styles.goalText}>{count === undefined ? 'Steps unavailable' : !goal ? 'Set your goal' : count >= goal ? 'Goal reached! 🎉' : `${(goal - count).toLocaleString()} steps left`}</Text><Text style={styles.muted}>Daily goal · {goal ? goal.toLocaleString() : 'Not set'}</Text>{editingGoal ? <><TextInput accessibilityLabel="Daily step goal" keyboardType="number-pad" value={goalDraft} onChangeText={setGoalDraft} style={styles.input} /><Action label="Save goal" onPress={saveGoal} /></> : <Action label="Edit goal" onPress={() => { setGoalDraft(goal ? String(goal) : ''); setEditingGoal(true); }} secondary />}</View></View>
      {miles !== undefined && <View style={styles.burn}><Text style={styles.burnLabel}>Est. distance</Text><Text style={styles.burnValue}>{formatMiles(miles)}</Text></View>}
      {burn && <View style={styles.burn}><Text style={styles.burnLabel}>Est. calories burned</Text><Text style={styles.burnValue}>{burn.kcal.toLocaleString()} kcal</Text></View>}
      {steps.status !== 'available' && <Text style={styles.muted}>{steps.message ?? 'Step tracking is not connected.'}</Text>}
      {(steps.status === 'permission-needed' || steps.status === 'interrupted' || steps.status === 'error') && <Action label={steps.status === 'interrupted' ? 'Restart step tracking' : 'Enable step tracking'} onPress={() => void readTodaySteps(true).then(() => refreshSteps())} />}
    </View>
    <View style={styles.card}><Text style={styles.title}>Track an activity</Text><Text style={styles.muted}>Record a walk, hike, or run in Routes.</Text><Action label={preferences.visibleSections.routes ? 'Track activity' : 'Show Routes to track'} onPress={() => { if (!preferences.visibleSections.routes) setSectionVisibility('routes', true); router.push('/routes' as Href); }} /></View>
    <View style={styles.card}><Text style={styles.title}>Step trends</Text><RollingRangeControls range={chartRange} onRange={setChartRange} offset={chartOffset} onOffset={setChartOffset} start={week.start} end={week.end} accent={colors.activityNav} /><Text style={styles.muted}>{week.aggregation} · Missing days are blank.</Text><View style={styles.chart}>{week.slots.map((slot) => <View key={slot.date} style={styles.chartSlot}><View style={styles.barTrack}>{slot.count !== undefined && <View style={[styles.bar, { height: `${Math.max(3, slot.count / maxSteps * 100)}%` }]} />}</View>{(week.slots.length <= 8 || week.slots.indexOf(slot) % Math.ceil(week.slots.length / 6) === 0) && <Text style={styles.dayLabel}>{slot.label}</Text>}</View>)}</View><View style={styles.metrics}><Metric label="Recorded-day average" value={week.average === null ? '—' : week.average.toLocaleString()} /><Metric label="Goals reached" value={`${week.goalsReached} of ${week.goalDays}`} /></View></View>
    <Action label={showHistory ? 'Hide daily steps' : 'View daily steps'} secondary onPress={() => setShowHistory(!showHistory)} />
    {showHistory && <View style={styles.card}><Text style={styles.title}>Daily steps</Text><HistoryPages items={[...liveDays].sort((a, b) => b.date.localeCompare(a.date))} pageSize={5}>{(page) => page.map((day) => <View key={day.date} style={styles.historyRow}><Text style={styles.dayName}>{new Date(`${day.date}T12:00:00`).toLocaleDateString()}</Text><Text style={styles.muted}>{day.count.toLocaleString()} steps{goalForDate(stepGoals, day.date) ? ` / ${goalForDate(stepGoals, day.date).toLocaleString()} goal` : ''}</Text></View>)}</HistoryPages></View>}
  </ScrollView></SafeAreaView>;
}

function InfoButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} style={styles.info}>
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={1.9} strokeLinecap="round"><Circle cx="12" cy="12" r="9.5" /><Path d="M12 11v5.5M12 7.6v.1" /></Svg>
  </Pressable>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.muted}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function Action({ label, onPress, secondary }: { label: string; onPress: () => void; secondary?: boolean }) { return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, secondary && styles.secondary]}><Text style={[styles.actionText, !secondary && { color: colors.background }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  info: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  burn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: colors.surfaceRaised, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4 },
  burnLabel: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold },
  burnValue: { color: colors.activityNav, fontSize: 18, fontFamily: font.bold, fontVariant: ['tabular-nums'] },
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  eyebrow: { color: colors.activityNav, fontFamily: font.bold, letterSpacing: 2 }, card: { padding: 18, gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20 },
  title: { color: colors.text, fontSize: 20, fontFamily: font.bold }, muted: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18 }, stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { width: 164, height: 164, alignItems: 'center', justifyContent: 'center' }, ringLabel: { position: 'absolute', alignItems: 'center' }, big: { color: colors.activityNav, fontSize: 29, fontFamily: font.bold }, goalBox: { flex: 1, gap: 8 }, goalText: { color: colors.activityNav, fontFamily: font.bold, fontSize: 15 },
  metrics: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, metric: { flexGrow: 1, flexBasis: 90, backgroundColor: colors.surfaceRaised, padding: 12, borderRadius: 13 }, metricValue: { color: colors.text, fontFamily: font.bold, fontSize: 16, marginTop: 4 },
  input: { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 9 }, action: { backgroundColor: colors.activityNav, minHeight: 46, justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 13 }, secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 }, actionText: { color: colors.text, fontFamily: font.bold },
  chart: { height: 130, flexDirection: 'row', gap: 8, alignItems: 'flex-end' }, chartSlot: { flex: 1, alignItems: 'center', gap: 6 }, barTrack: { width: '100%', height: 105, justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.border }, bar: { width: '100%', backgroundColor: colors.activityNav, borderTopLeftRadius: 4, borderTopRightRadius: 4 }, dayLabel: { color: colors.textMuted, fontSize: 11 , fontFamily: font.regular},
  dayName: { color: colors.text, fontFamily: font.semibold, fontSize: 14 }, historyRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 },
});
