import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { ReportRange, reportChartMaximum, reportLabelIndices, reportNumber, reportPlotLayout, reportValueLabel } from '@/lib/nutrition-report';
import { colors } from '@/theme';

export type ReportChartPoint = { key: string; label: string; detail: string; value: number | null; goal: number | null; status: string; segments?: { id: string; name: string; value: number; color: string }[] };
export function NutritionReportChart({ points, range, color, unit, kind = 'bar' }: { points: ReportChartPoint[]; range: ReportRange; color: string; unit: string; kind?: 'line' | 'bar' | 'stacked' }) {
  const [width, setWidth] = useState(280);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selected = points.find((point) => point.key === selectedKey) ?? [...points].reverse().find((point) => point.value !== null);
  const height = 230, top = 25, bottom = range === 'week' ? 48 : 30;
  const { left, right, slot } = reportPlotLayout(width, points.length);
  const max = reportChartMaximum(points.flatMap((point) => [point.value, point.goal]));
  const x = (index: number) => left + slot * (index + .5);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const baseline = height - bottom;
  const labels = new Set(reportLabelIndices(points.length, range));
  const valuePath = points.map((point, i) => point.value === null ? '' : `${i && points[i - 1].value !== null ? 'L' : 'M'}${x(i)},${y(point.value)}`).join(' ');
  const goalPath = points.map((point, i) => point.goal === null ? '' : i && points[i - 1].goal !== null ? `H${left + slot * i} V${y(point.goal)} H${left + slot * (i + 1)}` : `M${left + slot * i},${y(point.goal)} H${left + slot * (i + 1)}`).join(' ');
  const hasGoal = points.some((point) => point.goal !== null);
  return <View onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}>
    <View style={styles.key}><Text style={[styles.keyText, { color }]}>● {kind === 'stacked' ? 'Meal calories' : range === 'year' || range === 'all' ? 'Recorded-day average' : 'Daily intake'}</Text>{hasGoal && <Text style={styles.keyText}>┄ Goal</Text>}{range !== 'year' && range !== 'all' && points.some((point) => point.status.startsWith('Today')) && <Text style={styles.keyText}>◌ Today updates as you log</Text>}</View>
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel="Nutrition chart. Tap a date for details.">
      {[0, .5, 1].map((fraction) => <G key={fraction}><Line x1={left} x2={width - right} y1={y(max * fraction)} y2={y(max * fraction)} stroke={colors.border} /><SvgText x={left - 7} y={y(max * fraction) + 3} textAnchor="end" fill={colors.textMuted} fontSize={9}>{max * fraction >= 10000 ? `${reportNumber(max * fraction / 1000)}k` : reportNumber(max * fraction, 0)}</SvgText></G>)}
      {hasGoal && <Path d={goalPath} stroke={colors.textMuted} strokeWidth={1.5} strokeDasharray="4 4" fill="none" />}
      {kind === 'line' && <Path d={valuePath} stroke={color} strokeWidth={2.5} fill="none" />}
      {points.map((point, i) => {
        const barWidth = Math.min(24, slot * .56);
        let stack = 0;
        return <G key={point.key}>
          {selectedKey === point.key && <Rect x={left + slot * i} y={top - 12} width={slot} height={baseline - top + 12} fill={colors.text} opacity={.045} />}
          {point.value !== null && (kind === 'line' ? <Circle cx={x(i)} cy={y(point.value)} r={point.status.startsWith('Today') ? 5 : 3.5} fill={point.status.startsWith('Today') ? colors.background : color} stroke={color} strokeWidth={point.status.startsWith('Today') ? 2 : 0} /> : kind === 'stacked' ? point.segments?.map((segment) => {
            stack += segment.value;
            return <Rect key={segment.id} x={x(i) - barWidth / 2} y={y(stack)} width={barWidth} height={Math.max(0, y(0) - y(segment.value))} fill={segment.color} />;
          }) : <Rect x={x(i) - barWidth / 2} y={y(point.value)} width={barWidth} height={Math.max(point.value === 0 ? 2 : 0, baseline - y(point.value))} fill={color} opacity={point.status.startsWith('Today') ? .65 : 1} rx={2} />)}
          {range === 'week' && point.value !== null && <SvgText x={x(i)} y={y(point.value) - 9} textAnchor="middle" fill={color} fontSize={10} fontWeight="bold">{reportValueLabel(point.value)}{unit === '%' ? '%' : ''}</SvgText>}
          {point.value === null && <SvgText x={x(i)} y={baseline - 7} textAnchor="middle" fill={colors.textDim} fontSize={9}>·</SvgText>}
          {labels.has(i) && point.label.split('\n').map((label, line) => <SvgText key={line} x={x(i)} y={baseline + 18 + line * 14} textAnchor="middle" fill={colors.textMuted} fontSize={range === 'year' ? 8 : 10}>{label}</SvgText>)}
          <Rect x={left + slot * i} y={0} width={slot} height={height} fill="transparent" onPress={() => { setSelectedKey(point.key); setDetailsOpen(true); }} accessibilityLabel={`${point.detail}: ${point.value === null ? point.status : `${reportNumber(point.value)} ${unit}`}`} />
        </G>;
      })}
    </Svg>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((open) => !open)} style={styles.detailToggle}><Text style={styles.detailToggleText}>{detailsOpen ? 'Hide' : 'Show'} chart details {detailsOpen ? '−' : '+'}</Text></Pressable>
    {detailsOpen && <View style={styles.detail}>
      <Text style={styles.date}>{selected?.detail ?? 'No completed-day data in this period'}</Text>
      {selected && <>
        <Text style={[styles.value, { color }]}>{selected.value === null ? selected.status : `${reportNumber(selected.value)} ${unit}`}{selected.goal !== null ? <Text style={styles.goal}>  · Goal {reportNumber(selected.goal)} {unit}</Text> : null}</Text>
        {selected.value !== null && selected.status ? <Text style={styles.hint}>{selected.status}</Text> : null}
        {selected.value !== null && selected.segments?.map((segment) => <Text key={segment.id} style={[styles.meal, { color: segment.color }]}>{segment.name}: {reportNumber(segment.value)} kcal</Text>)}
      </>}
      <Text style={styles.hint}>Tap a {range === 'year' || range === 'all' ? 'date bucket' : 'day'} for details · Dots indicate no plotted intake</Text>
    </View>}
  </View>;
}

