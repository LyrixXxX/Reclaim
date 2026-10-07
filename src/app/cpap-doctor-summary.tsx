import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { CpapChart } from '@/components/cpap-chart';
import { CpapPressureChart } from '@/components/cpap-pressure-chart';
import { CpapUsageStreakCard } from '@/components/cpap-usage-streak-card';
import { buildCpapDoctorReportHtml } from '@/lib/cpap-report';
import { CpapTrendRange, cpapSummary, cpapUsageDayCounts, cpapUsageStreakStats, equalNightSettingsComparison, filterCpapReadings } from '@/lib/cpap';
import { CpapReading } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

const RANGES: CpapTrendRange[] = ['30D', '1Y', 'ALL'];

export default function CpapDoctorSummaryScreen() {
  const { cpapReadings = [], cpapTherapySettings = [] } = useTrackers();
  const [range, setRange] = useState<CpapTrendRange>('30D');
  const [comparisonSize, setComparisonSize] = useState<7 | 14 | 30>(7);
  const [working, setWorking] = useState<'pdf' | 'print'>();
  const [openedAt] = useState(() => new Date());
  const readings = useMemo(() => filterCpapReadings(cpapReadings, range, openedAt).sort((a, b) => a.sleepDate.localeCompare(b.sleepDate)), [cpapReadings, range, openedAt]);
  const summary = cpapSummary(readings);
  const streak = useMemo(() => cpapUsageStreakStats(cpapReadings, openedAt), [cpapReadings, openedAt]);
  const usageDays = useMemo(() => cpapUsageDayCounts(cpapReadings, range, openedAt), [cpapReadings, range, openedAt]);
  const comparison = useMemo(() => equalNightSettingsComparison(cpapTherapySettings, cpapReadings, comparisonSize), [cpapReadings, cpapTherapySettings, comparisonSize]);
  const reportHtml = () => buildCpapDoctorReportHtml({ readings, settings: cpapTherapySettings, range, periodLabel: rangeLabel(range), streak, usageDays, generatedAt: new Date() });
  const sharePdf = async () => {
    try {
      setWorking('pdf');
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      const file = await Print.printToFileAsync({ html: reportHtml() });
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Share CPAP doctor report' });
    } catch (error) {
      Alert.alert('Could not create report', error instanceof Error ? error.message : 'Try again.');
    } finally { setWorking(undefined); }
  };
  const printReport = async () => {
    try { setWorking('print'); await Print.printAsync({ html: reportHtml() }); }
    catch (error) { Alert.alert('Could not print report', error instanceof Error ? error.message : 'Try again.'); }
    finally { setWorking(undefined); }
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.eyebrow}>PERSONAL CPAP RECORD</Text><Text style={styles.title}>CPAP Doctor Summary</Text><Text style={styles.subtitle}>Machine-screen values recorded in Reclaim. This summary presents saved data without diagnosis or interpretation.</Text>
    <View style={styles.ranges}>{RANGES.map((item) => <Pressable key={item} onPress={() => setRange(item)} style={[styles.range, range === item && styles.active]}><Text style={[styles.rangeText, range === item && styles.activeText]}>{item === 'ALL' ? 'All' : item}</Text></Pressable>)}</View>
    <Text style={styles.period}>{rangeLabel(range)} · {summary?.count ?? 0} recorded night{summary?.count === 1 ? '' : 's'}</Text>
    <View style={styles.actions}><Pressable disabled={!summary || !!working} onPress={sharePdf} style={[styles.primaryAction, (!summary || !!working) && styles.disabled]}>{working === 'pdf' ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryActionText}>Share PDF</Text>}</Pressable><Pressable disabled={!summary || !!working} onPress={printReport} style={[styles.secondaryAction, (!summary || !!working) && styles.disabled]}>{working === 'print' ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.secondaryActionText}>Print</Text>}</Pressable></View>
    <Text style={styles.privateNote}>Generated on this device only. Nothing is uploaded automatically.</Text>
    <CpapUsageStreakCard stats={streak} />
    {summary ? <>
      <View style={styles.stats}><Stat label="NIGHTS RECORDED" value={`${summary.count}`} /><Stat label="DAYS UNDER 4 HOURS" value={`${usageDays.underFourHours}`} /><Stat label="DAYS MISSED" value={`${usageDays.missed}`} /><Stat label="AVERAGE THERAPY TIME" value={formatMinutes(summary.averageUsedMinutes)} /><Stat label="AVERAGE AHI" value={`${summary.averageAhi}`} /><Stat label="AVERAGE CAI" value={formatAverage(readings, 'cai')} /><Stat label="AVERAGE LEAK" value={`${summary.averageLeak} L/min`} /><Stat label="AVERAGE 95% LEAK" value={`${summary.averageP95Leak} L/min`} /><Stat label="AVERAGE PRESSURE" value={`${formatAverage(readings, 'averagePressure')} cmH₂O`} /><Stat label="AVERAGE P95 PRESSURE" value={`${formatAverage(readings, 'p95Pressure')} cmH₂O`} /></View>
      <Text style={styles.privateNote}>Under 4 hours means recorded use of 1–239 minutes. Missed means no entry or zero recorded use since tracking began; a missing entry does not confirm the machine was unused. Today is excluded until recorded.</Text>
      <View style={styles.chartCard}><CpapChart readings={readings} metric="usedMinutes" range={range} label="Therapy time" color={colors.accent} suffix="m" /><CpapChart readings={readings} metric="ahi" range={range} label="AHI" color={colors.caffeine} suffix="" /><CpapChart readings={readings} metric="averageLeak" range={range} label="Average leak · L/min" color={colors.nicotine} suffix="" /><CpapChart readings={readings} metric="p95Leak" range={range} label="95% leak · L/min" color={colors.nicotine} suffix="" /><CpapPressureChart readings={readings} settings={cpapTherapySettings} range={range} /></View>
      {comparison && <SettingsComparison comparison={comparison} requested={comparisonSize} onChange={setComparisonSize} />}
      <Text style={styles.section}>Nightly data</Text><View style={styles.table}><View style={[styles.row, styles.header]}><Text style={[styles.cell, styles.dateCell]}>DATE</Text><Text style={styles.cell}>USE</Text><Text style={styles.cell}>AHI</Text><Text style={[styles.cell, styles.right]}>LEAK</Text></View>{[...readings].reverse().map((reading) => <View key={reading.id} style={styles.row}><Text style={[styles.cell, styles.dateCell]}>{formatDate(reading.sleepDate)}</Text><Text style={styles.cell}>{formatMinutesShort(reading.usedMinutes)}</Text><Text style={[styles.cell, styles.strong]}>{reading.ahi}</Text><Text style={[styles.cell, styles.right]}>{reading.averageLeak}</Text></View>)}</View>
      {readings.some((item) => item.note) && <><Text style={styles.section}>Recorded notes</Text>{[...readings].reverse().filter((item) => item.note).map((item) => <View key={item.id} style={styles.note}><Text style={styles.noteDate}>{formatDate(item.sleepDate)}</Text><Text style={styles.noteText}>{item.note}</Text></View>)}</>}
    </> : <Text style={styles.empty}>No CPAP readings are saved in this period.</Text>}
    <Text style={styles.disclaimer}>For personal recordkeeping only. Values are transcribed from the CPAP machine summary and should be verified against the machine or clinical records.</Text>
  </ScrollView>;
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>; }
function SettingsComparison({ comparison, requested, onChange }: { comparison: NonNullable<ReturnType<typeof equalNightSettingsComparison>>; requested: 7 | 14 | 30; onChange: (value: 7 | 14 | 30) => void }) {
  const rows: { label: string; key: 'usedMinutes' | 'ahi' | 'cai' | 'averagePressure' | 'p95Pressure' | 'averageLeak' | 'p95Leak'; suffix: string }[] = [{ label: 'Therapy time', key: 'usedMinutes', suffix: ' min' }, { label: 'AHI', key: 'ahi', suffix: '' }, { label: 'CAI', key: 'cai', suffix: '' }, { label: 'Average pressure', key: 'averagePressure', suffix: '' }, { label: 'P95 pressure', key: 'p95Pressure', suffix: '' }, { label: 'Average leak', key: 'averageLeak', suffix: '' }, { label: '95% leak', key: 'p95Leak', suffix: '' }];
  return <><View style={styles.sectionHeading}><Text style={[styles.section, styles.sectionInline]}>Settings comparison</Text><View style={styles.compareRanges}>{([7, 14, 30] as const).map((value) => <Pressable key={value} onPress={() => onChange(value)} style={[styles.compareRange, requested === value && styles.compareRangeActive]}><Text style={[styles.compareRangeText, requested === value && styles.activeText]}>{value}</Text></Pressable>)}</View></View><Text style={styles.compareNote}>{comparison.count ? `${comparison.count} recorded night${comparison.count === 1 ? '' : 's'} from each settings period.` : 'Both settings periods need recorded nights.'} Values are shown without interpretation.</Text>{comparison.count > 0 && <View style={styles.table}><View style={[styles.row, styles.header]}><Text style={[styles.cell, styles.compareMetric]}>METRIC</Text><Text style={[styles.cell, styles.right]}>{formatRange(comparison.before)}</Text><Text style={[styles.cell, styles.right]}>{formatRange(comparison.after)}</Text></View>{rows.map((row) => <View key={row.key} style={styles.row}><Text style={[styles.cell, styles.compareMetric]}>{row.label}</Text><Text style={[styles.cell, styles.right]}>{formatComparisonAverage(comparison.beforeReadings, row.key)}{row.suffix}</Text><Text style={[styles.cell, styles.right, styles.strong]}>{formatComparisonAverage(comparison.afterReadings, row.key)}{row.suffix}</Text></View>)}</View>}</>;
}
function formatRange(setting: { minPressure: number; maxPressure: number }) { return `${setting.minPressure}–${setting.maxPressure}`; }
function formatComparisonAverage(readings: CpapReading[], key: 'usedMinutes' | 'ahi' | 'cai' | 'averagePressure' | 'p95Pressure' | 'averageLeak' | 'p95Leak') { const value = readings.reduce((sum, item) => sum + item[key], 0) / readings.length; return `${Math.round(value * 10) / 10}`; }
function formatAverage(readings: CpapReading[], key: 'cai' | 'averagePressure' | 'p95Pressure') { return (readings.reduce((sum, item) => sum + item[key], 0) / readings.length).toFixed(1); }
function formatMinutes(value: number) { const rounded = Math.round(value); return `${Math.floor(rounded / 60)}h ${rounded % 60}m`; }
function formatMinutesShort(value: number) { const rounded = Math.round(value); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }); }
function rangeLabel(range: CpapTrendRange) { if (range === '30D') return 'Last 30 days'; if (range === '90D') return 'Last 90 days'; if (range === '1Y') return 'Last year'; return 'All saved readings'; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 80 }, eyebrow: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 }, title: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 7 }, subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 7 }, ranges: { flexDirection: 'row', gap: 6, marginTop: 20 }, range: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 9 }, active: { backgroundColor: colors.accentSoft }, rangeText: { color: colors.textDim, fontSize: 9, fontWeight: '800' }, activeText: { color: colors.accent }, period: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginTop: 14 }, actions: { flexDirection: 'row', gap: 8, marginTop: 12 }, primaryAction: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 13 }, primaryActionText: { color: colors.background, fontSize: 11, fontWeight: '900' }, secondaryAction: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderColor: colors.accent, borderWidth: 1, borderRadius: 13 }, secondaryActionText: { color: colors.accent, fontSize: 11, fontWeight: '900' }, disabled: { opacity: .4 }, privateNote: { color: colors.textDim, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 7 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, stat: { width: '48%', flexGrow: 1, minHeight: 72, justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12 }, statLabel: { color: colors.textDim, fontSize: 8, fontWeight: '800', letterSpacing: .6 }, statValue: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 5 }, chartCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.md, marginTop: 15 }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }, section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 24, marginBottom: 9 }, sectionInline: { marginTop: 0 }, compareRanges: { flexDirection: 'row', gap: 4 }, compareRange: { minWidth: 34, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.surface }, compareRangeActive: { backgroundColor: colors.accentSoft }, compareRangeText: { color: colors.textDim, fontSize: 9, fontWeight: '800' }, compareNote: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginBottom: 8 }, table: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', minHeight: 42, paddingHorizontal: 10, borderTopColor: colors.border, borderTopWidth: 1 }, header: { borderTopWidth: 0, backgroundColor: colors.surfaceRaised }, cell: { flex: 1, color: colors.textMuted, fontSize: 9 }, dateCell: { flex: 1.4 }, compareMetric: { flex: 1.35 }, right: { textAlign: 'right' }, strong: { color: colors.text, fontWeight: '800' }, note: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 7 }, noteDate: { color: colors.textDim, fontSize: 8, fontWeight: '800' }, noteText: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 4 }, empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 40 }, disclaimer: { color: colors.textDim, fontSize: 9, lineHeight: 15, textAlign: 'center', marginTop: 24 } });
