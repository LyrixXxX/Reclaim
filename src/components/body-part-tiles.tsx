import { Href, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { BODY_PART_COLORS, BODY_PART_LABELS } from '@/lib/body-parts';
import { BodyPartTrend, bodyPartTrends } from '@/lib/body-part-progress';
import { WorkoutSession } from '@/models/tracker';
import { colors, font, radius } from '@/theme';

export function formatChange(value: number | null) {
  if (value === null) return '—';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Sparkline({ trend, color }: { trend: BodyPartTrend; color: string }) {
  const points = trend.points.slice(-12);
  if (points.length < 2) return <View style={styles.sparkEmpty} />;
  const values = points.map((point) => point.value);
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = Math.max(1, high - low);
  const line = points.map((point, index) => `${(index / (points.length - 1)) * 100},${28 - ((point.value - low) / span) * 24}`).join(' ');
  return <Svg width="100%" height={30} viewBox="0 0 100 30" preserveAspectRatio="none"><Polyline points={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" /></Svg>;
}

/** Seven tiles, one per body part: strength change since first logged, a sparkline, and recency. */
export function BodyPartTiles({ sessions }: { sessions: WorkoutSession[] }) {
  const trends = useMemo(() => bodyPartTrends(sessions), [sessions]);
  return <View style={styles.grid}>
    {trends.map((trend) => {
      const color = BODY_PART_COLORS[trend.part];
      const empty = trend.changePercent === null;
      return <Pressable key={trend.part} accessibilityRole="button" accessibilityLabel={`${BODY_PART_LABELS[trend.part]}, ${empty ? 'no lifts logged yet' : `${formatChange(trend.changePercent)} stronger since ${shortDate(trend.firstDate!)}`}`}
        onPress={() => router.push(`/workout-body-part?part=${encodeURIComponent(trend.part)}` as Href)} style={styles.tile}>
        <View style={styles.tileHead}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.part} numberOfLines={1}>{BODY_PART_LABELS[trend.part]}</Text></View>
        <Text style={[styles.change, empty && styles.changeEmpty, !empty && trend.changePercent! < 0 && { color: colors.danger }]}>{formatChange(trend.changePercent)}</Text>
        <Sparkline trend={trend} color={color} />
        <Text style={styles.meta} numberOfLines={1}>{empty ? 'Log a lift to start' : `Since ${shortDate(trend.firstDate!)}`}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, minWidth: 0, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, padding: 12, gap: 4 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  part: { flex: 1, color: colors.textMuted, fontSize: 13, fontFamily: font.semibold },
  change: { color: colors.text, fontSize: 22, fontFamily: font.extrabold, fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  changeEmpty: { color: colors.textDim },
  sparkEmpty: { height: 30, borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: 'dashed' },
  meta: { color: colors.textDim, fontSize: 12, fontFamily: font.regular },
});
