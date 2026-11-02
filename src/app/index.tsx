import { Href, Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Header } from '@/components/header';
import { GoodHabitIcon } from '@/components/good-habit-icon';
import { RemoveAdsButton } from '@/components/remove-ads-button';
import { DASHBOARD_WIDGETS, homeSecondaryWidgets } from '@/lib/dashboard';
import { DashboardContent, dashboardContent, dashboardDate } from '@/lib/dashboard-content';
import { homeOverview, nutritionGoalDetail, type HomeWalkingData } from '@/lib/home-overview';
import { homeQuittingTapering, type HomeJourney } from '@/lib/home-quitting';
import { DEFAULT_PREFERENCES, trainingOverviewVisibleOnHome } from '@/lib/preferences';
import { homeGoalColor } from '@/lib/home-goal-colors';
import { habitProgress } from '@/lib/good-habit-templates';
import { readTodaySteps, readWalkingIntervals, StepResult } from '@/lib/activity-steps';
import { readActiveRoute } from '@/lib/activity-recording';
import { localDateKey } from '@/lib/progress';
import { readStepHistory } from '@/lib/activity-step-history';
import { activityRange } from '@/lib/activity-overview';
import { formatMiles } from '@/lib/activity-units';
import { dashboardStart, DashboardRange, trainingTotals } from '@/lib/fitness-dashboard';
import { fromKg } from '@/lib/workouts';
import { ActivityRoute, DashboardWidget, DashboardWidgetId, StepDay, WorkoutSession } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout } from '@/theme';

const destinations: Record<DashboardWidgetId, string> = { nutrition: '/nutrition', medications: '/', cpap: '/', weight: '/weight', bloodPressure: '/', labs: '/', habits: '/habits', activity: '/activity', quickActions: '/' };
const accents: Record<DashboardWidgetId, string> = { nutrition: colors.nutritionNav, medications: colors.healthNav, cpap: colors.weightNav, weight: colors.activityNav, bloodPressure: colors.healthNav, labs: colors.healthNav, habits: colors.habitsNav, activity: colors.activityNav, quickActions: colors.accent };

