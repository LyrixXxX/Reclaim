import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { Chevron } from '@/components/icon';
import { readStepHistory } from '@/lib/activity-step-history';
import { readActiveRoute } from '@/lib/activity-recording';
import { readTodaySteps, readWalkingHistory } from '@/lib/activity-steps';
import { homeGoalColor } from '@/lib/home-goal-colors';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { localDateKey } from '@/lib/progress';
import { allGoalsStreak, formatTrendValue, progressTrends, TrendSeries, trendStats, trendSummary } from '@/lib/progress-trends';
import { walkingMinutesHistoryOutsideRoutes } from '@/lib/walking-minutes';
import { StepDay } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, font, layout, spacing } from '@/theme';

const RANGES = [{ label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 }] as const;
const FALLBACK: Record<TrendSeries['kind'], string> = { steps: colors.activityNav, nutrition: colors.nutritionNav, water: colors.habitsNav, habit: colors.habitsNav };

/** Opened by tapping Today's progress on Home: each of those goals, day by day. */
export default function ProgressTrendsScreen() {
  const state = useTrackers();
  const preferences = state.preferences ?? DEFAULT_PREFERENCES;
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [stepDays, setStepDays] = useState<Pick<StepDay, 'date' | 'count'>[]>([]);
  const [phoneMinutesByDate, setPhoneMinutesByDate] = useState<Record<string, number>>({});
  const [today, setToday] = useState(() => localDateKey());

  useFocusEffect(useCallback(() => {
    let active = true;
    setToday(localDateKey());
    void Promise.all([readStepHistory().catch(() => []), readTodaySteps().catch(() => undefined), readWalkingHistory(), readActiveRoute().catch(() => null)]).then(([history, live, walking, route]) => {
      if (!active) return;
      const date = localDateKey();
      // Today's saved total lags the live counter; use the live count so this matches Home.
      setStepDays(live?.status === 'available' && live.count !== undefined ? [...history.filter((day) => day.date !== date), { date, count: live.count }] : history);
      setPhoneMinutesByDate(walkingMinutesHistoryOutsideRoutes(walking, state.activityRoutes ?? [], route));
    });
    return () => { active = false; };
  }, [state.activityRoutes]));

  const series = progressTrends(state, { stepDays, phoneMinutesByDate, today, days });
  const summary = trendSummary(series);
  const judgedDays = summary.filter((day) => day.total > 0);
  const averageHit = judgedDays.length ? judgedDays.reduce((sum, day) => sum + day.reached, 0) / judgedDays.length : null;
  const perfectDays = judgedDays.filter((day) => day.reached === day.total).length;
  const streak = allGoalsStreak(summary);
  const color = (item: TrendSeries) => homeGoalColor(item.id, preferences.homeGoalColors, FALLBACK[item.kind]);

  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Progress trends</Text>
    <Text style={styles.intro}>Your daily goals from Today’s progress, day by day. Each day is measured against the goal you had that day.</Text>
    <View style={styles.ranges}>{RANGES.map((range) => <Pressable key={range.days} accessibilityRole="radio" accessibilityState={{ checked: days === range.days }} onPress={() => setDays(range.days)} style={[styles.range, days === range.days && styles.rangeOn]}><Text style={[styles.rangeText, days === range.days && styles.rangeTextOn]}>{range.label}</Text></Pressable>)}</View>

    {!series.length ? <View style={styles.card}><Text style={styles.cardTitle}>No daily goals yet</Text><Text style={styles.muted}>Set a step goal, a nutrition target or a daily habit goal, and its history shows up here.</Text></View> : <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Goals hit</Text>
        <Text style={styles.muted}>{averageHit === null ? 'No goals measured in this range yet.' : `Average ${formatAverage(averageHit)} of ${series.length} ${series.length === 1 ? 'goal' : 'goals'} a day`}</Text>
        <BarChart color={colors.accent} bars={summary.map((day) => ({ date: day.date, value: day.total ? day.reached : null, max: day.total, reached: day.total > 0 && day.reached === day.total }))} fixedMax={series.length} />
        <View style={styles.stats}><Stat label="All goals hit" value={`${perfectDays} ${perfectDays === 1 ? 'day' : 'days'}`} /><Stat label="Current streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} /></View>
      </View>
      {series.map((item) => {
        const stats = trendStats(item.days, today);
        const tint = color(item);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}. Hit ${stats.hitDays} of ${stats.countedDays} days. Open ${item.title}`} onPress={() => router.push(item.href as Href)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
          <View style={styles.cardHeader}><View style={[styles.dot, { backgroundColor: tint }]} /><Text style={[styles.cardTitle, { flex: 1 }]}>{item.title}</Text><Chevron size={18} color={colors.textMuted} /></View>
          <Text style={styles.muted}>{stats.countedDays ? `Hit ${stats.hitDays} of ${stats.countedDays} ${stats.countedDays === 1 ? 'day' : 'days'}` : 'No data in this range yet'}{stats.average !== null ? ` · Avg ${formatTrendValue(stats.average, item)}` : ''}</Text>
          <BarChart color={tint} bars={item.days.map((day) => ({ date: day.date, value: day.value, max: day.goal, reached: day.reached === true }))} goalLabel={goalLabel(item)} />
        </Pressable>;
      })}
    </>}
  </ScrollView></SafeAreaView>;
}

type Bar = { date: string; value: number | null; max: number | null; reached: boolean };

/**
 * One bar per day. Hit days are full color, missed days are faded, days with no data are left
 * empty. With goalLabel, each day's goal is drawn as a short line across its bar, and the latest
 * goal is labeled at the right end of the line.
 */
function BarChart({ bars, color, goalLabel, fixedMax }: { bars: Bar[]; color: string; goalLabel?: string; fixedMax?: number }) {
  const goalLine = goalLabel !== undefined;
  const lastGoal = [...bars].reverse().find((bar) => bar.max !== null && bar.max > 0)?.max ?? null;
  const [width, setWidth] = useState(0);
  const height = 120;
  const top = Math.max(1, fixedMax ?? Math.max(...bars.map((bar) => Math.max(bar.value ?? 0, bar.max ?? 0)), 1) * 1.08);
  const gap = bars.length > 30 ? 1 : bars.length > 7 ? 2 : 6;
  const barWidth = width ? Math.max(1, (width - gap * (bars.length - 1)) / bars.length) : 0;
  const y = (value: number) => height - Math.min(1, value / top) * height;
  const labels = bars.length <= 7 ? bars.map((_, index) => index) : [0, Math.floor((bars.length - 1) / 2), bars.length - 1];
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} accessible={false}>
    {width > 0 && <Svg width={width} height={height}>
      <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={colors.border} strokeWidth={1} />
      {bars.map((bar, index) => {
        const x = index * (barWidth + gap);
        const value = bar.value ?? 0;
        return <G key={bar.date}>
          {bar.value !== null && value > 0 && <Rect x={x} y={y(value)} width={barWidth} height={height - y(value)} rx={Math.min(3, barWidth / 2)} fill={color} fillOpacity={bar.reached ? 1 : 0.35} />}
          {goalLine && bar.max !== null && bar.max > 0 && <Line x1={x - (gap > 2 ? 1 : 0)} x2={x + barWidth + (gap > 2 ? 1 : 0)} y1={y(bar.max)} y2={y(bar.max)} stroke={colors.text} strokeOpacity={0.55} strokeWidth={1.5} />}
        </G>;
      })}
      {goalLabel && lastGoal !== null && (() => {
        // Sits just above the line, or just below it when the line is near the top. A dark pill keeps it readable over bars.
        const lineY = y(lastGoal);
        const textY = lineY - 7 >= 12 ? lineY - 7 : lineY + 15;
        const labelWidth = goalLabel.length * 6.3 + 10;
        return <G>
          <Rect x={width - labelWidth} y={textY - 11} width={labelWidth} height={15} rx={4} fill={colors.surface} fillOpacity={0.9} />
          <SvgText x={width - 5} y={textY} textAnchor="end" fontSize={11} fontFamily={font.semibold} fill={colors.text}>{goalLabel}</SvgText>
        </G>;
      })()}
    </Svg>}
    <View style={styles.axis}>{labels.map((index) => <Text key={bars[index].date} style={[styles.axisLabel, bars.length <= 7 && { width: barWidth + gap, textAlign: 'center' }]}>{dayLabel(bars[index].date, bars.length)}</Text>)}</View>
  </View>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>;
}

function dayLabel(date: string, count: number) {
  const day = new Date(`${date}T12:00:00`);
  return count <= 7 ? day.toLocaleDateString(undefined, { weekday: 'narrow' }) : day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Goal 8,000 steps": the latest goal in the range, for the label on the goal line. */
function goalLabel(item: TrendSeries) {
  const goal = [...item.days].reverse().find((day) => day.goal !== null && day.goal > 0)?.goal;
  return goal === undefined || goal === null ? undefined : `Goal ${formatTrendValue(goal, item)}`;
}

const formatAverage = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60, gap: spacing.md },
  title: { color: colors.text, fontSize: 27, fontFamily: font.bold },
  intro: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, lineHeight: 21 },
  ranges: { flexDirection: 'row', gap: 8 },
  range: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  rangeOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  rangeText: { color: colors.textMuted, fontSize: 13, fontFamily: font.semibold },
  rangeTextOn: { color: colors.text },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { color: colors.text, fontSize: 17, fontFamily: font.semibold },
  muted: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisLabel: { color: colors.textDim, fontSize: 11, fontFamily: font.regular },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 12 },
  statValue: { color: colors.text, fontSize: 16, fontFamily: font.bold },
});
