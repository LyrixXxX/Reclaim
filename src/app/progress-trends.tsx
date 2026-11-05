import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { Chevron } from '@/components/icon';
import { readStepHistory } from '@/lib/activity-step-history';
import { readActiveRoute } from '@/lib/activity-recording';
import { readTodaySteps, readWalkingHistory } from '@/lib/activity-steps';
import { homeGoalColor } from '@/lib/home-goal-colors';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { localDateKey } from '@/lib/progress';
import { allGoalsStreak, formatTrendValue, progressTrends, TrendDayDetail, trendDayDetail, TrendSeries, trendStats, trendSummary } from '@/lib/progress-trends';
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
  // The tapped day for each chart, by chart id ('summary' for Goals hit).
  const [selected, setSelected] = useState<Record<string, string | undefined>>({});
  const toggle = (id: string, date: string) => setSelected((current) => ({ ...current, [id]: current[id] === date ? undefined : date }));

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
        <BarChart color={colors.accent} bars={summary.map((day) => ({ date: day.date, value: day.total ? day.reached : null, max: day.total, reached: day.total > 0 && day.reached === day.total }))} fixedMax={series.length} selected={selected.summary} onSelect={(date) => toggle('summary', date)} />
        <View style={styles.stats}><Stat label="All goals hit" value={`${perfectDays} ${perfectDays === 1 ? 'day' : 'days'}`} /><Stat label="Current streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} /></View>
      </View>
      {(() => {
        const index = summary.findIndex((day) => day.date === selected.summary);
        if (index < 0) return null;
        const day = summary[index];
        const hit = series.filter((item) => item.days[index].reached === true).map((item) => item.title);
        const missed = series.filter((item) => item.days[index].reached === false).map((item) => item.title);
        return <DayCard color={colors.accent} detail={{ heading: dayHeading(day.date), line: day.total ? `${day.reached} of ${day.total} ${day.total === 1 ? 'goal' : 'goals'} hit` : 'No goals measured on this day', status: day.total && day.reached === day.total ? 'hit' : 'missed', parts: [hit.length ? `Hit: ${hit.join(', ')}` : '', missed.length ? `${day.date === today ? 'Not yet' : 'Missed'}: ${missed.join(', ')}` : ''].filter(Boolean) }} onClose={() => toggle('summary', day.date)} />;
      })()}
      {series.map((item) => {
        const stats = trendStats(item.days, today);
        const tint = color(item);
        const picked = item.days.find((day) => day.date === selected[item.id]);
        return <View key={item.id} style={{ gap: spacing.md }}>
          <View style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => router.push(item.href as Href)} hitSlop={6} style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.7 }]}><View style={[styles.dot, { backgroundColor: tint }]} /><Text style={[styles.cardTitle, { flex: 1 }]}>{item.title}</Text><Chevron size={18} color={colors.textMuted} /></Pressable>
            <Text style={styles.muted}>{stats.countedDays ? `Hit ${stats.hitDays} of ${stats.countedDays} ${stats.countedDays === 1 ? 'day' : 'days'}` : 'No data in this range yet'}{stats.average !== null ? ` · Avg ${formatTrendValue(stats.average, item)}` : ''}</Text>
            <BarChart color={tint} bars={item.days.map((day) => ({ date: day.date, value: day.value, max: day.goal, reached: day.reached === true }))} goalLine selected={selected[item.id]} onSelect={(date) => toggle(item.id, date)} />
          </View>
          {picked && <DayCard color={tint} detail={trendDayDetail(item, picked, today)} onClose={() => toggle(item.id, picked.date)} />}
        </View>;
      })}
    </>}
  </ScrollView></SafeAreaView>;
}

type Bar = { date: string; value: number | null; max: number | null; reached: boolean };

/**
 * One bar per day. Hit days are full color, missed days are faded, days with no data are left
 * empty. With goalLine, each day's goal is a short line across its bar, so a goal change shows as
 * a step. Tapping a bar selects that day; tapping it again clears it.
 */
