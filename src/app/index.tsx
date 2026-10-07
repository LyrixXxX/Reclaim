import { Href, Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Header } from '@/components/header';
import { DASHBOARD_WIDGETS, homeSecondaryWidgets } from '@/lib/dashboard';
import { DashboardContent, dashboardContent, dashboardDate } from '@/lib/dashboard-content';
import { homeOverview } from '@/lib/home-overview';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { readTodaySteps, StepResult } from '@/lib/activity-steps';
import { readStepHistory } from '@/lib/activity-step-history';
import { activityRange } from '@/lib/activity-overview';
import { DashboardWidget, DashboardWidgetId, StepDay } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout } from '@/theme';

const destinations: Record<DashboardWidgetId, string> = { nutrition: '/nutrition', medications: '/medications', cpap: '/cpap', weight: '/weight', bloodPressure: '/health', labs: '/labs', habits: '/habits', activity: '/activity', quickActions: '/' };
const accents: Record<DashboardWidgetId, string> = { nutrition: colors.nutritionNav, medications: colors.healthNav, cpap: colors.weightNav, weight: colors.activityNav, bloodPressure: colors.healthNav, labs: colors.healthNav, habits: colors.habitsNav, activity: colors.activityNav, quickActions: colors.accent };

export default function DashboardScreen() {
  const state = useTrackers();
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const widgets = homeSecondaryWidgets(preferences);
  const [now, setNow] = useState(() => new Date());
  const [steps, setSteps] = useState<StepResult>({ status: 'permission-needed' });
  const [stepDays, setStepDays] = useState<StepDay[]>([]);
  const cardWidth = '100%' as const;
  useFocusEffect(useCallback(() => {
    setNow(new Date());
    if (preferences.visibleSections.activity) { void readTodaySteps().then(setSteps); void readStepHistory().then(setStepDays).catch(() => undefined); }
    const timer = setInterval(() => { setNow(new Date()); if (preferences.visibleSections.activity) void readStepHistory().then(setStepDays).catch(() => undefined); }, 60_000);
    const stepsTimer = preferences.visibleSections.activity ? setInterval(() => { void readTodaySteps().then(setSteps); }, 3000) : undefined;
    const subscription = AppState.addEventListener('change', (status) => { if (status === 'active') { setNow(new Date()); if (preferences.visibleSections.activity) { void readTodaySteps().then(setSteps); void readStepHistory().then(setStepDays).catch(() => undefined); } } });
    return () => { clearInterval(timer); if (stepsTimer) clearInterval(stepsTimer); subscription.remove(); };
  }, [preferences.visibleSections.activity]));
  const overview = homeOverview(state, steps, now);
  const week = activityRange(stepDays, state.stepGoals ?? [], '7D', 0, now);
  const hasProgress = Boolean(overview.stepProgress || overview.cpap || overview.nutrition || overview.medications);
  const ringSegments = [
    { name: 'Steps', color: colors.activityNav, progress: overview.stepProgress ? (overview.stepProgress.count ?? 0) / overview.stepProgress.target : 0 },
    { name: 'CPAP', color: colors.cpapNav, progress: overview.cpap?.target && overview.cpap.usedMinutes !== null ? overview.cpap.usedMinutes / overview.cpap.target : 0 },
    { name: 'Nutrition', color: colors.nutritionNav, progress: overview.nutrition ? overview.nutrition.calories / Math.max(1, overview.nutrition.budget) : 0 },
    { name: 'Doses', color: colors.healthNav, progress: overview.medications ? overview.medications.taken / overview.medications.total : 0 },
  ];

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Header />
    <View style={styles.heading}><View style={styles.headingText}><Text style={styles.greeting}>{greeting(now)},</Text><Text accessibilityRole="header" style={styles.date}>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text></View><Link href={'/dashboard-edit' as Href} asChild><Pressable accessibilityRole="button" style={styles.edit}><Text style={styles.editText}>▦  Edit dashboard</Text></Pressable></Link></View>

    {hasProgress && <View style={styles.progressPanel}>
      <View style={styles.panelHeading}><Text style={styles.progressTitle}>Today’s progress</Text><Text style={styles.panelCount}>{overview.goalCount ? `${overview.reachedCount} of ${overview.goalCount} goals` : 'Today at a glance'}</Text></View>
      <View style={styles.progressBody}>
        {overview.goalCount > 0 && <View style={styles.goalRing}><Svg width={124} height={124} viewBox="0 0 124 124" accessibilityLabel={ringSegments.map((segment) => `${segment.name} ${Math.round(Math.min(1, Math.max(0, segment.progress)) * 100)}%`).join(', ')}>{ringSegments.map((segment, index) => {
          const circumference = 2 * Math.PI * 51;
          const arc = circumference / 4 - 8;
          const rotation = -90 + index * 90;
          return <Circle key={segment.name} cx={62} cy={62} r={51} fill="none" stroke={colors.border} strokeWidth={11} strokeLinecap="round" strokeDasharray={`${arc} ${circumference - arc}`} rotation={rotation} origin="62, 62" />;
        })}{ringSegments.map((segment, index) => {
          const circumference = 2 * Math.PI * 51;
          const arc = circumference / 4 - 8;
          const filled = arc * Math.min(1, Math.max(0, segment.progress));
          return filled > 0 ? <Circle key={segment.name} cx={62} cy={62} r={51} fill="none" stroke={segment.color} strokeWidth={11} strokeLinecap="round" strokeDasharray={`${filled} ${circumference - filled}`} rotation={-90 + index * 90} origin="62, 62" /> : null;
        })}</Svg><View style={styles.goalRingLabel}><Text style={styles.goalRingValue}>{overview.reachedCount}/{overview.goalCount}</Text><Text style={styles.goalRingCaption}>goals</Text></View></View>}
        <View style={styles.progressTiles}>
          {overview.stepProgress && <ProgressTile title="Steps" value={overview.stepProgress.count === null ? 'Awaiting steps' : overview.stepProgress.count.toLocaleString()} detail={`Goal ${overview.stepProgress.target.toLocaleString()} steps`} progress={(overview.stepProgress.count ?? 0) / overview.stepProgress.target} color={colors.activityNav} href="/activity" />}
          {overview.cpap && <ProgressTile title="CPAP" value={overview.cpap.usedMinutes === null ? overview.cpap.target === null ? 'Starts next night' : 'Awaiting reading' : `${Math.floor(overview.cpap.usedMinutes / 60)}h ${overview.cpap.usedMinutes % 60}m`} detail={overview.cpap.target === null ? 'Goal applies to upcoming nights' : `Last night · goal ${Math.floor(overview.cpap.target / 60)}h ${overview.cpap.target % 60}m`} progress={overview.cpap.target && overview.cpap.usedMinutes !== null ? overview.cpap.usedMinutes / overview.cpap.target : 0} color={colors.cpapNav} href="/cpap" />}
          {overview.nutrition && <ProgressTile title="Nutrition" value={`${Math.round(overview.nutrition.calories).toLocaleString()} kcal`} detail={overview.nutrition.entryCount ? `of ${Math.round(overview.nutrition.budget).toLocaleString()} budget` : 'No food logged yet'} progress={overview.nutrition.calories / Math.max(1, overview.nutrition.budget)} color={colors.nutritionNav} valueColor={overview.nutrition.entryCount ? overview.nutrition.calories > overview.nutrition.budget ? colors.danger : colors.success : colors.text} href="/nutrition" />}
          {overview.medications && <ProgressTile title="Doses" value={`${overview.medications.taken} of ${overview.medications.total}`} detail={overview.medications.skipped ? `${overview.medications.skipped} skipped` : 'scheduled doses taken'} progress={overview.medications.taken / overview.medications.total} color={colors.healthNav} href="/medications" />}
        </View>
      </View>
    </View>}

    {overview.attention.length > 0 && <View style={styles.attentionPanel}><View style={styles.panelHeading}><Text style={styles.attentionTitle}>Needs attention</Text><Text style={styles.attentionCount}>{overview.attention.length} {overview.attention.length === 1 ? 'item' : 'items'}</Text></View>{overview.attention.map((item) => <Link key={item.id} href={item.href as Href} asChild><Pressable accessibilityRole="button" style={styles.attentionRow}><View style={styles.attentionText}><Text style={styles.attentionItemTitle}>{item.title}</Text><Text style={styles.caption}>{item.detail}</Text></View><Text style={styles.arrow}>›</Text></Pressable></Link>)}</View>}

    {widgets.length > 0 && <><View style={styles.dashboardHeading}><Text style={styles.dashboardTitle}>Weight at a glance</Text><Text style={styles.dashboardHint}>Tap to open Weight</Text></View>
      <View style={styles.grid}>{widgets.map((widget) => <DashboardCard key={widget.id} widget={widget} content={dashboardContent(state, widget, now, steps)} overview={overview} week={week} width={cardWidth} />)}</View></>}
  </ScrollView></SafeAreaView>;
}

