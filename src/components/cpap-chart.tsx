import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { CpapTrendMetric, CpapTrendPoint, CpapTrendRange, cpapAxisLabelIndices, cpapTrendAxis, cpapTrendDescription, cpapTrendPoints, formatCpapMetricValue } from '@/lib/cpap';
import { CpapChartPeriod, cpapPeriodDataAxis, cpapCalendarPoints } from '@/lib/cpap-calendar';
import { CpapReading } from '@/models/tracker';
import { colors } from '@/theme';

const CHART_HEIGHT = 158;
const LEFT = 36;
// Leave enough room for the centered final date label to remain inside the SVG.
const RIGHT = 24;
const TOP = 30;
const PLOT_HEIGHT = 86;

export function CpapChart({ readings, metric, period, range, label, color, suffix }: { readings: CpapReading[]; metric: CpapTrendMetric; period?: CpapChartPeriod; range?: CpapTrendRange; label: string; color: string; suffix: string }) {
  const [width, setWidth] = useState(300);
  const [selectedId, setSelectedId] = useState<string>();
  const axis = period ? cpapPeriodDataAxis(period, readings) : cpapTrendAxis(range ?? '30D', cpapTrendPoints(readings, metric, range ?? '30D'));
  const points = period ? cpapCalendarPoints(readings, metric, cpapPeriodDataAxis(period, readings)) : cpapTrendPoints(readings, metric, range ?? '30D');
  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const plotWidth = Math.max(1, width - LEFT - RIGHT);
  const coords = points.map((point, index) => {
    const axisIndex = axis.findIndex((tick) => tick.key === point.bucketKey);
    const position = axisIndex >= 0 ? axisIndex : index;
    return { point, x: LEFT + (axis.length === 1 ? plotWidth / 2 : position / Math.max(1, axis.length - 1) * plotWidth), y: TOP + PLOT_HEIGHT - (point.value - min) / Math.max(1, max - min) * PLOT_HEIGHT };
  });
  const labelIndices = period ? axis.map((_, index) => index).filter((index) => axis.length <= 8 || index === axis.length - 1 || index % Math.ceil(axis.length / 6) === 0) : cpapAxisLabelIndices(axis.length, range ?? '30D');
  return <View style={styles.wrapper} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.heading}><Text style={styles.title}>{label}</Text><Text style={styles.aggregation}>{period ? period.range === '7D' || period.range === 'week' ? 'Nightly values' : period.range === '30D' || period.range === 'month' ? 'Recorded-night averages by week' : 'Recorded-night averages by period' : cpapTrendDescription(range ?? '30D', readings)}</Text></View>
    <Svg width={width} height={CHART_HEIGHT}>
      <Line x1={LEFT} x2={width - RIGHT} y1={TOP + PLOT_HEIGHT} y2={TOP + PLOT_HEIGHT} stroke={colors.border} />
      <Line x1={LEFT} x2={width - RIGHT} y1={TOP + PLOT_HEIGHT / 2} y2={TOP + PLOT_HEIGHT / 2} stroke={colors.border} strokeDasharray="3 6" />
      {coords.length > 1 && <Path d={coords.map((item, index) => `${index && axis.findIndex((tick) => tick.key === item.point.bucketKey) === axis.findIndex((tick) => tick.key === coords[index - 1].point.bucketKey) + 1 ? 'L' : 'M'}${item.x},${item.y}`).join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
      {coords.map((item) => <ChartPoint key={item.point.id} x={item.x} y={item.y} color={color} value={formatCpapMetricValue(metric, item.point.value, suffix)} showValue={period?.range !== 'year'} selected={selectedId === item.point.id} onPress={() => setSelectedId(item.point.id)} />)}
      {axis.map((tick, index) => labelIndices.includes(index) ? <SvgText key={tick.key} x={LEFT + (axis.length === 1 ? plotWidth / 2 : index / (axis.length - 1) * plotWidth)} y={CHART_HEIGHT - 7} fill={colors.textMuted} fontSize={period?.range === 'year' ? 8 : 9} textAnchor="middle">{tick.label}</SvgText> : null)}
      <SvgText x={2} y={TOP + 4} fill={colors.textMuted} fontSize={10}>{formatCpapMetricValue(metric, max, suffix)}</SvgText>
    </Svg>
    {!points.length && <Text style={styles.muted}>No readings in this period.</Text>}
    {points.find((point) => point.id === selectedId) && <PointDetail point={points.find((point) => point.id === selectedId)!} metric={metric} suffix={suffix} />}
  </View>;
}

function ChartPoint({ x, y, color, value, showValue, selected, onPress }: { x: number; y: number; color: string; value: string; showValue: boolean; selected: boolean; onPress: () => void }) {
  const valueY = y < TOP + 15 ? y + 17 : y - 9;
  return <><Circle cx={x} cy={y} r={14} fill="transparent" onPress={onPress} /><Circle cx={x} cy={y} r={selected ? 6 : 4} fill={color} stroke={selected ? colors.text : 'transparent'} strokeWidth={selected ? 2 : 0} onPress={onPress} />{(showValue || selected) && <SvgText x={x} y={valueY} fill={colors.text} fontSize={9.5} fontWeight="700" textAnchor="middle">{value}</SvgText>}</>;
}

function PointDetail({ point, metric, suffix }: { point: CpapTrendPoint; metric: CpapTrendMetric; suffix: string }) {
  const period = point.startDate === point.endDate ? formatDetailDate(point.startDate) : `${formatDetailDate(point.startDate)}–${formatDetailDate(point.endDate)}`;
  return <View style={styles.detail}><Text style={styles.detailDate}>{period}</Text><Text style={styles.detailValue}>{formatCpapMetricValue(metric, point.value, suffix)}</Text><Text style={styles.detailCount}>{point.count} night{point.count === 1 ? '' : 's'} included</Text></View>;
}

function formatDetailDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }

const styles = StyleSheet.create({ wrapper: { width: '100%', marginBottom: 10 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }, title: { color: colors.textMuted, fontSize: 11, fontWeight: '800' }, aggregation: { color: colors.textMuted, fontSize: 10 }, detail: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -5, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.surfaceRaised }, detailDate: { color: colors.textMuted, fontSize: 10, flex: 1 }, detailValue: { color: colors.text, fontSize: 11, fontWeight: '800' }, detailCount: { color: colors.textMuted, fontSize: 10 }, empty: { minHeight: 96, alignItems: 'center', justifyContent: 'center' }, muted: { color: colors.textMuted, fontSize: 12 } });
