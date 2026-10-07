import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, type } from '@/theme';

export function NutritionRing({ label, value, goal, color, unit = 'g', large = false }: { label: string; value: number; goal: number; color: string; unit?: string; large?: boolean }) {
  const size = large ? 156 : 108;
  const stroke = large ? 13 : 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = goal > 0 ? value / goal : 0;
  const progress = Math.max(0, Math.min(1, ratio));
  const percentage = goal > 0 ? Math.round(ratio * 100) : 0;
  const difference = Math.abs(goal - value);
  return <View style={[styles.wrap, large && styles.largeWrap]}>
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - progress)} rotation="-90" origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <View style={styles.center}><Text style={[styles.percent, large && styles.largePercent, large && goal > 0 && { color: value > goal ? colors.danger : colors.success }]}>{percentage}%</Text><Text style={[styles.centerLabel, large && goal > 0 && { color: value > goal ? colors.danger : colors.success }]}>{`${format(difference)} ${unit} ${value > goal ? 'over' : 'left'}`}</Text></View>
    </View>
    <Text style={[styles.label, { color }]}>{label}</Text>
    <Text style={[styles.amount, large && styles.largeAmount, large && goal > 0 && { color: value > goal ? colors.danger : colors.success }]}>{format(value)}<Text style={styles.goal}> / {format(goal)} {unit}</Text></Text>
  </View>;
}

const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const styles = StyleSheet.create({
  wrap: { width: '50%', alignItems: 'center', paddingVertical: 10 }, largeWrap: { width: '100%' },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, percent: { color: colors.text, fontSize: 20, fontWeight: '900' }, largePercent: { fontSize: 32 }, centerLabel: { ...type.micro, color: colors.textMuted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '900', marginTop: 8 }, amount: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 3 }, largeAmount: { fontSize: 18 }, goal: { color: colors.textMuted, fontWeight: '600' },
});
