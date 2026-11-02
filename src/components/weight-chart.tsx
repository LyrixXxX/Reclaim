import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { useNow } from '@/hooks/use-now';
import { RollingRange, rollingBounds } from '@/lib/rolling-range';

import { latestWeightGoal, weightTrendSeries } from '@/lib/weight';
import { WeightEntry } from '@/models/tracker';
import { colors } from '@/theme';

const HEIGHT = 238;
const PAD = { top: 22, right: 12, bottom: 32, left: 38 };
const DAILY = '#76B2FA';
const AVERAGE = '#5FE08A';
const GOAL = '#F3BA4D';

export function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const [range, setRange] = useState<RollingRange>('30D');
  const [offset, setOffset] = useState(0);
  const now = useNow(60000);
  const [width, setWidth] = useState(320);
  const allSeries = useMemo(() => weightTrendSeries(entries), [entries]);
  const bounds = rollingBounds(range, offset, new Date(now));
  const series = useMemo(() => allSeries.filter((point) => point.entry.date >= bounds.start && point.entry.date <= bounds.end), [allSeries, bounds.start, bounds.end]);

  const goal = latestWeightGoal(entries);
  const values = [...series.flatMap((point) => [point.entry.weight, point.average]), ...(goal === undefined ? [] : [goal])];
  const min = values.length ? Math.floor(Math.min(...values) - 2) : 0;
  const max = values.length ? Math.ceil(Math.max(...values) + 2) : 1;
  const chartWidth = Math.max(1, width - PAD.left - PAD.right);
  const chartHeight = HEIGHT - PAD.top - PAD.bottom;
  const y = (value: number) => PAD.top + chartHeight - ((value - min) / Math.max(1, max - min)) * chartHeight;
  const axisStart = range === 'ALL' ? allSeries[0]?.entry.date ?? bounds.end : bounds.start;
  const axisDays = Math.max(1, (Date.parse(`${bounds.end}T12:00:00`) - Date.parse(`${axisStart}T12:00:00`)) / 86_400_000);
  const x = (index: number) => PAD.left + Math.max(0, Math.min(1, (Date.parse(`${series[index].entry.date}T12:00:00`) - Date.parse(`${axisStart}T12:00:00`)) / (axisDays * 86_400_000))) * chartWidth;
  const dailyPoints = series.map((point, index) => `${x(index)},${y(point.entry.weight)}`).join(' ');
  const averagePoints = series.map((point, index) => `${x(index)},${y(point.average)}`).join(' ');
  const change = series.length > 1 ? series.at(-1)!.entry.weight - series[0].entry.weight : 0;
  const rangeLabel = range === 'ALL' ? 'All history' : `${range.slice(0, -1)}-day window`;

  return <View style={styles.card} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - 28)}>
    <View style={styles.header}><View><Text style={styles.title}>Weight trend</Text><Text style={styles.subtitle}>{rangeLabel} · {series.length} {series.length === 1 ? 'entry' : 'entries'}</Text></View>{series.length > 1 ? <View style={styles.change}><Text style={styles.changeText}>{change > 0 ? '+' : ''}{format(change)} {series.at(-1)!.entry.unit}</Text></View> : null}</View>
    {series.length > 0 && <Text style={styles.subtitle}>{series.length} weigh-in{series.length === 1 ? '' : 's'} in this window</Text>}
    <View style={{ width: '100%', marginTop: 16 }}><RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={range === 'ALL' ? allSeries[0]?.entry.date ?? bounds.end : bounds.start} end={bounds.end} accent={colors.weightNav} /></View>
    {!series.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>{allSeries.length ? 'No weigh-ins in this date window' : 'No weight history yet'}</Text><Text style={styles.subtitle}>{allSeries.length ? 'Choose an older window or All to see saved weigh-ins.' : 'Import your old history or add a weigh-in.'}</Text></View> : <>
      <Svg width="100%" height={HEIGHT}>
        {[0, .5, 1].map((ratio) => <Line key={ratio} x1={PAD.left} x2={width - PAD.right} y1={PAD.top + chartHeight * ratio} y2={PAD.top + chartHeight * ratio} stroke={colors.border} />)}
        <SvgText x={1} y={PAD.top + 4} fill={colors.textDim} fontSize={10}>{max}</SvgText><SvgText x={1} y={PAD.top + chartHeight / 2 + 4} fill={colors.textDim} fontSize={10}>{format((max + min) / 2)}</SvgText><SvgText x={1} y={PAD.top + chartHeight + 4} fill={colors.textDim} fontSize={10}>{min}</SvgText>
        {goal !== undefined ? <><Line x1={PAD.left} x2={width - PAD.right} y1={y(goal)} y2={y(goal)} stroke={GOAL} strokeWidth={2} strokeDasharray="8 6" /><SvgText x={width - PAD.right - 16} y={y(goal) - 6} fill={GOAL} fontSize={10} textAnchor="end">Goal {format(goal)}</SvgText></> : null}
        <Polyline points={averagePoints} fill="none" stroke={AVERAGE} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={dailyPoints} fill="none" stroke={DAILY} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) => (series.length <= 16 || index % Math.ceil(series.length / 12) === 0 || index === series.length - 1) ? <Circle key={point.entry.id} cx={x(index)} cy={y(point.entry.weight)} r={3.5} fill="#B9D8FF" /> : null)}
        <SvgText x={PAD.left} y={HEIGHT - 5} fill={colors.textDim} fontSize={10}>{shortDate(axisStart)}</SvgText><SvgText x={width - PAD.right} y={HEIGHT - 5} fill={colors.textDim} fontSize={10} textAnchor="end">{shortDate(bounds.end)}</SvgText>
      </Svg>
      <View style={styles.legend}><Legend color={DAILY} label="Daily" /><Legend color={AVERAGE} label="7-day avg" />{goal !== undefined ? <Legend color={GOAL} label="Goal" line /> : null}</View>
    </>}
  </View>;
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) { return <View style={styles.legendItem}><View style={[line ? styles.legendLine : styles.legendDot, { backgroundColor: color }]} /><Text style={[styles.legendText, { color }]}>{label}</Text></View>; }
function shortDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function format(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 14, marginTop: 14 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, title: { color: colors.text, fontSize: 18, fontWeight: '600' }, subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 4 }, change: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 }, changeText: { color: colors.text, fontSize: 11, fontWeight: '600' }, ranges: { flexDirection: 'row', gap: 7, marginTop: 16 }, range: { flex: 1, alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, paddingVertical: 9, borderRadius: 999 }, rangeActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent }, rangeText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' }, rangeTextActive: { color: colors.accent }, empty: { height: HEIGHT, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '700' }, legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, paddingLeft: PAD.left, marginTop: -2 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendDot: { width: 8, height: 8, borderRadius: 4 }, legendLine: { width: 14, height: 3, borderRadius: 2 }, legendText: { fontSize: 11, fontWeight: '600' },
});
