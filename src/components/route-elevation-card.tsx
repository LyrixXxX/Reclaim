import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';

import { routeElevation } from '@/lib/route-elevation';
import { ActivityPoint } from '@/models/tracker';
import { colors } from '@/theme';

const FEET_PER_METER = 3.28084;
const HEIGHT = 150;
const TOP = 12;
const BOTTOM = 22;

export function RouteElevationCard({ points }: { points: ActivityPoint[] }) {
  const elevation = useMemo(() => routeElevation(points), [points]);
  const [width, setWidth] = useState(300);
  if (!elevation) return <View style={styles.card}><Text style={styles.title}>Elevation</Text><Text style={styles.note}>Unavailable for this route. New routes will show an estimate when the phone records reliable altitude.</Text></View>;
  const min = Math.floor(elevation.minMeters * FEET_PER_METER / 10) * 10;
  const max = Math.ceil(elevation.maxMeters * FEET_PER_METER / 10) * 10;
  const range = Math.max(20, max - min);
  const chartWidth = Math.max(1, width - 42);
  const chartHeight = HEIGHT - TOP - BOTTOM;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const position = (distanceMeters: number, elevationMeters: number) => `${34 + distanceMeters / Math.max(1, elevation.distanceMeters) * chartWidth},${TOP + (1 - (elevationMeters * FEET_PER_METER - min) / range) * chartHeight}`;
  return <View style={styles.card} onLayout={onLayout}>
    <Text style={styles.title}>Estimated elevation</Text>
    <Svg width="100%" height={HEIGHT}>
      {[0, 0.5, 1].map((fraction) => <Line key={fraction} x1={34} x2={width - 8} y1={TOP + fraction * chartHeight} y2={TOP + fraction * chartHeight} stroke={colors.border} />)}
      <SvgText x={2} y={TOP + 4} fill={colors.textDim} fontSize={9}>{max} ft</SvgText>
      <SvgText x={2} y={TOP + chartHeight + 4} fill={colors.textDim} fontSize={9}>{min} ft</SvgText>
      {elevation.series.map((series, index) => <Polyline key={index} points={series.map((sample) => position(sample.distanceMeters, sample.elevationMeters)).join(' ')} fill="none" stroke={colors.activityNav} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />)}
      <SvgText x={34} y={HEIGHT - 2} fill={colors.textDim} fontSize={9}>Start</SvgText>
      <SvgText x={width - 8} y={HEIGHT - 2} fill={colors.textDim} fontSize={9} textAnchor="end">{(elevation.distanceMeters / 1609.344).toFixed(2)} mi</SvgText>
    </Svg>
    <View style={styles.stats}>
      <View><Text style={styles.label}>GAIN</Text><Text style={styles.value}>+{Math.round(elevation.gainMeters * FEET_PER_METER)} ft</Text></View>
      <View><Text style={styles.label}>LOSS</Text><Text style={styles.value}>−{Math.round(elevation.lossMeters * FEET_PER_METER)} ft</Text></View>
      <View><Text style={styles.label}>LOW / HIGH</Text><Text style={styles.value}>{Math.round(elevation.minMeters * FEET_PER_METER)} / {Math.round(elevation.maxMeters * FEET_PER_METER)} ft</Text></View>
    </View>
    <Text style={styles.note}>Estimated from phone GPS altitude; readings can be noisy. Gaps and unreliable fixes are excluded.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 3 },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 12 },
});