function greeting(now: Date) { return now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'; }

function ProgressTile({ title, value, detail, progress, color, valueColor, href }: { title: string; value: string; detail: string; progress: number; color: string; valueColor?: string; href: string }) {
  return <Pressable accessibilityRole="button" onPress={() => router.push(href as Href)} style={[styles.progressTile, { borderColor: `${color}44`, backgroundColor: `${color}0D` }]}><Text style={[styles.tileTitle, { color }]}>{title}</Text><Text style={[styles.tileValue, valueColor && { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.caption} numberOfLines={2}>{detail}</Text><View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: color }]} /></View></Pressable>;
}

function DashboardCard({ widget, content, overview, week, width }: { widget: DashboardWidget; content: DashboardContent; overview: ReturnType<typeof homeOverview>; week: ReturnType<typeof activityRange>; width: '48%' | '100%' }) {
  const color = accents[widget.id];
  const title = DASHBOARD_WIDGETS.find((item) => item.id === widget.id)?.title ?? widget.id;
  const progress = widget.id === 'nutrition' && overview.nutrition ? overview.nutrition.calories / Math.max(1, overview.nutrition.budget)
    : widget.id === 'activity' && overview.stepProgress ? (overview.stepProgress.count ?? 0) / overview.stepProgress.target
      : widget.id === 'medications' && overview.medications ? overview.medications.taken / overview.medications.total : null;
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
  progressPanel: { padding: 16, borderRadius: 21, borderColor: '#315457', borderWidth: 1, backgroundColor: '#111B1D', gap: 14 }, panelHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, progressTitle: { color: colors.habitsNav, fontSize: 19, fontWeight: '900' }, panelCount: { color: colors.textMuted, fontSize: 12 }, progressBody: { alignItems: 'center', gap: 14 }, goalRing: { width: 124, height: 124, alignItems: 'center', justifyContent: 'center' }, goalRingLabel: { position: 'absolute', alignItems: 'center' }, goalRingValue: { color: colors.text, fontSize: 25, fontWeight: '900' }, goalRingCaption: { color: colors.textMuted, fontSize: 11 }, progressTiles: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, progressTile: { flexBasis: '48%', flexGrow: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, padding: 10, gap: 4 }, tileTitle: { fontSize: 12, fontWeight: '900' }, tileValue: { color: colors.text, fontSize: 20, fontWeight: '900' }, track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 2 }, fill: { height: '100%', borderRadius: 3 },
  attentionPanel: { padding: 15, borderRadius: 20, borderColor: '#9A4865', borderLeftColor: colors.healthNav, borderWidth: 1, borderLeftWidth: 4, backgroundColor: '#21171D', gap: 9 }, attentionTitle: { color: colors.healthNav, fontSize: 18, fontWeight: '900' }, attentionCount: { color: colors.healthNav, fontSize: 12 }, attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2A1B24', borderRadius: 12, padding: 11 }, attentionText: { flex: 1 }, attentionItemTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, arrow: { color: colors.textMuted, fontSize: 24, fontWeight: '700' },
  dashboardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 5 }, dashboardTitle: { color: colors.text, fontSize: 19, fontWeight: '900' }, dashboardHint: { color: colors.textMuted, fontSize: 12 }, grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, dashboardCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 20, padding: 14, minHeight: 156, gap: 8 }, cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }, cardDot: { width: 8, height: 8, borderRadius: 4 }, cardTitle: { color: colors.text, fontSize: 17, fontWeight: '900', flexShrink: 1 }, cardValue: { color: colors.text, fontSize: 21, fontWeight: '900' }, caption: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, dataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 7 }, rowLabel: { color: colors.textMuted, fontSize: 11, flex: 1 }, rowValue: { color: colors.text, fontSize: 11, fontWeight: '800', maxWidth: '55%', textAlign: 'right' }, trend: { marginTop: 3 }, trendLabel: { color: colors.textMuted, fontSize: 10 }, trendDates: { flexDirection: 'row', justifyContent: 'space-between' }, trendDate: { color: colors.textDim, fontSize: 9 }, miniBars: { height: 58, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }, miniBarSlot: { flex: 1, alignItems: 'center', gap: 2 }, miniBarTrack: { height: 43, width: '100%', justifyContent: 'flex-end', borderBottomColor: colors.border, borderBottomWidth: 1 }, miniBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 }, miniBarLabel: { color: colors.textDim, fontSize: 8 }, empty: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18 },
});
