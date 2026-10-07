import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { HealthReading } from '@/models/tracker';
import { colors } from '@/theme';

const HEIGHT = 190;
const PAD = { top: 18, right: 12, bottom: 27, left: 32 };

export function VitalsChart({ readings }: { readings: HealthReading[] }) {
  const [width, setWidth] = useState(300);
  const points = [...readings].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  if (!points.length) return <View style={styles.empty}><Text style={styles.emptyTitle}>No trend yet</Text><Text style={styles.emptyBody}>Your saved readings will appear here.</Text></View>;
  const times = points.map((item) => Date.parse(item.measuredAt));
  const values = points.flatMap((item) => [item.systolic, item.diastolic]);
  const minValue = Math.floor((Math.min(...values) - 10) / 10) * 10;
  const maxValue = Math.ceil((Math.max(...values) + 10) / 10) * 10;
  const minTime = Math.min(...times); const maxTime = Math.max(...times);
  const chartWidth = width - PAD.left - PAD.right; const chartHeight = HEIGHT - PAD.top - PAD.bottom;
  const coords = (key: 'systolic' | 'diastolic') => points.map((item) => ({
    id: item.id, time: Date.parse(item.measuredAt), value: item[key],
    x: PAD.left + (maxTime === minTime ? chartWidth / 2 : (Date.parse(item.measuredAt) - minTime) / (maxTime - minTime) * chartWidth),
    y: PAD.top + chartHeight - (item[key] - minValue) / Math.max(1, maxValue - minValue) * chartHeight,
  }));
  const segments = (key: 'systolic' | 'diastolic') => splitAtGaps(coords(key));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return <View style={styles.wrapper} onLayout={onLayout}>
    <View style={styles.legend}><Legend color={colors.caffeine} label="Systolic" /><Legend color={colors.success} label="Diastolic" /></View>
    <Svg width="100%" height={HEIGHT}>
      {[0, 0.5, 1].map((ratio) => <Line key={ratio} x1={PAD.left} x2={width - PAD.right} y1={PAD.top + chartHeight * ratio} y2={PAD.top + chartHeight * ratio} stroke={colors.border} strokeDasharray="3 6" />)}
      <SvgText x={2} y={PAD.top + 3} fill={colors.textMuted} fontSize={10}>{maxValue}</SvgText><SvgText x={2} y={PAD.top + chartHeight + 3} fill={colors.textMuted} fontSize={10}>{minValue}</SvgText>
      {segments('systolic').map((segment, index) => <Polyline key={`s-${index}`} points={segment.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors.caffeine} strokeWidth={3} />)}
      {segments('diastolic').map((segment, index) => <Polyline key={`d-${index}`} points={segment.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors.success} strokeWidth={3} />)}
      {coords('systolic').map((point) => <Circle key={`s-${point.id}`} cx={point.x} cy={point.y} r={3.5} fill={colors.caffeine} />)}
      {coords('diastolic').map((point) => <Circle key={`d-${point.id}`} cx={point.x} cy={point.y} r={3.5} fill={colors.success} />)}
      <SvgText x={PAD.left} y={HEIGHT - 4} fill={colors.textMuted} fontSize={10}>{formatDate(points[0].measuredAt)}</SvgText><SvgText x={width - PAD.right} y={HEIGHT - 4} fill={colors.textMuted} fontSize={10} textAnchor="end">{formatDate(points.at(-1)!.measuredAt)}</SvgText>
    </Svg>
  </View>;
}

export function PulseChart({ readings }: { readings: HealthReading[] }) {
  const [width, setWidth] = useState(300);
  const points = [...readings].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  if (!points.length) return null;
  const times = points.map((item) => Date.parse(item.measuredAt));
  const minTime = Math.min(...times); const maxTime = Math.max(...times);
  const minValue = Math.floor((Math.min(...points.map((item) => item.pulse)) - 5) / 5) * 5;
  const maxValue = Math.ceil((Math.max(...points.map((item) => item.pulse)) + 5) / 5) * 5;
  const chartWidth = width - PAD.left - PAD.right; const chartHeight = 80;
  const coordinates = points.map((item) => ({ id: item.id, time: Date.parse(item.measuredAt), x: PAD.left + (maxTime === minTime ? chartWidth / 2 : (Date.parse(item.measuredAt) - minTime) / (maxTime - minTime) * chartWidth), y: 8 + chartHeight - (item.pulse - minValue) / Math.max(1, maxValue - minValue) * chartHeight }));
  return <View style={styles.pulseWrapper} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}><Text style={styles.pulseTitle}>Pulse · bpm</Text><Svg width="100%" height={105}><Line x1={PAD.left} x2={width - PAD.right} y1={48} y2={48} stroke={colors.border} strokeDasharray="3 6" />{splitAtGaps(coordinates).map((segment, index) => <Polyline key={index} points={segment.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors.nicotine} strokeWidth={3} />)}{coordinates.map((point) => <Circle key={point.id} cx={point.x} cy={point.y} r={3.5} fill={colors.nicotine} />)}<SvgText x={2} y={12} fill={colors.textMuted} fontSize={10}>{maxValue}</SvgText><SvgText x={2} y={90} fill={colors.textMuted} fontSize={10}>{minValue}</SvgText></Svg></View>;
}

function splitAtGaps<T extends { time: number }>(points: T[]) { const groups: T[][] = []; points.forEach((point, index) => { const prior = points[index - 1]; if (!prior || point.time - prior.time > 3 * 86_400_000) groups.push([point]); else groups.at(-1)!.push(point); }); return groups; }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function Legend({ color, label }: { color: string; label: string }) { return <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>; }
const styles = StyleSheet.create({ wrapper: { width: '100%' }, pulseWrapper: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 8 }, pulseTitle: { color: colors.textMuted, fontSize: 10, fontWeight: '800' }, legend: { flexDirection: 'row', gap: 14, marginBottom: 3 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, dot: { width: 7, height: 7, borderRadius: 4 }, legendText: { color: colors.textMuted, fontSize: 10 }, empty: { minHeight: 96, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '700' }, emptyBody: { color: colors.textMuted, fontSize: 11, marginTop: 5 } });