export default function DashboardScreen() {
  const state = useTrackers();
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const widgets = homeSecondaryWidgets(preferences);
  const [now, setNow] = useState(() => new Date());
  const [steps, setSteps] = useState<StepResult>({ status: 'permission-needed' });
  const [stepDays, setStepDays] = useState<StepDay[]>([]);
  const [walking, setWalking] = useState<HomeWalkingData>({ intervals: null });
  const cardWidth = '100%' as const;
  useFocusEffect(useCallback(() => {
    setNow(new Date());
    const refreshWalking = () => { const date = localDateKey(); void Promise.all([readWalkingIntervals(date), readActiveRoute()]).then(([intervals, activeRoute]) => setWalking({ date, intervals, activeRoute })).catch(() => setWalking({ date, intervals: null })); };
    refreshWalking();
    if (preferences.visibleSections.activity) { void readTodaySteps(false).then(setSteps); void readStepHistory().then(setStepDays).catch(() => undefined); }
    const timer = setInterval(() => { setNow(new Date()); refreshWalking(); if (preferences.visibleSections.activity) void readStepHistory().then(setStepDays).catch(() => undefined); }, 60_000);
    const stepsTimer = preferences.visibleSections.activity ? setInterval(() => { void readTodaySteps(false).then(setSteps); }, 3000) : undefined;
    const subscription = AppState.addEventListener('change', (status) => { if (status === 'active') { setNow(new Date()); refreshWalking(); if (preferences.visibleSections.activity) { void readTodaySteps(false).then(setSteps); void readStepHistory().then(setStepDays).catch(() => undefined); } } });
    return () => { clearInterval(timer); if (stepsTimer) clearInterval(stepsTimer); subscription.remove(); };
  }, [preferences.visibleSections.activity]));
  const overview = homeOverview(state, steps, now, walking);
  const journeys = preferences.showQuittingTaperingOnHome === false || !preferences.visibleSections.goals ? { quitting: [], tapering: [] } : homeQuittingTapering(state.trackers, state.taperSteps ?? [], now);
  const week = activityRange(stepDays, state.stepGoals ?? [], '7D', 0, now);
  const hasProgress = overview.goalCount > 0;
  const mindfulness = state.trackers.find((item) => item.habitTemplate === 'mindfulness' && !item.archived && !(preferences.hiddenHomeHabitIds ?? []).includes(item.id));
  const mindfulnessProgress = mindfulness ? habitProgress(mindfulness, state.goodHabitLogs ?? [], [], now) : null;
  const goalColor = (id: string, fallback: string) => homeGoalColor(id, preferences.homeGoalColors, fallback);
  const ringSegments = [
    ...(overview.stepProgress ? [{ name: 'Steps', color: goalColor('steps', colors.activityNav), progress: (overview.stepProgress.count ?? 0) / overview.stepProgress.target }] : []),
    ...(overview.nutrition ? [{ name: 'Nutrition', color: goalColor('nutrition', colors.nutritionNav), progress: overview.nutrition.calories / Math.max(1, overview.nutrition.budget) }] : []),
    ...overview.dailyHabitGoals.map((goal) => ({ name: goal.title, color: goalColor(goal.id, colors.habitsNav), progress: goal.progress })),
  ];
  const ringSize = 168;
  const ringCenter = ringSize / 2;
  const ringRadius = 69;

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Header />
    <View style={styles.heading}><View style={styles.headingText}><Text style={styles.greeting}>{greeting(now)},</Text><Text accessibilityRole="header" style={styles.date}>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text></View><Link href={'/dashboard-edit' as Href} asChild><Pressable accessibilityRole="button" style={styles.edit}><Text style={styles.editText}>▦  Edit dashboard</Text></Pressable></Link></View>

    {overview.attention.length > 0 && <View style={styles.attentionPanel}><View style={styles.panelHeading}><Text style={styles.attentionTitle}>Needs attention</Text><Text style={styles.attentionCount}>{overview.attention.length} {overview.attention.length === 1 ? 'item' : 'items'}</Text></View>{overview.attention.map((item) => <Link key={item.id} href={item.href as Href} asChild><Pressable accessibilityRole="button" style={styles.attentionRow}><View style={styles.attentionText}><Text style={styles.attentionItemTitle}>{item.title}</Text><Text style={styles.caption}>{item.detail}</Text></View><Text style={styles.arrow}>›</Text></Pressable></Link>)}</View>}

    {hasProgress && <View style={styles.progressPanel}>
      <View style={styles.panelHeading}><Text style={styles.progressTitle}>Today’s progress</Text><Text style={styles.panelCount}>{overview.goalCount ? `${overview.reachedCount} of ${overview.goalCount} goals` : 'Today at a glance'}</Text></View>
      <View style={styles.progressBody}>
        {overview.goalCount > 0 && <View style={styles.goalRing}><Svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} accessibilityLabel={ringSegments.map((segment) => `${segment.name} ${Math.round(Math.min(1, Math.max(0, segment.progress)) * 100)}%`).join(', ')}>{ringSegments.map((segment, index) => {
          const circumference = 2 * Math.PI * ringRadius;
          const arc = circumference / ringSegments.length - 8;
          const rotation = -90 + index * (360 / ringSegments.length);
          return <Circle key={segment.name} cx={ringCenter} cy={ringCenter} r={ringRadius} fill="none" stroke={colors.border} strokeWidth={13} strokeLinecap="round" strokeDasharray={`${arc} ${circumference - arc}`} rotation={rotation} origin={`${ringCenter}, ${ringCenter}`} />;
        })}{ringSegments.map((segment, index) => {
          const circumference = 2 * Math.PI * ringRadius;
          const arc = circumference / ringSegments.length - 8;
          const filled = arc * Math.min(1, Math.max(0, segment.progress));
          return filled > 0 ? <Circle key={segment.name} cx={ringCenter} cy={ringCenter} r={ringRadius} fill="none" stroke={segment.color} strokeWidth={13} strokeLinecap="round" strokeDasharray={`${filled} ${circumference - filled}`} rotation={-90 + index * (360 / ringSegments.length)} origin={`${ringCenter}, ${ringCenter}`} /> : null;
        })}</Svg><View style={styles.goalRingLabel}><Text style={styles.goalRingValue}>{overview.reachedCount}/{overview.goalCount}</Text><Text style={styles.goalRingCaption}>goals</Text></View></View>}
        <View style={styles.progressTiles}>
          {overview.stepProgress && <ProgressTile title="Steps" value={overview.stepProgress.count === null ? 'Awaiting steps' : overview.stepProgress.count.toLocaleString()} detail={`Goal ${overview.stepProgress.target.toLocaleString()} steps`} progress={(overview.stepProgress.count ?? 0) / overview.stepProgress.target} color={goalColor('steps', colors.activityNav)} href="/activity" />}
          {overview.nutrition && <ProgressTile title="Nutrition" value={`${Math.round(overview.nutrition.calories).toLocaleString()} kcal`} detail={nutritionGoalDetail(overview.nutrition.calories, overview.nutrition.budget, overview.nutrition.entryCount)} progress={overview.nutrition.calories / Math.max(1, overview.nutrition.budget)} color={goalColor('nutrition', colors.nutritionNav)} valueColor={overview.nutrition.entryCount ? overview.nutrition.calories > overview.nutrition.budget + 200 ? colors.danger : colors.success : colors.text} href="/nutrition" />}
          {overview.dailyHabitGoals.map((goal) => <ProgressTile key={goal.id} title={goal.title} value={goal.value} detail={goal.detail} progress={goal.progress} color={goalColor(goal.id, colors.habitsNav)} href={goal.href} />)}
        </View>
      </View>
    </View>}

    {trainingOverviewVisibleOnHome(preferences) && <TrainingOverviewHomeCard sessions={state.workoutSessions ?? []} routes={state.activityRoutes ?? []} unit={state.workoutSettings?.weightUnit ?? 'lb'} now={now} />}

    {mindfulness && mindfulnessProgress && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${mindfulness.displayName || mindfulness.name}`} onPress={() => router.push(`/tracker/${encodeURIComponent(mindfulness.id)}` as Href)} style={styles.mindfulnessCard}>
      <View style={styles.mindfulnessTop}><GoodHabitIcon type="mindfulness" size={54} /><View style={styles.mindfulnessCopy}><Text style={styles.cardTitle}>{mindfulness.displayName || mindfulness.name}</Text><Text style={styles.caption}>{mindfulness.mindfulnessVisualMode === 'quiet' ? 'Quiet Zen' : 'Breathing guide'} · Tap to start a session</Text></View><Text style={styles.arrow}>›</Text></View>
      <Text style={styles.mindfulnessValue}>{Number(mindfulnessProgress.amount.toFixed(1))} / {mindfulnessProgress.goal} min today</Text><View style={styles.track}><View style={[styles.fill, { width: `${mindfulnessProgress.percent}%`, backgroundColor: goalColor(mindfulness.id, colors.habitsNav) }]} /></View>
    </Pressable>}

    {overview.weeklyHabitCards.map((goal) => { const color = goalColor(goal.id, colors.habitsNav); return <Pressable key={goal.id} accessibilityRole="button" onPress={() => router.push(goal.href as Href)} style={[styles.dashboardCard, { borderColor: color, borderLeftColor: color, backgroundColor: `${color}0C` }]}><Text style={styles.cardTitle}>{goal.title}</Text><Text style={styles.cardValue}>{goal.value}</Text><Text style={styles.caption}>{goal.detail}</Text><View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, goal.progress * 100))}%`, backgroundColor: color }]} /></View></Pressable>; })}
    {(journeys.quitting.length > 0 || journeys.tapering.length > 0) && <View style={styles.journeyPanel}><Text accessibilityRole="header" style={styles.journeyTitle}>Quitting &amp; Tapering</Text><ScrollView nestedScrollEnabled scrollEnabled={journeys.quitting.length + journeys.tapering.length > 3} style={journeys.quitting.length + journeys.tapering.length > 3 ? styles.journeyScroll : undefined} contentContainerStyle={styles.journeyScrollContent}>{journeys.quitting.length > 0 && <JourneyList title="Quitting" items={journeys.quitting} />}{journeys.tapering.length > 0 && <JourneyList title="Tapering" items={journeys.tapering} />}</ScrollView>{journeys.quitting.length + journeys.tapering.length > 3 && <Text style={styles.journeyHint}>Scroll to see more</Text>}</View>}
    {widgets.length > 0 && <View style={styles.grid}>{widgets.map((widget) => <DashboardCard key={widget.id} widget={widget} content={dashboardContent(state, widget, now, steps)} overview={overview} week={week} width={cardWidth} />)}</View>}
    <RemoveAdsButton />
  </ScrollView></SafeAreaView>;
}