export function NutritionBalanceRing({ parts }: { parts: { label: string; percent: number | null; color: string }[] }) {
  const circumference = 2 * Math.PI * 53;
  return <Svg width={140} height={140} viewBox="0 0 140 140" accessibilityLabel={parts.map((part) => `${part.label}: ${reportNumber(part.percent)} percent`).join(', ')}>
    <Circle cx={70} cy={70} r={53} fill="none" stroke={colors.border} strokeWidth={17} />
    {parts.map((part, index) => { const start = parts.slice(0, index).reduce((sum, previous) => sum + (previous.percent ?? 0), 0) / 100 * circumference; return part.percent ? <Circle key={part.label} cx={70} cy={70} r={53} fill="none" stroke={part.color} strokeWidth={17} strokeDasharray={`${part.percent / 100 * circumference} ${circumference}`} strokeDashoffset={-start} rotation={-90} origin="70,70" /> : null; })}
    <SvgText x={70} y={68} textAnchor="middle" fill={colors.text} fontSize={14} fontWeight="bold">{parts.some((part) => part.percent !== null) ? 'Macro' : 'No macro'}</SvgText>
    <SvgText x={70} y={85} textAnchor="middle" fill={colors.textMuted} fontSize={12}>{parts.some((part) => part.percent !== null) ? 'balance' : 'data'}</SvgText>
  </Svg>;
}
const styles = StyleSheet.create({ key: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 15, marginBottom: 3 }, keyText: { color: colors.textMuted, fontSize: 11 }, detailToggle: { alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 12, marginTop: 8, paddingVertical: 11 }, detailToggleText: { color: colors.text, fontSize: 11, fontWeight: '600' }, detail: { backgroundColor: colors.background, borderRadius: 12, padding: 12, marginTop: 6 }, date: { color: colors.text, fontSize: 12, fontWeight: '700' }, value: { fontSize: 17, fontWeight: '600', marginTop: 5 }, goal: { fontSize: 12, color: colors.textMuted, fontWeight: '500' }, hint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 5 }, meal: { fontSize: 12, marginTop: 5 } });
