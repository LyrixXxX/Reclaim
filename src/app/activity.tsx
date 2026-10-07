import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Header } from '@/components/header';
import { HistoryPages } from '@/components/history-pages';
import { routeDisplayName } from '@/components/activity-route-details';
import { RoutePreview } from '@/components/route-preview';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { activityRange, activityToday } from '@/lib/activity-overview';
import { goalForDate, readStepHistory } from '@/lib/activity-step-history';
import { formatMiles } from '@/lib/activity-units';
import { localDateKey } from '@/lib/progress';
import { RollingRange } from '@/lib/rolling-range';
import { readTodaySteps, StepResult } from '@/lib/activity-steps';
import { StepDay } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function ActivityOverview() {
  const { activityRoutes = [], stepGoals = [], saveStepGoal } = useTrackers();
  const [steps, setSteps] = useState<StepResult>({ status: 'permission-needed' });
  const [days, setDays] = useState<StepDay[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [chartRange, setChartRange] = useState<RollingRange>('7D');
  const [chartOffset, setChartOffset] = useState(0);
  const refresh = useCallback(async () => {
    setNow(new Date());
    setSteps(await readTodaySteps());
    setDays(await readStepHistory().catch(() => []));
  }, []);
  useFocusEffect(useCallback(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [refresh]));
  const today = localDateKey(now);
  const goal = goalForDate(stepGoals, today);
  const count = steps.count;
  const progress = goal && count !== undefined ? Math.min(1, count / goal) : 0;
  const week = activityRange(days, stepGoals, chartRange, chartOffset, now);
  const totals = activityToday(activityRoutes, now);
  const recent = [...activityRoutes].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 2);
  const maxSteps = Math.max(goal, ...week.slots.map((slot) => slot.count ?? 0), 1);
  const duration = Math.floor(totals.activeMs / 1000);
  const saveGoal = () => {
    try { saveStepGoal(today, Number(goalDraft)); setEditingGoal(false); }
    catch (error) { Alert.alert('Step goal', error instanceof Error ? error.message : 'Enter a valid goal.'); }
  };
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content}>
    <Header />
    <Text accessibilityRole="header" style={styles.eyebrow}>ACTIVITY · MOVEMENT, ON YOUR TERMS</Text>
    <View style={styles.card}>
      <Text style={styles.title}>Today’s steps</Text>
      <View style={styles.stepRow}><View style={styles.ring}><Svg width={164} height={164} viewBox="0 0 164 164"><Circle cx="82" cy="82" r="68" fill="none" stroke={colors.border} strokeWidth="12" /><Circle cx="82" cy="82" r="68" fill="none" stroke={colors.activityNav} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 68}`} strokeDashoffset={2 * Math.PI * 68 * (1 - progress)} rotation="-90" origin="82, 82" /></Svg><View style={styles.ringLabel}><Text style={styles.big}>{count === undefined ? '—' : count.toLocaleString()}</Text><Text style={styles.muted}>{goal ? `of ${goal.toLocaleString()}` : 'No goal'}</Text></View></View>
        <View style={styles.goalBox}><Text style={styles.goalText}>{count === undefined ? 'Steps unavailable' : !goal ? 'Set your goal' : count >= goal ? 'Goal reached! 🎉' : `${(goal - count).toLocaleString()} steps left`}</Text><Text style={styles.muted}>Daily goal · {goal ? goal.toLocaleString() : 'Not set'}</Text>{editingGoal ? <><TextInput accessibilityLabel="Daily step goal" keyboardType="number-pad" value={goalDraft} onChangeText={setGoalDraft} style={styles.input} /><Action label="Save goal" onPress={saveGoal} /></> : <Action label="Edit goal" onPress={() => { setGoalDraft(goal ? String(goal) : ''); setEditingGoal(true); }} secondary />}</View></View>
      <View style={styles.metrics}><Metric label="Distance" value={formatMiles(totals.distanceMeters)} /><Metric label="Active time" value={`${Math.floor(duration / 3600)}h ${String(Math.floor((duration % 3600) / 60)).padStart(2, '0')}m`} /><Metric label="Est. calories" value={totals.estimatedCalories === null ? '—' : `${totals.estimatedCalories}`} /></View>
      <Text style={styles.muted}>Activity totals come from saved routes. {steps.status === 'available' ? 'Steps update from your phone.' : steps.message ?? 'Step tracking is not connected.'}</Text>
      {(steps.status === 'permission-needed' || steps.status === 'interrupted' || steps.status === 'error') && <Action label={steps.status === 'interrupted' ? 'Restart step tracking' : 'Enable step tracking'} onPress={() => void readTodaySteps(true).then(setSteps)} />}
    </View>
    <View style={styles.card}><Text style={styles.title}>Track an activity</Text><Text style={styles.muted}>Record your path, distance and time.</Text><Action label="Track activity" onPress={() => router.push('/activity-map' as Href)} /></View>
    <View style={styles.card}><Text style={styles.title}>Step trends</Text><RollingRangeControls range={chartRange} onRange={setChartRange} offset={chartOffset} onOffset={setChartOffset} start={week.start} end={week.end} accent={colors.activityNav} /><Text style={styles.muted}>{week.aggregation} · Missing days are blank.</Text><View style={styles.chart}>{week.slots.map((slot) => <View key={slot.date} style={styles.chartSlot}><View style={styles.barTrack}>{slot.count !== undefined && <View style={[styles.bar, { height: `${Math.max(3, slot.count / maxSteps * 100)}%` }]} />}</View>{(week.slots.length <= 8 || week.slots.indexOf(slot) % Math.ceil(week.slots.length / 6) === 0) && <Text style={styles.dayLabel}>{slot.label}</Text>}</View>)}</View><View style={styles.metrics}><Metric label="Recorded-day average" value={week.average === null ? '—' : week.average.toLocaleString()} /><Metric label="Goals reached" value={`${week.goalsReached} of ${week.goalDays}`} /></View></View>
    <View style={styles.sectionHead}><Text style={styles.title}>Recent routes</Text><Pressable onPress={() => router.push('/activity-routes' as Href)}><Text style={styles.link}>See all ›</Text></Pressable></View>
    {recent.length ? recent.map((route) => <Pressable key={route.id} accessibilityRole="button" onPress={() => router.push(`/activity-map?routeId=${encodeURIComponent(route.id)}` as Href)} style={styles.routeCard}><View style={styles.preview}><RoutePreview points={route.points} height={80} /></View><View style={{ flex: 1 }}><Text style={styles.routeName}>{routeDisplayName(route)}</Text><Text style={styles.muted}>{new Date(route.startedAt).toLocaleString()}</Text><Text style={styles.muted}>{formatMiles(route.distanceMeters)} · {Math.round((Date.parse(route.endedAt) - Date.parse(route.startedAt) - route.pausedMs) / 60000)} min{route.estimatedCalories === undefined ? '' : ` · ${route.estimatedCalories} kcal`}</Text></View><Text style={styles.link}>›</Text></Pressable>) : <Text style={styles.muted}>Finished routes will appear here.</Text>}
    <Action label={showHistory ? 'Hide daily steps' : 'View daily steps'} secondary onPress={() => setShowHistory(!showHistory)} />
    {showHistory && <View style={styles.card}><Text style={styles.title}>Daily steps</Text><HistoryPages items={[...days].sort((a, b) => b.date.localeCompare(a.date))} pageSize={5}>{(page) => page.map((day) => <View key={day.date} style={styles.historyRow}><Text style={styles.routeName}>{new Date(`${day.date}T12:00:00`).toLocaleDateString()}</Text><Text style={styles.muted}>{day.count.toLocaleString()} steps{goalForDate(stepGoals, day.date) ? ` / ${goalForDate(stepGoals, day.date).toLocaleString()} goal` : ''}</Text></View>)}</HistoryPages></View>}
  </ScrollView></SafeAreaView>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.muted}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function Action({ label, onPress, secondary }: { label: string; onPress: () => void; secondary?: boolean }) { return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, secondary && styles.secondary]}><Text style={styles.actionText}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  eyebrow: { color: colors.activityNav, fontWeight: '900', letterSpacing: 2 }, card: { padding: 18, gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' }, muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { width: 164, height: 164, alignItems: 'center', justifyContent: 'center' }, ringLabel: { position: 'absolute', alignItems: 'center' }, big: { color: colors.activityNav, fontSize: 29, fontWeight: '900' }, goalBox: { flex: 1, gap: 8 }, goalText: { color: colors.activityNav, fontWeight: '900', fontSize: 15 },
  metrics: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, metric: { flexGrow: 1, flexBasis: 90, backgroundColor: colors.surfaceRaised, padding: 12, borderRadius: 13 }, metricValue: { color: colors.text, fontWeight: '900', fontSize: 16, marginTop: 4 },
  input: { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 9 }, action: { backgroundColor: colors.activityNav, minHeight: 46, justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 13 }, secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 }, actionText: { color: colors.text, fontWeight: '900' },
  chart: { height: 130, flexDirection: 'row', gap: 8, alignItems: 'flex-end' }, chartSlot: { flex: 1, alignItems: 'center', gap: 6 }, barTrack: { width: '100%', height: 105, justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.border }, bar: { width: '100%', backgroundColor: colors.activityNav, borderTopLeftRadius: 4, borderTopRightRadius: 4 }, dayLabel: { color: colors.textMuted, fontSize: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, link: { color: colors.activityNav, fontWeight: '900' }, routeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface }, preview: { width: 86, height: 80, overflow: 'hidden', borderRadius: 10 }, routeName: { color: colors.text, fontWeight: '800', fontSize: 14 }, historyRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 },
});