function greeting(now: Date) { return now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'; }

const trainingRanges: Record<DashboardRange, string> = { week: 'This week', month: 'This month', '3m': '3 months', '6m': '6 months', year: 'This year', all: 'All time' };

function TrainingOverviewHomeCard({ sessions, routes, unit, now }: { sessions: WorkoutSession[]; routes: ActivityRoute[]; unit: 'lb' | 'kg'; now: Date }) {
  const [range, setRange] = useState<DashboardRange>('week');
  const totals = trainingTotals(sessions, routes, dashboardStart(range, now), now);
  const minutes = (value: number) => `${Math.round(value).toLocaleString()} min`;
  const stats = [
    { label: 'Strength sessions', value: totals.strengthSessions.toLocaleString() },
    { label: 'Cardio routes', value: totals.cardioSessions.toLocaleString() },
    { label: 'Strength time', value: minutes(totals.strengthMinutes) },
    { label: 'Cardio time', value: minutes(totals.cardioMinutes) },
    { label: 'Cardio distance', value: formatMiles(totals.cardioMeters) },
    { label: 'External-load volume', value: `${Math.round(fromKg(totals.volumeKg, unit)).toLocaleString()} ${unit}` },
  ];
  return <View style={styles.trainingCard}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Workouts" onPress={() => router.push('/workouts' as Href)} style={styles.trainingHeading}><Text accessibilityRole="header" style={styles.trainingTitle}>Training overview</Text><Text style={[styles.arrow, { color: colors.workoutsNav }]}>›</Text></Pressable>
    <View style={styles.trainingRanges}>{(Object.keys(trainingRanges) as DashboardRange[]).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: range === item }} onPress={() => setRange(item)} style={[styles.trainingRange, range === item && styles.trainingRangeSelected]}><Text style={[styles.trainingRangeText, range === item && styles.trainingRangeTextSelected]}>{trainingRanges[item]}</Text></Pressable>)}</View>
    <View style={styles.trainingStats}>{stats.map((stat) => <View key={stat.label} style={styles.trainingStat}><Text style={styles.trainingStatLabel}>{stat.label}</Text><Text style={styles.trainingStatValue} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text></View>)}</View>
    <Text style={styles.caption}>Strength comes from completed workouts; cardio comes from saved routes.</Text>
  </View>;
}