function BarChart({ bars, color, goalLine, fixedMax, selected, onSelect }: { bars: Bar[]; color: string; goalLine?: boolean; fixedMax?: number; selected?: string; onSelect?: (date: string) => void }) {
  const [width, setWidth] = useState(0);
  const height = 120;
  const top = Math.max(1, fixedMax ?? Math.max(...bars.map((bar) => Math.max(bar.value ?? 0, bar.max ?? 0)), 1) * 1.08);
  const gap = bars.length > 30 ? 1 : bars.length > 7 ? 2 : 6;
  const barWidth = width ? Math.max(1, (width - gap * (bars.length - 1)) / bars.length) : 0;
  const y = (value: number) => height - Math.min(1, value / top) * height;
  const labels = bars.length <= 7 ? bars.map((_, index) => index) : [0, Math.floor((bars.length - 1) / 2), bars.length - 1];
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    {width > 0 && <View>
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={colors.border} strokeWidth={1} />
        {bars.map((bar, index) => {
          const x = index * (barWidth + gap);
          const value = bar.value ?? 0;
          const isSelected = bar.date === selected;
          return <G key={bar.date}>
            {isSelected && <Rect x={x - 1} y={0} width={barWidth + 2} height={height} rx={4} fill={colors.text} fillOpacity={0.07} />}
            {bar.value !== null && value > 0 && <Rect x={x} y={y(value)} width={barWidth} height={height - y(value)} rx={Math.min(3, barWidth / 2)} fill={color} fillOpacity={bar.reached || isSelected ? 1 : 0.35} stroke={isSelected ? colors.text : undefined} strokeWidth={isSelected ? 1.5 : 0} />}
            {goalLine && bar.max !== null && bar.max > 0 && <Line x1={x - (gap > 2 ? 1 : 0)} x2={x + barWidth + (gap > 2 ? 1 : 0)} y1={y(bar.max)} y2={y(bar.max)} stroke={colors.text} strokeOpacity={0.55} strokeWidth={1.5} />}
          </G>;
        })}
      </Svg>
      {onSelect && <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>{bars.map((bar, index) => <Pressable key={bar.date} accessibilityRole="button" accessibilityLabel={`${dayHeading(bar.date)}${bar.value === null ? ', no data' : ''}`} accessibilityState={{ selected: bar.date === selected }} onPress={() => onSelect(bar.date)} style={{ width: barWidth + (index === bars.length - 1 ? 0 : gap), height }} />)}</View>}
    </View>}
    <View style={styles.axis}>{labels.map((index) => <Text key={bars[index].date} style={[styles.axisLabel, bars.length <= 7 && { width: barWidth + gap, textAlign: 'center' }]}>{dayLabel(bars[index].date)}</Text>)}</View>
  </View>;
}

/** The detail for one tapped day, shown as its own small card under the chart. */
function DayCard({ detail, color, onClose }: { detail: TrendDayDetail; color: string; onClose: () => void }) {
  const tint = detail.status === 'hit' ? color : detail.status === 'empty' ? colors.textDim : colors.textMuted;
  return <View accessibilityLiveRegion="polite" style={[styles.dayCard, { borderLeftColor: color }]}>
    <View style={styles.cardHeader}><Text style={[styles.dayHeading, { flex: 1 }]}>{detail.heading}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close day details" hitSlop={10} onPress={onClose}><Text style={styles.close}>×</Text></Pressable></View>
    <Text style={styles.dayLine}>{detail.line}</Text>
    {detail.status !== 'empty' && <Text style={[styles.dayStatus, { color: tint }]}>{detail.status === 'hit' ? 'Goal hit' : detail.status === 'so-far' ? 'Today so far' : 'Goal missed'}</Text>}
    {detail.parts.length > 0 && <Text style={styles.muted}>{detail.parts.join(" · ")}</Text>}
  </View>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>;
}

/** "11/3" under each bar. */
function dayLabel(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return `${month}/${day}`;
}

/** "Tuesday, Nov 3". */
function dayHeading(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
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
  dayCard: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 4, borderRadius: 16, padding: spacing.md, gap: 4 },
  dayHeading: { color: colors.text, fontSize: 15, fontFamily: font.bold },
  dayLine: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  dayStatus: { fontSize: 12, fontFamily: font.bold, marginBottom: 2 },
  close: { color: colors.textMuted, fontSize: 22, fontFamily: font.regular, marginTop: -4 },
  statValue: { color: colors.text, fontSize: 16, fontFamily: font.bold },
});
