import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { activeCpapSettings, CpapTrendRange, cpapAxisLabelIndices, cpapTrendAxis, cpapTrendDescription, cpapTrendPoints } from '@/lib/cpap';
import { CpapChartPeriod, cpapPeriodDataAxis, cpapCalendarPoints, cpapCalendarSettingSegments } from '@/lib/cpap-calendar';
import { CpapReading, CpapTherapySettings } from '@/models/tracker';
import { colors, font } from '@/theme';

const HEIGHT = 190;
const LEFT = 36;
const RIGHT = 24;
const TOP = 30;
const PLOT_HEIGHT = 105;
const AVG_COLOR = '#78B7FF';
const P95_COLOR = '#B5E37A';
const MIN_COLOR = '#B98CFF';
const MAX_COLOR = '#F2B766';

export function CpapPressureChart({ readings, settings, period, range }: { readings: CpapReading[]; settings: CpapTherapySettings[]; period?: CpapChartPeriod; range?: CpapTrendRange }) {
  const [width, setWidth] = useState(300);
  const [selectedKey, setSelectedKey] = useState<string>();
  const axis = period ? cpapPeriodDataAxis(period, readings) : cpapTrendAxis(range ?? '30D', cpapTrendPoints(readings, 'averagePressure', range ?? '30D'));
  const averages = period ? cpapCalendarPoints(readings, 'averagePressure', cpapPeriodDataAxis(period, readings)) : cpapTrendPoints(readings, 'averagePressure', range ?? '30D');
  const p95s = period ? cpapCalendarPoints(readings, 'p95Pressure', cpapPeriodDataAxis(period, readings)) : cpapTrendPoints(readings, 'p95Pressure', range ?? '30D');
  const settingSegments = period ? cpapCalendarSettingSegments(cpapPeriodDataAxis(period, readings), settings) : axis.flatMap((tick, index) => { const setting = activeCpapSettings(settings, legacyReferenceDate(tick.key, range ?? '30D')); return setting ? [{ index, start: tick.key, end: tick.key, from: 0, to: 1, setting, changedWithinTick: false }] : []; });
  const allValues = [...averages.map((item) => item.value), ...p95s.map((item) => item.value), ...settingSegments.flatMap((item) => [item.setting.minPressure, item.setting.maxPressure])];
  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const rawMax = allValues.length ? Math.max(...allValues) : 1;
  const padding = rawMax === rawMin ? 1 : Math.max(.5, (rawMax - rawMin) * .1);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const plotWidth = Math.max(1, width - LEFT - RIGHT);
  const xForIndex = (index: number) => LEFT + (axis.length === 1 ? plotWidth / 2 : index / Math.max(1, axis.length - 1) * plotWidth);
  const yForValue = (value: number) => TOP + PLOT_HEIGHT - (value - min) / Math.max(1, max - min) * PLOT_HEIGHT;
  const coord = (point: (typeof averages)[number]) => { const index = Math.max(0, axis.findIndex((tick) => tick.key === point.bucketKey)); return { point, index, x: xForIndex(index), y: yForValue(point.value) }; };
  const averageCoords = averages.map(coord);
  const p95Coords = p95s.map(coord);
  const selectedAverage = averages.find((item) => item.bucketKey === selectedKey);
  const selectedP95 = p95s.find((item) => item.bucketKey === selectedKey);
  const selectedTick = axis.find((tick) => tick.key === selectedKey);
  const selectedSetting = selectedTick ? activeCpapSettings(settings, period ? cpapPeriodDataAxis(period, readings).find((tick) => tick.key === selectedTick.key)!.end : legacyReferenceDate(selectedTick.key, range ?? '30D')) : undefined;
  const selectedSegments = settingSegments.filter((item) => item.index === axis.findIndex((tick) => tick.key === selectedKey));
  const labelIndices = period ? axis.map((_, index) => index).filter((index) => axis.length <= 8 || index === axis.length - 1 || index % Math.ceil(axis.length / 6) === 0) : cpapAxisLabelIndices(axis.length, range ?? '30D');
  const joinedPath = (points: typeof averageCoords) => points.map((item, index) => `${index && item.index === points[index - 1].index + 1 ? 'L' : 'M'} ${item.x} ${item.y}`).join(' ');

  return <View style={styles.wrapper} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.heading}><Text style={styles.title}>Pressure · cmH₂O</Text><Text style={styles.aggregation}>{period ? period.range === '7D' || period.range === 'week' ? 'Nightly values' : period.range === '30D' || period.range === 'month' ? 'Recorded-night averages by week' : 'Recorded-night averages by period' : cpapTrendDescription(range ?? '30D', readings)}</Text></View>
    <View style={styles.legend}><Legend color={AVG_COLOR} label="Average" /><Legend color={P95_COLOR} label="P95" /><Legend color={MIN_COLOR} label="Min setting" dashed /><Legend color={MAX_COLOR} label="Max setting" dotted /></View>
    <Svg width={width} height={HEIGHT}>
      <Line x1={LEFT} x2={width - RIGHT} y1={TOP + PLOT_HEIGHT} y2={TOP + PLOT_HEIGHT} stroke={colors.border} />
      <Line x1={LEFT} x2={width - RIGHT} y1={TOP + PLOT_HEIGHT / 2} y2={TOP + PLOT_HEIGHT / 2} stroke={colors.border} strokeDasharray="3 6" />
      {settingSegments.map((segment) => {
        const { left, right } = settingCellBounds(segment.index, axis.length, xForIndex, width);
        const x1 = left + (right - left) * segment.from; const x2 = left + (right - left) * segment.to;
        return <Rect key={`band-${segment.index}-${segment.start}`} x={x1} y={yForValue(segment.setting.maxPressure)} width={Math.max(0, x2 - x1)} height={Math.max(0, yForValue(segment.setting.minPressure) - yForValue(segment.setting.maxPressure))} fill={colors.cpapNav} opacity={.055} />;
      })}
      {settingSegments.flatMap((segment) => {
        const { left, right } = settingCellBounds(segment.index, axis.length, xForIndex, width);
        const x1 = left + (right - left) * segment.from; const x2 = left + (right - left) * segment.to;
        return [
          <Line key={`min-${segment.index}-${segment.start}`} x1={x1} x2={x2} y1={yForValue(segment.setting.minPressure)} y2={yForValue(segment.setting.minPressure)} stroke={MIN_COLOR} strokeWidth={2.2} strokeDasharray="7 5" strokeLinecap="round" />,
          <Line key={`max-${segment.index}-${segment.start}`} x1={x1} x2={x2} y1={yForValue(segment.setting.maxPressure)} y2={yForValue(segment.setting.maxPressure)} stroke={MAX_COLOR} strokeWidth={2.2} strokeDasharray="2 5" strokeLinecap="round" />,
        ];
      })}
      {period && axis.length > 0 && settingSegments.filter((segment) => segment.start > cpapPeriodDataAxis(period, readings)[0].start && settings.some((setting) => setting.effectiveDate === segment.start)).map((segment) => { const { left, right } = settingCellBounds(segment.index, axis.length, xForIndex, width); const x = left + (right - left) * segment.from; return <Line key={`change-${segment.index}-${segment.start}`} x1={x} x2={x} y1={TOP - 5} y2={TOP + PLOT_HEIGHT} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 4" />; })}
      <Path d={joinedPath(averageCoords)} fill="none" stroke={AVG_COLOR} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d={joinedPath(p95Coords)} fill="none" stroke={P95_COLOR} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {averageCoords.map((item) => <PressurePoint key={`avg-${item.point.id}`} x={item.x} y={item.y} color={AVG_COLOR} value={formatPressure(item.point.value)} showValue={period?.range !== 'year'} valueY={item.y + 15} selected={selectedKey === item.point.bucketKey} onPress={() => setSelectedKey(item.point.bucketKey)} />)}
      {p95Coords.map((item) => <PressurePoint key={`p95-${item.point.id}`} x={item.x} y={item.y} color={P95_COLOR} value={formatPressure(item.point.value)} showValue={period?.range !== 'year'} valueY={item.y - 8} selected={selectedKey === item.point.bucketKey} onPress={() => setSelectedKey(item.point.bucketKey)} />)}
      {axis.map((tick, index) => labelIndices.includes(index) ? <SvgText key={tick.key} x={xForIndex(index)} y={HEIGHT - 7} fill={colors.textMuted} fontSize={period?.range === 'year' ? 8 : 9} textAnchor="middle">{tick.label}</SvgText> : null)}
      <SvgText x={2} y={TOP + 4} fill={colors.textMuted} fontSize={10}>{formatPressure(max)}</SvgText>
    </Svg>
    {!averages.length && <Text style={styles.muted}>No pressure readings in this period.</Text>}
    {selectedAverage && selectedP95 && <View style={styles.detail}><Text style={styles.detailDate}>{formatPeriod(selectedAverage.startDate, selectedAverage.endDate)} · {selectedAverage.count} night{selectedAverage.count === 1 ? '' : 's'}</Text><Text style={styles.detailValue}>Avg {formatPressure(selectedAverage.value)} · P95 {formatPressure(selectedP95.value)}</Text>{selectedSegments.length > 1 ? <Text style={styles.detailSettings}>Settings changed during this period; dashed/dotted lines show each setting’s dates.</Text> : selectedSetting && <Text style={styles.detailSettings}>{selectedSetting.mode} {formatPressure(selectedSetting.minPressure)}–{formatPressure(selectedSetting.maxPressure)}</Text>}</View>}
  </View>;
}

function Legend({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) { return <View style={styles.legendItem}><View style={[styles.legendLine, { borderTopColor: color, borderStyle: dotted ? 'dotted' : dashed ? 'dashed' : 'solid' }]} /><Text style={styles.legendText}>{label}</Text></View>; }
function PressurePoint({ x, y, color, value, showValue, valueY, selected, onPress }: { x: number; y: number; color: string; value: string; showValue: boolean; valueY: number; selected: boolean; onPress: () => void }) { return <><Circle cx={x} cy={y} r={14} fill="transparent" onPress={onPress} /><Circle cx={x} cy={y} r={selected ? 5.5 : 3.8} fill={color} stroke={selected ? colors.text : 'transparent'} strokeWidth={selected ? 2 : 0} onPress={onPress} />{(showValue || selected) && <SvgText x={x} y={valueY} fill={colors.text} fontSize={8.5} fontWeight="700" textAnchor="middle">{value}</SvgText>}</>; }
function settingCellBounds(index: number, count: number, x: (index: number) => number, width: number) {
  if (count === 1) return { left: LEFT, right: width - RIGHT };
  return {
    left: index === 0 ? LEFT : (x(index - 1) + x(index)) / 2,
    right: index === count - 1 ? width - RIGHT : (x(index) + x(index + 1)) / 2,
  };
}
function legacyReferenceDate(key: string, range: CpapTrendRange) {
  if (range === 'ALL') return `${key}-12-31`;
  if (range === '6M' || range === '1Y' || range === '90D') { const [year, month] = key.split('-').map(Number); return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); }
  if (range === '30D') { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 6); return date.toISOString().slice(0, 10); }
  return key;
}
function formatPressure(value: number) { return Number.isInteger(value) ? value.toFixed(1) : `${Math.round(value * 10) / 10}`; }
function formatPeriod(start: string, end: string) { const format = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); return start === end ? format(start) : `${format(start)}–${format(end)}`; }

const styles = StyleSheet.create({ wrapper: { width: '100%', marginBottom: 10 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }, title: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold }, aggregation: { color: colors.textMuted, fontSize: 11 , fontFamily: font.regular}, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, legendLine: { width: 14, borderTopWidth: 2 }, legendText: { color: colors.textDim, fontSize: 8.5 , fontFamily: font.regular}, detail: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.surfaceRaised, marginTop: -5, marginBottom: 8 }, detailDate: { color: colors.textMuted, fontSize: 11 , fontFamily: font.regular}, detailValue: { color: colors.text, fontSize: 11, fontFamily: font.semibold, marginTop: 3 }, detailSettings: { color: colors.textMuted, fontSize: 9.5, fontFamily: font.regular, marginTop: 2 }, empty: { minHeight: 96, alignItems: 'center', justifyContent: 'center' }, muted: { color: colors.textMuted, fontSize: 12 , fontFamily: font.regular} });