function JourneyList({ title, items }: { title: string; items: HomeJourney[] }) {
  return <View style={styles.journeyList}><Text style={styles.journeyGroup}>{title}</Text>{items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => router.push(item.href as Href)} style={styles.journeyRow}><View style={{ flex: 1 }}><Text style={styles.journeyName}>{item.title}</Text><Text style={styles.caption}>{item.timeframe}</Text></View><Text style={styles.arrow}>›</Text></Pressable>)}</View>;
}

function ProgressTile({ title, value, detail, progress, color, valueColor, href }: { title: string; value: string; detail: string; progress: number; color: string; valueColor?: string; href: string }) {
  return <Pressable accessibilityRole="button" onPress={() => router.push(href as Href)} style={[styles.progressTile, { borderColor: `${color}44`, backgroundColor: `${color}0D` }]}><Text style={[styles.tileTitle, { color }]}>{title}</Text><Text style={[styles.tileValue, valueColor && { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.caption} numberOfLines={2}>{detail}</Text><View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: color }]} /></View></Pressable>;
}

function DashboardCard({ widget, content, overview, week, width }: { widget: DashboardWidget; content: DashboardContent; overview: ReturnType<typeof homeOverview>; week: ReturnType<typeof activityRange>; width: '48%' | '100%' }) {
  const color = accents[widget.id];
  const title = DASHBOARD_WIDGETS.find((item) => item.id === widget.id)?.title ?? widget.id;
  const progress = widget.id === 'nutrition' && overview.nutrition ? overview.nutrition.calories / Math.max(1, overview.nutrition.budget)
    : widget.id === 'activity' && overview.stepProgress ? (overview.stepProgress.count ?? 0) / overview.stepProgress.target
      : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={() => router.push(destinations[widget.id] as Href)} style={[styles.dashboardCard, { width, borderColor: `${color}77`, borderLeftColor: color, backgroundColor: `${color}0C` }]}>
    <View style={styles.cardHeader}><View style={styles.cardTitleRow}><View style={[styles.cardDot, { backgroundColor: color }]} /><Text style={[styles.cardTitle, { color }]} numberOfLines={2}>{title}</Text></View><Text style={[styles.arrow, { color }]}>›</Text></View>
    <Text style={[styles.cardValue, content.calorieStatus && { color: content.calorieStatus === 'over' ? colors.danger : colors.success }]} numberOfLines={2} adjustsFontSizeToFit>{content.value}</Text>
    <Text style={styles.caption} numberOfLines={widget.expanded ? 3 : 2}>{content.caption}</Text>
    {widget.expanded && <>{progress !== null && <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: color }]} /></View>}{widget.id === 'activity' && week.slots.some((slot) => slot.count !== undefined) && <MiniBars slots={week.slots} color={color} />}{content.trend && content.trend.length > 1 && <MiniTrend points={content.trend} label={content.trendLabel!} color={color} />}{content.rows.slice(0, 3).map((row, index) => <View key={index} style={styles.dataRow}><Text style={styles.rowLabel} numberOfLines={2}>{row.label}</Text><Text style={styles.rowValue} numberOfLines={2}>{row.value}</Text></View>)}</>}
  </Pressable>;
}

