import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View, ViewProps } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { useNow } from '@/hooks/use-now';
import { RollingRange, rollingBounds } from '@/lib/rolling-range';

import { HistoricalEntry } from '@/models/tracker';
import { colors, font } from '@/theme';
import { isoToUs } from '@/lib/us-date';

const HEIGHT = 170;
const PAD = { top: 16, right: 12, bottom: 28, left: 34 };

export function ValueChart({ entries, color, unit }: { entries: HistoricalEntry[]; color: string; unit?: string }) {
  const [width, setWidth] = useState(300);
  const [selected, setSelected] = useState<HistoricalEntry | null>(null);
  const [range, setRange] = useState<RollingRange>('30D');
  const [offset, setOffset] = useState(0);
  const now = useNow(60000);
  const bounds = rollingBounds(range, offset, new Date(now));
  const all = entries.filter((entry) => entry.value !== undefined).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const points = all.filter((entry) => entry.eventDate >= bounds.start && entry.eventDate <= bounds.end);
  const values = points.map((entry) => entry.value!);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const chartWidth = width - PAD.left - PAD.right;
  const chartHeight = HEIGHT - PAD.top - PAD.bottom;
  const coords = points.map((entry, index) => ({ entry, x: PAD.left + (points.length === 1 ? chartWidth / 2 : index / (points.length - 1) * chartWidth), y: PAD.top + chartHeight - ((entry.value! - min) / Math.max(1, max - min)) * chartHeight }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onTouch: ViewProps['onTouchStart'] = (event) => {
    if (!coords.length) return;
    const x = event.nativeEvent.locationX;
    setSelected(coords.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best).entry);
  };
  if (!points.length) return <View><RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={range === 'ALL' ? all[0]?.eventDate ?? bounds.end : bounds.start} end={bounds.end} accent={color} /><View style={styles.empty}><Text style={styles.emptyTitle}>{all.length ? 'No amounts in this date window' : 'No amount history yet'}</Text><Text style={styles.emptyBody}>{all.length ? 'Choose an older window or All.' : 'Add an amount to a historical entry to begin the chart.'}</Text></View></View>;
  return <View onLayout={onLayout} onTouchStart={onTouch} style={styles.wrapper}>
    <RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={range === 'ALL' ? all[0]?.eventDate ?? bounds.end : bounds.start} end={bounds.end} accent={color} />
    {selected && <View style={styles.tooltip}><Text style={styles.tooltipText}>{isoToUs(selected.eventDate)} · {selected.value} {unit}</Text></View>}
    <Svg width="100%" height={HEIGHT}>
      {[0, 0.5, 1].map((ratio) => <Line key={ratio} x1={PAD.left} x2={width - PAD.right} y1={PAD.top + chartHeight * ratio} y2={PAD.top + chartHeight * ratio} stroke={colors.border} strokeDasharray="3 6" />)}
      <SvgText x={3} y={PAD.top + 4} fill={colors.textDim} fontSize={9}>{max}</SvgText>
      <SvgText x={3} y={PAD.top + chartHeight + 3} fill={colors.textDim} fontSize={9}>{min}</SvgText>
      <Polyline points={coords.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((point) => <Circle key={point.entry.id} cx={point.x} cy={point.y} r={4} fill={color} />)}
      <SvgText x={PAD.left} y={HEIGHT - 5} fill={colors.textDim} fontSize={9}>{points[0].eventDate.slice(5)}</SvgText>
      <SvgText x={width - PAD.right} y={HEIGHT - 5} fill={colors.textDim} fontSize={9} textAnchor="end">{points.at(-1)!.eventDate.slice(5)}</SvgText>
    </Svg>
    <Text style={styles.hint}>Touch to inspect an entry</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', minHeight: HEIGHT + 18 }, tooltip: { position: 'absolute', zIndex: 2, top: 3, alignSelf: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 }, tooltipText: { color: colors.text, fontSize: 11, fontFamily: font.bold }, hint: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, textAlign: 'center', marginTop: -3 },
  empty: { height: HEIGHT, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.text, fontSize: 13, fontFamily: font.bold }, emptyBody: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 6, textAlign: 'center' },
});
