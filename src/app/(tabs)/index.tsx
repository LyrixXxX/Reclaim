import { Href, Link, router, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Header } from '@/components/header';
import { GoodHabitIcon } from '@/components/good-habit-icon';
import { RemoveAdsButton } from '@/components/remove-ads-button';
import { DASHBOARD_WIDGETS, homeSecondaryWidgets } from '@/lib/dashboard';
import { DashboardContent, dashboardContent, dashboardDate } from '@/lib/dashboard-content';
import { homeOverview, nutritionShortDetail } from '@/lib/home-overview';
import { stepCalories } from '@/lib/step-calories';
import { homeQuittingTapering, type HomeJourney } from '@/lib/home-quitting';
import { quittingStarts } from '@/lib/quit-progress';
import { QuitHero } from '@/components/quit-hero';
import { StartHereCard, startHereSteps } from '@/components/start-here-card';
import { DEFAULT_PREFERENCES, trainingOverviewVisibleOnHome } from '@/lib/preferences';
import { homeGoalColor } from '@/lib/home-goal-colors';
import { habitProgress } from '@/lib/good-habit-templates';
import { useLiveSteps } from '@/hooks/use-live-steps';
import { localDateKey } from '@/lib/progress';
import { readStepHistory } from '@/lib/activity-step-history';
import { activityRange } from '@/lib/activity-overview';
import { formatMiles } from '@/lib/activity-units';
import { dashboardStart, DashboardRange, trainingTotals } from '@/lib/fitness-dashboard';
import { fromKg } from '@/lib/workouts';
import { ActivityRoute, DashboardWidget, DashboardWidgetId, StepDay, WorkoutSession } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { card, colors, layout, radius, type, font } from '@/theme';
import { Chevron, Icon } from '@/components/icon';

const destinations: Record<DashboardWidgetId, string> = { nutrition: '/nutrition', medications: '/', cpap: '/', weight: '/weight', bloodPressure: '/', labs: '/', habits: '/habits', activity: '/activity', quickActions: '/' };
const accents: Record<DashboardWidgetId, string> = { nutrition: colors.nutritionNav, medications: colors.healthNav, cpap: colors.weightNav, weight: colors.activityNav, bloodPressure: colors.healthNav, labs: colors.healthNav, habits: colors.habitsNav, activity: colors.activityNav, quickActions: colors.accent };

