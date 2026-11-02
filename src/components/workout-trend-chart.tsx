import { useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { colors, font } from '@/theme';

export type WorkoutChartPoint = { id: string; date: string; value: number };

export function WorkoutTrendChart({ points, unit, onSelect }: { points: WorkoutChartPoint[]; unit: string; onSelect?: (point: WorkoutChartPoint) => void }) {
  const [width, setWidth] = useState(300);
  const [selectedId, setSelectedId] = useState<string>();
  if (!points.length) return <Text style={{ color: colors.textMuted }}>No recorded values in this date range yet.</Text>;
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const left = 18, right = 18, top = 18, bottom = 28, height = 170;
  const low = Math.min(...ordered.map((point) => point.value));
  const high = Math.max(...ordered.map((point) => point.value));
  const span = Math.max(1, high - low);
  const start = Date.parse(ordered[0].date), end = Date.parse(ordered.at(-1)!.date);
  const plotted = ordered.map((point, index) => ({ ...point,
    x: left + (end === start ? ordered.length === 1 ? 0.5 : index / (ordered.length - 1) : (Date.parse(point.date) - start) / (end - start)) * (width - left - right),
    y: top + (1 - (point.value - low) / span) * (height - top - bottom) }));
  const selected = plotted.find((point) => point.id === selectedId) ?? plotted.at(-1)!;
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    <Svg width={width} height={height} accessibilityLabel="Exercise progress chart"><Line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke={colors.border} />
      {plotted.length > 1 && <Polyline points={plotted.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors.workoutsNav} strokeWidth={3} />}
      {plotted.map((point) => <Circle key={point.id} cx={point.x} cy={point.y} r={20} fill="transparent" stroke="transparent" onPress={() => { setSelectedId(point.id); onSelect?.(point); }} />)}
      {plotted.map((point) => <Circle key={`${point.id}-marker`} cx={point.x} cy={point.y} r={point.id === selected.id ? 6 : 5} fill={point.id === selected.id ? colors.workoutsNav : colors.surfaceRaised} stroke={colors.workoutsNav} strokeWidth={2} onPress={() => { setSelectedId(point.id); onSelect?.(point); }} />)}
    </Svg>
    <Text style={{ color: colors.text, textAlign: 'center', fontFamily: font.bold }}>{new Date(selected.date).toLocaleDateString()} · {Math.round(selected.value * 10) / 10} {unit}</Text>
    {onSelect && <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 4 }}>Tap a point to inspect its workout below.</Text>}
  </View>;
}