function MiniTrend({ points, label, color }: { points: NonNullable<DashboardContent['trend']>; label: string; color: string }) {
  const times = points.map((item) => Date.parse(`${item.date}T12:00:00`));
  const values = points.map((item) => item.value);
  const min = Math.min(...values); const max = Math.max(...values);
  const coords = points.map((item, index) => ({ x: 6 + (times[index] - times[0]) / Math.max(1, times.at(-1)! - times[0]) * 268, y: max === min ? 30 : 50 - (item.value - min) / (max - min) * 40 }));
  return <View style={styles.trend}><Text style={styles.trendLabel}>{label}</Text><Svg width="100%" height={56} viewBox="0 0 280 60" accessibilityLabel={`${label}: ${values.join(', ')}`}><Polyline points={coords.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />{coords.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r={3} fill={color} />)}</Svg><View style={styles.trendDates}><Text style={styles.trendDate}>{dashboardDate(points[0].date)}</Text><Text style={styles.trendDate}>{dashboardDate(points.at(-1)!.date)}</Text></View></View>;
}

function MiniBars({ slots, color }: { slots: ReturnType<typeof activityRange>['slots']; color: string }) {
  const max = Math.max(1, ...slots.map((slot) => slot.count ?? 0));
  return <View accessible accessibilityLabel={`Steps in the last 7 days: ${slots.map((slot) => `${slot.label} ${slot.count === undefined ? 'untracked' : slot.count.toLocaleString()}`).join(', ')}`} style={styles.miniBars}>{slots.map((slot) => <View key={slot.date} style={styles.miniBarSlot}><View style={styles.miniBarTrack}>{slot.count !== undefined && <View style={[styles.miniBar, { backgroundColor: color, height: `${Math.max(4, slot.count / max * 100)}%` }]} />}</View><Text style={styles.miniBarLabel}>{slot.label.slice(0, 1)}</Text></View>)}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 }, headingText: { flex: 1, minWidth: 180 }, greeting: { color: colors.textMuted, fontSize: 15 }, date: { color: colors.text, fontSize: 27, fontWeight: '900' }, edit: { minHeight: 48, justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 12, borderRadius: 14 }, editText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  progressPanel: { padding: 16, borderRadius: 21, borderColor: '#315457', borderWidth: 1, backgroundColor: '#111B1D', gap: 14 }, panelHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, progressTitle: { color: colors.habitsNav, fontSize: 19, fontWeight: '900' }, panelCount: { color: colors.textMuted, fontSize: 12 }, progressBody: { alignItems: 'center', gap: 14 }, goalRing: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center' }, goalRingLabel: { position: 'absolute', alignItems: 'center' }, goalRingValue: { color: colors.text, fontSize: 35, fontWeight: '900' }, goalRingCaption: { color: colors.textMuted, fontSize: 14 }, progressTiles: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, progressTile: { flexBasis: '48%', flexGrow: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, padding: 10, gap: 4 }, tileTitle: { fontSize: 12, fontWeight: '900' }, tileValue: { color: colors.text, fontSize: 20, fontWeight: '900' }, track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 2 }, fill: { height: '100%', borderRadius: 3 },
  attentionPanel: { padding: 15, borderRadius: 20, borderColor: '#9A4865', borderLeftColor: colors.healthNav, borderWidth: 1, borderLeftWidth: 4, backgroundColor: '#21171D', gap: 9 }, attentionTitle: { color: colors.healthNav, fontSize: 18, fontWeight: '900' }, attentionCount: { color: colors.healthNav, fontSize: 12 }, attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2A1B24', borderRadius: 12, padding: 11 }, attentionText: { flex: 1 }, attentionItemTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, arrow: { color: colors.textMuted, fontSize: 24, fontWeight: '700' },
  journeyPanel: { padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 10 }, journeyTitle: { color: colors.text, fontSize: 19, fontWeight: '900' }, journeyScroll: { maxHeight: 244 }, journeyScrollContent: { gap: 8 }, journeyHint: { color: colors.textDim, fontSize: 11, textAlign: 'center' }, journeyList: { gap: 8 }, journeyGroup: { color: colors.habitsNav, fontSize: 13, fontWeight: '900' }, journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, padding: 11, borderRadius: 12, backgroundColor: colors.surfaceRaised }, journeyName: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 3 },
  mindfulnessCard: { backgroundColor: colors.surface, borderColor: colors.habitsNav, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 }, mindfulnessTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, mindfulnessCopy: { flex: 1, gap: 4 }, mindfulnessValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  trainingCard: { backgroundColor: colors.surface, borderColor: `${colors.workoutsNav}77`, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 }, trainingHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, trainingTitle: { color: colors.text, fontSize: 19, fontWeight: '900' }, trainingRanges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, trainingRange: { minHeight: 40, borderRadius: 11, paddingHorizontal: 11, justifyContent: 'center', backgroundColor: colors.surfaceRaised }, trainingRangeSelected: { backgroundColor: colors.workoutsNav }, trainingRangeText: { color: colors.text, fontSize: 12, fontWeight: '800' }, trainingRangeTextSelected: { color: colors.background }, trainingStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, trainingStat: { flexBasis: '48%', flexGrow: 1, minWidth: 0, borderRadius: 13, backgroundColor: colors.surfaceRaised, padding: 11, gap: 5 }, trainingStatLabel: { color: colors.textMuted, fontSize: 11 }, trainingStatValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, dashboardCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 20, padding: 14, minHeight: 156, gap: 8 }, cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }, cardDot: { width: 8, height: 8, borderRadius: 4 }, cardTitle: { color: colors.text, fontSize: 17, fontWeight: '900', flexShrink: 1 }, cardValue: { color: colors.text, fontSize: 21, fontWeight: '900' }, caption: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, dataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 7 }, rowLabel: { color: colors.textMuted, fontSize: 11, flex: 1 }, rowValue: { color: colors.text, fontSize: 11, fontWeight: '800', maxWidth: '55%', textAlign: 'right' }, trend: { marginTop: 3 }, trendLabel: { color: colors.textMuted, fontSize: 10 }, trendDates: { flexDirection: 'row', justifyContent: 'space-between' }, trendDate: { color: colors.textDim, fontSize: 9 }, miniBars: { height: 58, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }, miniBarSlot: { flex: 1, alignItems: 'center', gap: 2 }, miniBarTrack: { height: 43, width: '100%', justifyContent: 'flex-end', borderBottomColor: colors.border, borderBottomWidth: 1 }, miniBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 }, miniBarLabel: { color: colors.textDim, fontSize: 8 }, empty: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18 },
});