export default function DashboardScreen() {
  const state = useTrackers();
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const widgets = homeSecondaryWidgets(preferences);
  const [now, setNow] = useState(() => new Date());
  const [stepDays, setStepDays] = useState<StepDay[]>([]);
  const cardWidth = '100%' as const;
  const live = useLiveSteps({ enabled: preferences.visibleSections.activity, walking: true });
  const steps = live.steps;
  const stepBurn = steps.status === 'available' ? stepCalories(steps.count, state.weightEntries, localDateKey(now)) : undefined;
  const walking = live.walking;
  useFocusEffect(useCallback(() => {
    setNow(new Date());
    if (preferences.visibleSections.activity) void readStepHistory().then(setStepDays).catch(() => undefined);
    const timer = setInterval(() => { setNow(new Date()); if (preferences.visibleSections.activity) void readStepHistory().then(setStepDays).catch(() => undefined); }, 60_000);
    const subscription = AppState.addEventListener('change', (status) => { if (status === 'active') { setNow(new Date()); if (preferences.visibleSections.activity) void readStepHistory().then(setStepDays).catch(() => undefined); } });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [preferences.visibleSections.activity]));
  const overview = homeOverview(state, steps, new Date(Math.max(now.getTime(), live.readAt)), walking);
  const journeys = preferences.showQuittingTaperingOnHome === false || !preferences.visibleSections.goals ? { quitting: [], tapering: [] } : homeQuittingTapering(state.trackers, state.taperSteps ?? [], now);
  const showQuits = preferences.showQuittingTaperingOnHome !== false && preferences.visibleSections.goals;
  const quitStarts = showQuits ? quittingStarts(state.trackers, state.taperSteps ?? []) : [];
  const hasTraining = (state.workoutSessions ?? []).some((item) => item.endedAt) || (state.activityRoutes ?? []).length > 0;
  const todayKey = localDateKey(now);
  const liveStepDays = steps.status === 'available' && steps.count !== undefined ? [...stepDays.filter((day) => day.date !== todayKey), { date: todayKey, count: steps.count, incomplete: !!steps.incomplete }] : stepDays;
  const week = activityRange(liveStepDays, state.stepGoals ?? [], '7D', 0, now);
  const hasProgress = overview.goalCount > 0;
  const mindfulness = state.trackers.find((item) => item.habitTemplate === 'mindfulness' && !item.archived && !(preferences.hiddenHomeHabitIds ?? []).includes(item.id));
  const mindfulnessProgress = mindfulness ? habitProgress(mindfulness, state.goodHabitLogs ?? [], [], now) : null;
  const goalColor = (id: string, fallback: string) => homeGoalColor(id, preferences.homeGoalColors, fallback);
  const ringSegments = [
    ...(overview.stepProgress ? [{ name: 'Steps', color: goalColor('steps', colors.activityNav), progress: (overview.stepProgress.count ?? 0) / overview.stepProgress.target }] : []),
    ...(overview.nutrition ? [{ name: 'Nutrition', color: goalColor('nutrition', colors.nutritionNav), progress: overview.nutrition.calories / Math.max(1, overview.nutrition.budget) }] : []),
    ...overview.dailyHabitGoals.map((goal) => ({ name: goal.title, color: goalColor(goal.id, colors.habitsNav), progress: goal.progress })),
  ];
  const ringSize = 132;
  const ringCenter = ringSize / 2;
  const ringRadius = 55;

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Header />
    <View style={styles.heading}><View style={styles.headingText}><Text style={styles.greeting}>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text><Text accessibilityRole="header" style={styles.date}>{greeting(now)}</Text></View><Link href={'/dashboard-edit' as Href} asChild><Pressable accessibilityRole="button" accessibilityLabel="Edit dashboard" style={styles.edit}><Icon name="sliders" size={19} color={colors.text} /></Pressable></Link></View>

    {quitStarts.length > 0 && <QuitHero starts={quitStarts} featuredId={preferences.featuredTrackerId} cravings={state.cravings ?? []} goals={state.savingsGoals ?? []} now={now.getTime()} onFeature={state.setFeaturedTracker} />}

    <StartHereCard steps={startHereSteps(state, preferences.visibleSections)} prefs={preferences.startHere} onUpdate={state.updateStartHere} />

    {overview.attention.length > 0 && <View style={styles.attentionPanel}><View style={styles.panelHeading}><Text style={styles.attentionTitle}>Needs attention</Text><Text style={styles.attentionCount}>{overview.attention.length} {overview.attention.length === 1 ? 'item' : 'items'}</Text></View>{overview.attention.map((item) => <Link key={item.id} href={item.href as Href} asChild><Pressable accessibilityRole="button" style={styles.attentionRow}><View style={styles.attentionText}><Text style={styles.attentionItemTitle}>{item.title}</Text><Text style={styles.caption}>{item.detail}</Text></View><Chevron color={colors.textMuted} /></Pressable></Link>)}</View>}

    {hasProgress && <View style={styles.progressPanel}>
      <View style={styles.panelHeading}><Text style={styles.progressTitle}>Today’s progress</Text><Text style={styles.panelCount}>{overview.goalCount ? `${overview.reachedCount} of ${overview.goalCount} goals` : 'Today at a glance'}</Text></View>
      <View style={styles.progressBody}><View style={styles.progressHero}>
        {overview.goalCount > 0 && <View style={styles.goalRing}><Svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} accessibilityLabel={ringSegments.map((segment) => `${segment.name} ${Math.round(Math.min(1, Math.max(0, segment.progress)) * 100)}%`).join(', ')}>{ringSegments.map((segment, index) => {
          const circumference = 2 * Math.PI * ringRadius;
          const arc = circumference / ringSegments.length - 8;
          const rotation = -90 + index * (360 / ringSegments.length);
          return <Circle key={segment.name} cx={ringCenter} cy={ringCenter} r={ringRadius} fill="none" stroke={colors.border} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${arc} ${circumference - arc}`} rotation={rotation} origin={`${ringCenter}, ${ringCenter}`} />;
        })}{ringSegments.map((segment, index) => {
          const circumference = 2 * Math.PI * ringRadius;
          const arc = circumference / ringSegments.length - 8;
          const filled = arc * Math.min(1, Math.max(0, segment.progress));
          return filled > 0 ? <Circle key={segment.name} cx={ringCenter} cy={ringCenter} r={ringRadius} fill="none" stroke={segment.color} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${filled} ${circumference - filled}`} rotation={-90 + index * (360 / ringSegments.length)} origin={`${ringCenter}, ${ringCenter}`} /> : null;
        })}</Svg><View style={styles.goalRingLabel}><Text style={styles.goalRingValue}>{overview.reachedCount}/{overview.goalCount}</Text><Text style={styles.goalRingCaption}>goals</Text></View></View>}
        <View style={styles.legend}>{ringSegments.map((segment) => <View key={segment.name} style={styles.legendRow}><View style={[styles.cardDot, { backgroundColor: segment.color }]} /><Text style={styles.legendName} numberOfLines={1}>{segment.name}</Text><Text style={styles.legendValue}>{Math.round(Math.min(1, Math.max(0, segment.progress)) * 100)}%</Text></View>)}</View>
        </View>
        <View style={styles.progressTiles}>
          {overview.stepProgress && <ProgressTile title="Steps" value={`${overview.stepProgress.count === null ? '—' : overview.stepProgress.count.toLocaleString()} / ${overview.stepProgress.target.toLocaleString()}`} detail={stepBurn ? <>Est. calories: <Text style={styles.tileStrong}>{stepBurn.kcal.toLocaleString()}</Text></> : 'Awaiting step data'} progress={(overview.stepProgress.count ?? 0) / overview.stepProgress.target} color={goalColor('steps', colors.activityNav)} href="/activity" />}
          {overview.nutrition && <ProgressTile title="Nutrition" value={`${Math.round(overview.nutrition.calories).toLocaleString()} / ${Math.round(overview.nutrition.budget).toLocaleString()} kcal`} detail={nutritionShortDetail(overview.nutrition.calories, overview.nutrition.budget, overview.nutrition.entryCount)} progress={overview.nutrition.calories / Math.max(1, overview.nutrition.budget)} color={goalColor('nutrition', colors.nutritionNav)} valueColor={overview.nutrition.entryCount ? overview.nutrition.calories > overview.nutrition.budget + 200 ? colors.danger : colors.success : colors.text} href="/nutrition" />}
          {overview.dailyHabitGoals.map((goal) => <ProgressTile key={goal.id} title={goal.title} value={goal.value} detail={goal.short} progress={goal.progress} color={goalColor(goal.id, colors.habitsNav)} href={goal.href} />)}
        </View>
      </View>
    </View>}

    {trainingOverviewVisibleOnHome(preferences) && hasTraining && <TrainingOverviewHomeCard sessions={state.workoutSessions ?? []} routes={state.activityRoutes ?? []} unit={state.workoutSettings?.weightUnit ?? 'lb'} now={now} />}

    {mindfulness && mindfulnessProgress && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${mindfulness.displayName || mindfulness.name}`} onPress={() => router.push(`/tracker/${encodeURIComponent(mindfulness.id)}` as Href)} style={styles.mindfulnessCard}>
      <View style={styles.mindfulnessTop}><GoodHabitIcon type="mindfulness" size={54} /><View style={styles.mindfulnessCopy}><Text style={styles.cardTitle}>{mindfulness.displayName || mindfulness.name}</Text><Text style={styles.caption}>{mindfulness.mindfulnessVisualMode === 'quiet' ? 'Quiet Zen' : 'Breathing guide'} · Tap to start a session</Text></View><Chevron color={colors.textMuted} /></View>
      <Text style={styles.mindfulnessValue}>{Number(mindfulnessProgress.amount.toFixed(1))} / {mindfulnessProgress.goal} min today</Text><View style={styles.track}><View style={[styles.fill, { width: `${mindfulnessProgress.percent}%`, backgroundColor: goalColor(mindfulness.id, colors.habitsNav) }]} /></View>
    </Pressable>}

    {overview.weeklyHabitCards.map((goal) => { const color = goalColor(goal.id, colors.habitsNav); return <Pressable key={goal.id} accessibilityRole="button" onPress={() => router.push(goal.href as Href)} style={styles.dashboardCard}><View style={styles.cardTitleRow}><View style={[styles.cardDot, { backgroundColor: color }]} /><Text style={styles.cardTitle}>{goal.title}</Text></View><Text style={styles.cardValue}>{goal.value}</Text><Text style={styles.caption}>{goal.detail}</Text><View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, goal.progress * 100))}%`, backgroundColor: color }]} /></View></Pressable>; })}
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
    <Pressable accessibilityRole="button" accessibilityLabel="Open Workouts" onPress={() => router.push('/workouts' as Href)} style={styles.trainingHeading}><Text accessibilityRole="header" style={styles.trainingTitle}>Training overview</Text><Chevron color={colors.textMuted} /></Pressable>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trainingRangeScroll} contentContainerStyle={styles.trainingRanges}>{(Object.keys(trainingRanges) as DashboardRange[]).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: range === item }} onPress={() => setRange(item)} style={[styles.trainingRange, range === item && styles.trainingRangeSelected]}><Text style={[styles.trainingRangeText, range === item && styles.trainingRangeTextSelected]}>{trainingRanges[item]}</Text></Pressable>)}</ScrollView>
    <View style={styles.trainingStats}>{stats.map((stat) => <View key={stat.label} style={styles.trainingStat}><Text style={styles.trainingStatLabel}>{stat.label}</Text><Text style={styles.trainingStatValue} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text></View>)}</View>
    <Text style={styles.caption}>Strength comes from completed workouts; cardio comes from saved routes.</Text>
  </View>;
}

