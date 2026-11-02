import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, type } from '@/theme';

export function NutritionRing({ label, value, goal, color, unit = 'g', large = false, compact = false }: { label: string; value: number; goal: number; color: string; unit?: string; large?: boolean; compact?: boolean }) {
  const size = large ? 148 : compact ? 80 : 112;
  const stroke = large ? 12 : compact ? 7 : 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = goal > 0 ? value / goal : 0;
  const progress = Math.max(0, Math.min(1, ratio));
  const percentage = goal > 0 ? Math.round(ratio * 100) : 0;
  const difference = Math.abs(goal - value);
  return <View accessibilityRole={goal > 0 ? 'progressbar' : 'text'} accessibilityLabel={goal > 0 ? `${label}: ${format(value)} of ${format(goal)} ${unit}` : `${label}: ${format(value)} ${unit}, no target`} accessibilityValue={goal > 0 ? { min: 0, max: 100, now: Math.min(100, percentage) } : undefined} style={[styles.wrap, large && styles.largeWrap, compact && styles.compactWrap]}>
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceRaised} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - progress)} rotation="-90" origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <View style={styles.center}><Text style={[styles.percent, large && styles.largePercent, compact && styles.compactPercent]}>{goal > 0 ? `${percentage}%` : '—'}</Text><Text style={[styles.centerLabel, compact && styles.compactCenterLabel]}>{goal > 0 ? `${format(difference)} ${unit} ${value > goal ? 'over' : 'left'}` : 'No target'}</Text></View>
    </View>
    <Text style={[styles.label, compact && styles.compactLabel, { color }]}>{label}</Text>
    <Text style={[styles.amount, large && styles.largeAmount, compact && styles.compactAmount]}>{format(value)}<Text style={styles.goal}>{goal > 0 ? ` / ${format(goal)} ${unit}` : ` ${unit}`}</Text></Text>
  </View>;
}

const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const styles = StyleSheet.create({
  wrap: { width: '50%', alignItems: 'center', paddingVertical: 8, minWidth: 0 }, largeWrap: { width: '100%', paddingVertical: 5 }, compactWrap: { width: '33.333%', paddingVertical: 5 },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, percent: { color: colors.text, fontSize: 20, fontWeight: '700' }, largePercent: { fontSize: 32 }, centerLabel: { ...type.micro, color: colors.textMuted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 6 }, amount: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 3 }, largeAmount: { fontSize: 18 }, goal: { color: colors.textMuted, fontWeight: '600' },
  compactPercent: { fontSize: 16 }, compactCenterLabel: { fontSize: 7, marginTop: 0 }, compactLabel: { fontSize: 11, marginTop: 6 }, compactAmount: { fontSize: 11, textAlign: 'center' },
});
