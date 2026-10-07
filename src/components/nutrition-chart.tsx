import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { colors } from '@/theme';

export type NutritionChartPoint = { key: string; label: string; value: number | null; goal?: number | null };

export function NutritionChart({ points, color, unit }: { points: NutritionChartPoint[]; color: string; unit: string }) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(280, Math.min(612, windowWidth - 68));
  const height = 230; const left = 38; const right = 12; const top = 30; const bottom = 38;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() => [...points].reverse().find((point) => point.value !== null)?.key);
  const all = points.flatMap((point) => [point.value, point.goal]).filter((value): value is number => value !== null && value !== undefined);
  const max = Math.max(...all, 1) * 1.12;
  const x = (index: number) => left + (points.length <= 1 ? (width - left - right) / 2 : index * ((width - left - right) / (points.length - 1)));
  const y = (value: number) => top + (max - value) / max * (height - top - bottom);
  const segments = lineSegments(points, x, y);
  const goalPath = pathFor(points.map((point, index) => point.goal == null ? null : { x: x(index), y: y(point.goal) }));
  const selected = points.find((point) => point.key === selectedKey && point.value !== null) ?? [...points].reverse().find((point) => point.value !== null);
  const labelEvery = points.length <= 8 ? 1 : Math.max(1, Math.ceil(points.length / 5));
  if (!points.some((point) => point.value !== null)) return <View style={styles.empty}><Text style={styles.emptyText}>No completed-day data in this range.</Text></View>;
  return <View>
    <View style={styles.selection}><Text style={[styles.selectionValue, { color }]}>{selected?.value == null ? '—' : `${format(selected.value)}${unit}`}</Text><Text style={styles.selectionLabel}>{selected?.label ?? ''}</Text></View>
    <Svg width={width} height={height} accessibilityLabel="Nutrition trend chart">
      {[0, .5, 1].map((fraction) => <Line key={fraction} x1={left} x2={width - right} y1={top + fraction * (height - top - bottom)} y2={top + fraction * (height - top - bottom)} stroke={colors.border} strokeWidth="1" />)}
      <SvgText x="2" y={top + 4} fill={colors.textMuted} fontSize="10">{format(max)}</SvgText><SvgText x="20" y={height - bottom + 3} fill={colors.textMuted} fontSize="10">0</SvgText>
      {goalPath ? <Path d={goalPath} stroke={colors.textDim} strokeWidth="1.5" strokeDasharray="5 5" fill="none" /> : null}
      {segments.map((segment, index) => <Path key={index} d={segment} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
      {points.map((point, index) => point.value === null ? null : <Circle key={point.key} cx={x(index)} cy={y(point.value)} r={point.key === selected?.key ? 5 : 3.5} fill={color} stroke={colors.surface} strokeWidth="2" onPress={() => setSelectedKey(point.key)} />)}
      {points.map((point, index) => (index % labelEvery === 0 || index === points.length - 1) ? <SvgText key={`label-${point.key}`} x={x(index)} y={height - 12} fill={colors.textMuted} fontSize="9" textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{point.label}</SvgText> : null)}
    </Svg>
    <View style={styles.legend}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.legendText}>Logged average</Text><View style={[styles.goalLine]} /><Text style={styles.legendText}>Goal</Text></View>
  </View>;
}

function lineSegments(points: NutritionChartPoint[], x: (index: number) => number, y: (value: number) => number) {
  const segments: string[] = []; let current: { x: number; y: number }[] = [];
  points.forEach((point, index) => { if (point.value === null) { if (current.length) segments.push(pathFor(current)); current = []; } else current.push({ x: x(index), y: y(point.value) }); });
  if (current.length) segments.push(pathFor(current));
  return segments;
}
function pathFor(points: ({ x: number; y: number } | null)[]) { const valid = points.filter((point): point is { x: number; y: number } => point !== null); return valid.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '); }
const format = (value: number) => value >= 100 ? Math.round(value).toLocaleString() : Number.isInteger(value) ? String(value) : value.toFixed(1);
const styles = StyleSheet.create({ empty: { minHeight: 112, alignItems: 'center', justifyContent: 'center' }, emptyText: { color: colors.textMuted, fontSize: 12 }, selection: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 }, selectionValue: { fontSize: 24, fontWeight: '900' }, selectionLabel: { color: colors.textMuted, fontSize: 11 }, legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -3 }, dot: { width: 7, height: 7, borderRadius: 4 }, goalLine: { width: 18, height: 1, backgroundColor: colors.textMuted, marginLeft: 8 }, legendText: { color: colors.textMuted, fontSize: 10 } });