function JourneyList({ title, items }: { title: string; items: HomeJourney[] }) {
  return <View style={styles.journeyList}><Text style={styles.journeyGroup}>{title}</Text>{items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => router.push(item.href as Href)} style={styles.journeyRow}><View style={{ flex: 1 }}><Text style={styles.journeyName}>{item.title}</Text><Text style={styles.caption}>{item.timeframe}</Text></View><Chevron color={colors.textMuted} /></Pressable>)}</View>;
}

/** A compact, tappable goal: a name, one bold line, one small line, and a progress bar. */
function ProgressTile({ title, value, detail, progress, color, valueColor, href }: { title: string; value: string; detail: ReactNode; progress: number; color: string; valueColor?: string; href: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(href as Href)} style={({ pressed }) => [styles.progressTile, pressed && { opacity: 0.8 }]}>
    <View style={styles.tileTitleRow}><View style={[styles.cardDot, { backgroundColor: color }]} /><Text style={styles.tileTitle} numberOfLines={1}>{title}</Text></View>
    <Text style={[styles.tileValue, valueColor && { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{value}</Text>
    <Text style={styles.tileDetail} numberOfLines={1}>{detail}</Text>
    <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: color }]} /></View>
  </Pressable>;
}

function DashboardCard({ widget, content, overview, week, width }: { widget: DashboardWidget; content: DashboardContent; overview: ReturnType<typeof homeOverview>; week: ReturnType<typeof activityRange>; width: '48%' | '100%' }) {
  const color = accents[widget.id];
  const title = DASHBOARD_WIDGETS.find((item) => item.id === widget.id)?.title ?? widget.id;
  const progress = widget.id === 'nutrition' && overview.nutrition ? overview.nutrition.calories / Math.max(1, overview.nutrition.budget)
    : widget.id === 'activity' && overview.stepProgress ? (overview.stepProgress.count ?? 0) / overview.stepProgress.target
      : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={() => router.push(destinations[widget.id] as Href)} style={[styles.dashboardCard, { width }]}>
    <View style={styles.cardHeader}><View style={styles.cardTitleRow}><View style={[styles.cardDot, { backgroundColor: color }]} /><Text style={styles.cardTitle} numberOfLines={2}>{title}</Text></View><Chevron color={colors.textMuted} /></View>
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
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, marginTop: 10, marginBottom: 4 }, headingText: { flex: 1, minWidth: 180, gap: 2 }, greeting: { color: colors.textMuted, fontSize: 14, fontFamily: font.medium }, date: { color: colors.text, ...type.display }, edit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill }, editText: { color: colors.text, fontSize: 13, fontFamily: font.semibold },
  progressPanel: { ...card, padding: 18, gap: 16 }, panelHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, progressTitle: { color: colors.text, ...type.title }, panelCount: { color: colors.textMuted, fontSize: 13 , fontFamily: font.regular}, progressBody: { gap: 16 }, progressHero: { flexDirection: 'row', alignItems: 'center', gap: 20 }, legend: { flex: 1, gap: 10 }, legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, legendName: { flex: 1, color: colors.textMuted, fontSize: 14, fontFamily: font.medium }, legendValue: { color: colors.text, fontSize: 14, fontFamily: font.bold, fontVariant: ['tabular-nums'] }, goalRing: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }, goalRingLabel: { position: 'absolute', alignItems: 'center' }, goalRingValue: { color: colors.text, fontSize: 28, fontFamily: font.extrabold, letterSpacing: -0.6 }, goalRingCaption: { color: colors.textMuted, fontSize: 13 , fontFamily: font.regular}, progressTiles: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, progressTile: { flexBasis: '48%', flexGrow: 0, width: '48.5%', minWidth: 0, height: 108, justifyContent: 'space-between', borderRadius: radius.md, backgroundColor: colors.surfaceRaised, padding: 12 }, tileDetail: { color: colors.textMuted, fontSize: 12, fontFamily: font.medium }, tileStrong: { color: colors.text, fontFamily: font.bold }, tileTitle: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold, flexShrink: 1 }, tileValue: { color: colors.text, fontSize: 17, fontFamily: font.bold, fontVariant: ['tabular-nums'] }, track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 4 }, fill: { height: '100%', borderRadius: 3 },
  attentionPanel: { padding: 16, borderRadius: radius.lg, borderColor: `${colors.healthNav}40`, borderWidth: 1, backgroundColor: `${colors.healthNav}0F`, gap: 10 }, attentionTitle: { color: colors.healthNav, ...type.heading }, attentionCount: { color: colors.textMuted, fontSize: 12 , fontFamily: font.regular}, attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 }, attentionText: { flex: 1, gap: 2 }, attentionItemTitle: { color: colors.text, fontSize: 14, fontFamily: font.semibold }, arrow: { color: colors.textDim, fontSize: 22, fontFamily: font.medium },
  journeyPanel: { ...card, padding: 18, gap: 12 }, journeyTitle: { color: colors.text, ...type.title }, journeyScroll: { maxHeight: 244 }, journeyScrollContent: { gap: 8 }, journeyHint: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, textAlign: 'center' }, journeyList: { gap: 8 }, journeyGroup: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.6, textTransform: 'uppercase' }, journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceRaised }, journeyName: { color: colors.text, fontSize: 15, fontFamily: font.semibold, marginBottom: 2 },
  mindfulnessCard: { ...card, padding: 18, gap: 12 }, mindfulnessTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, mindfulnessCopy: { flex: 1, gap: 4 }, mindfulnessValue: { color: colors.text, fontSize: 21, fontFamily: font.bold },
  trainingCard: { ...card, padding: 18, gap: 14 }, trainingHeading: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, trainingTitle: { color: colors.text, ...type.title }, trainingRangeScroll: { marginHorizontal: -18 }, trainingRanges: { flexDirection: 'row', gap: 6, paddingHorizontal: 18 }, trainingRange: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surfaceRaised }, trainingRangeSelected: { backgroundColor: colors.text }, trainingRangeText: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold }, trainingRangeTextSelected: { color: colors.background }, trainingStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, trainingStat: { flexBasis: '48%', flexGrow: 1, minWidth: 0, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, padding: 12, gap: 4 }, trainingStatLabel: { color: colors.textMuted, fontSize: 12 , fontFamily: font.regular}, trainingStatValue: { color: colors.text, fontSize: 17, fontFamily: font.bold },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, dashboardCard: { ...card, padding: 18, minHeight: 140, gap: 8 }, cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }, cardDot: { width: 8, height: 8, borderRadius: 4 }, tileTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, cardTitle: { color: colors.text, ...type.heading, flexShrink: 1 }, cardValue: { color: colors.text, fontSize: 22, fontFamily: font.bold, letterSpacing: -0.3 }, caption: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 18 }, dataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 8 }, rowLabel: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, flex: 1 }, rowValue: { color: colors.text, fontSize: 12, fontFamily: font.semibold, maxWidth: '55%', textAlign: 'right' }, trend: { marginTop: 4 }, trendLabel: { color: colors.textMuted, fontSize: 11 , fontFamily: font.regular}, trendDates: { flexDirection: 'row', justifyContent: 'space-between' }, trendDate: { color: colors.textDim, fontSize: 11 , fontFamily: font.regular}, miniBars: { height: 60, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }, miniBarSlot: { flex: 1, alignItems: 'center', gap: 3 }, miniBarTrack: { height: 42, width: '100%', justifyContent: 'flex-end', borderBottomColor: colors.border, borderBottomWidth: 1 }, miniBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 }, miniBarLabel: { color: colors.textDim, fontSize: 11 , fontFamily: font.regular}, empty: { ...card, padding: 18 },
});
