import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { useNow } from '@/hooks/use-now';
import { RollingRange, rollingBounds } from '@/lib/rolling-range';

import { LabResult } from '@/models/tracker';
import { colors } from '@/theme';

export function LabChart({ results }: { results: LabResult[] }) {
  const [width, setWidth] = useState(300); const [selected, setSelected] = useState<string>();
  const [range, setRange] = useState<RollingRange>('365D');
  const [offset, setOffset] = useState(0);
  const now = useNow(60000);
  const bounds = rollingBounds(range, offset, new Date(now));
  const chartStart = range === 'ALL' ? [...results].sort((a, b) => a.panelDate.localeCompare(b.panelDate))[0]?.panelDate ?? bounds.end : bounds.start;
  const visible = results.filter((result) => result.panelDate >= bounds.start && result.panelDate <= bounds.end);
  if (!results.length) return <Text style={styles.empty}>Add a result to begin this graph.</Text>;
  if (!visible.length) return <View><RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={chartStart} end={bounds.end} accent={colors.caffeine} /><Text style={styles.empty}>No results in this date window.</Text></View>;
  const height = 190; const left = 42; const right = 28; const top = 26; const bottom = 42; const plotWidth = Math.max(1, width - left - right); const plotHeight = height - top - bottom;
  const values = visible.map((item) => item.value); const minValue = Math.min(...values); const maxValue = Math.max(...values); const padding = Math.max((maxValue - minValue) * .15, Math.abs(maxValue) * .05, 1); const min = minValue - padding; const max = maxValue + padding;
  const axisDuration = Math.max(1, Date.parse(`${bounds.end}T12:00:00`) - Date.parse(`${chartStart}T12:00:00`));
  const coords = visible.map((item) => ({ item, x: left + Math.max(0, Math.min(1, (Date.parse(`${item.panelDate}T12:00:00`) - Date.parse(`${chartStart}T12:00:00`)) / axisDuration)) * plotWidth, y: top + plotHeight - (item.value - min) / (max - min) * plotHeight }));
  const selectedResult = visible.find((item) => item.id === selected);
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}><RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={chartStart} end={bounds.end} accent={colors.caffeine} /><Svg width={width} height={height}><Line x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} stroke={colors.border} /><Line x1={left} x2={width - right} y1={top + plotHeight / 2} y2={top + plotHeight / 2} stroke={colors.border} strokeDasharray="3 6" /><SvgText x={2} y={top + 4} fill={colors.textMuted} fontSize={10}>{round(max)}</SvgText><SvgText x={2} y={top + plotHeight} fill={colors.textMuted} fontSize={10}>{round(min)}</SvgText><Polyline points={coords.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors.caffeine} strokeWidth={3} strokeLinejoin="round" />{coords.map((point, index) => <ViewPoint key={point.item.id} x={point.x} y={point.y} item={point.item} showLabel={visible.length <= 8 || index % Math.ceil(visible.length / 7) === 0 || index === visible.length - 1} selected={selected === point.item.id} onPress={() => setSelected(point.item.id)} />)}</Svg>{selectedResult && <Text style={styles.detail}>{formatDate(selectedResult.panelDate)} · {selectedResult.value} {selectedResult.unit}</Text>}</View>;
}

function ViewPoint({ x, y, item, showLabel, selected, onPress }: { x: number; y: number; item: LabResult; showLabel: boolean; selected: boolean; onPress: () => void }) { return <><Circle cx={x} cy={y} r={14} fill="transparent" onPress={onPress} /><Circle cx={x} cy={y} r={selected ? 6 : 4} fill={colors.caffeine} stroke={selected ? colors.text : 'transparent'} strokeWidth={2} onPress={onPress} />{showLabel && <><SvgText x={x} y={y < 42 ? y + 18 : y - 8} fill={colors.text} fontSize={9.5} fontWeight="700" textAnchor="middle">{round(item.value)}</SvgText><SvgText x={x} y={182} fill={colors.textMuted} fontSize={8.5} textAnchor="middle">{shortDate(item.panelDate)}</SvgText></>}</>; }
function round(value: number) { return Math.abs(value) >= 100 ? Math.round(value).toLocaleString() : `${Math.round(value * 100) / 100}`; }
function shortDate(value: string) { return `${new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })} ’${value.slice(2, 4)}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
const styles = StyleSheet.create({ empty: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 16 }, detail: { color: colors.textMuted, backgroundColor: colors.surfaceRaised, borderRadius: 9, padding: 9, fontSize: 11, textAlign: 'center', marginTop: -4 } });
