import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';

import { HealthReadingModal } from '@/components/health-reading-modal';
import { MainScreenHeader } from '@/components/main-screen-header';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { PulseChart, VitalsChart } from '@/components/vitals-chart';
import { RollingRange, dateKey, rollingBounds } from '@/lib/rolling-range';
import { healthHubSummary } from '@/lib/health-hub';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { HealthReading } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function HealthScreen() {
  const { add, detail } = useLocalSearchParams<{ add?: string; detail?: string }>();
  const state = useTrackers();
  const { preferences = DEFAULT_PREFERENCES, saveHealthReading } = state;
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<RollingRange>('7D');
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const showingBloodPressure = detail === 'bloodPressure' || add === '1';
  useFocusEffect(useCallback(() => {
    setNow(new Date());
    if (add === '1' && preferences.visibleSections.health && preferences.visibleHealthModules.bloodPressure) {
      setOpen(true);
      router.setParams({ add: '', detail: 'bloodPressure' });
    }
  }, [add, preferences.visibleSections.health, preferences.visibleHealthModules.bloodPressure]));
  const summary = useMemo(() => healthHubSummary(state, now), [state, now]);
  const bounds = rollingBounds(range, offset, now);
  const visible = summary.readings.filter((reading) => { const day = dateKey(new Date(reading.measuredAt)); return day >= bounds.start && day <= bounds.end; });
  const latest = summary.readings[0];
  const firstReading = () => router.push('/health?detail=bloodPressure&add=1');

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {showingBloodPressure ? <>
        <MainScreenHeader eyebrow="BLOOD PRESSURE & PULSE" subtitle="Your readings, trends, and history." accent={colors.healthNav} />
        <Pressable accessibilityRole="button" onPress={() => router.replace('/health')} style={styles.back}><Text style={styles.backText}>‹ Health hub</Text></Pressable>
        <View style={styles.card}>
          {latest ? <><Text style={styles.smallLabel}>LATEST READING</Text><View style={styles.valueRow}><Text style={styles.bpValue}>{latest.systolic} / {latest.diastolic}</Text><Text style={styles.unit}>mmHg</Text></View><Text style={styles.pulseValue}>{latest.pulse} bpm · pulse</Text><Text style={styles.muted}>{formatDateTime(latest.measuredAt)}</Text></> : <Text style={styles.muted}>No readings yet. Add one to begin tracking.</Text>}
          <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.detailAdd}><Text style={styles.detailAddText}>+ Add reading</Text></Pressable>
        </View>
        {!!summary.readings.length && <><View style={styles.detailCard}><RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={range === 'ALL' ? dateKey(new Date(summary.readings.at(-1)!.measuredAt)) : bounds.start} end={bounds.end} accent={colors.healthNav} /><VitalsChart readings={visible} /><PulseChart readings={visible} /></View><View style={styles.sectionRow}><Text style={styles.sectionTitle}>Recent readings</Text><Link href="/health-history" style={styles.link}>View all</Link></View><View style={styles.detailCard}>{summary.readings.slice(0, 5).map((reading) => <View key={reading.id} style={styles.readingRow}><Text style={styles.readingTime}>{formatDateTime(reading.measuredAt)}</Text><Text style={styles.readingValue}>{reading.systolic}/{reading.diastolic} · {reading.pulse} bpm</Text></View>)}</View><Link href="/doctor-summary" asChild><Pressable accessibilityRole="button" style={styles.secondaryButton}><Text style={styles.secondaryText}>View Vitals Doctor Summary</Text></Pressable></Link></>}
      </> : <>
        <MainScreenHeader eyebrow="HEALTH" subtitle="Vitals, medications, supplements, and lab trends in one place." accent={colors.healthNav} />
        {preferences.visibleHealthModules.bloodPressure && <HubCard title="Blood pressure & pulse" icon="♥" color={colors.healthNav} onPress={() => router.push('/health?detail=bloodPressure')}>
          {latest ? <><View style={styles.valueRow}><View style={styles.valueGroup}><Text style={styles.bpValue}>{latest.systolic} / {latest.diastolic}</Text><Text style={styles.muted}>mmHg</Text></View><View style={styles.valueDivider} /><View><Text style={styles.bpValue}>{latest.pulse}</Text><Text style={styles.muted}>bpm</Text></View></View><BloodPressureSparkline readings={summary.readings} /><Text style={styles.muted}>Latest reading · {formatDateTime(latest.measuredAt)}</Text></> : <EmptyCard icon="♡" title="No readings yet" description="Start tracking your blood pressure and pulse to see trends over time." action="+ Add first reading" onAction={firstReading} color={colors.healthNav} />}
        </HubCard>}
        {preferences.visibleHealthModules.medications && <HubCard title="Medications & Supplements" icon="✚" color={colors.healthNav} onPress={() => router.push('/medications')}>
          {summary.activeMedications.length ? <><Text style={styles.muted}>{summary.activeMedications.length} active {summary.activeMedications.length === 1 ? 'item' : 'items'}</Text>{summary.medicationStatus ? <><View style={styles.medStats}><Stat value={summary.medicationStatus.taken} label="taken" /><Stat value={Math.max(0, summary.medicationStatus.total - summary.medicationStatus.taken - summary.medicationStatus.skipped)} label="remaining" /><Stat value={summary.medicationStatus.skipped} label="skipped" /></View>{summary.nextDoses.length ? <View style={styles.nextDose}><Text style={styles.smallLabel}>SCHEDULED DOSES NOT LOGGED</Text>{summary.nextDoses.slice(0, 2).map((dose, index) => <View key={`${dose.label}-${index}`} style={styles.doseRow}><Text style={styles.doseName} numberOfLines={1}>{dose.label}</Text><Text style={styles.doseTime}>{dose.value}</Text></View>)}</View> : <Text style={styles.muted}>All scheduled doses logged today.</Text>}</> : <Text style={styles.muted}>No fixed-time doses scheduled today. As-needed and interval items remain in Medications & Supplements.</Text>}</> : <EmptyCard icon="✚" title="No medications or supplements yet" description="Track doses, schedules, and local reminders." action="+ Add item" onAction={() => router.push('/medications')} color={colors.healthNav} />}
        </HubCard>}
        {preferences.visibleHealthModules.labs && <HubCard title="Laboratory results" icon="⌁" color={colors.nutritionNav} onPress={() => router.push('/labs')}>
          {summary.results.length ? <><View style={styles.labStats}><Stat value={summary.results.length} label="total results" /><View style={styles.valueDivider} /><Stat value={summary.trackedLabs.length} label="tracked labs" /></View>{summary.recentLabs.map((result) => <View key={result.id} style={styles.labRow}><View style={styles.labNameBox}><Text style={styles.labName} numberOfLines={1}>{result.name}</Text><Text style={styles.muted}>{formatDay(result.panelDate)}</Text></View><Text style={styles.labValue} numberOfLines={1}>{result.value} {result.unit}</Text></View>)}</> : <EmptyCard icon="⌁" title="No results yet" description="Track laboratory results manually or extract them from a report photo for easy review." action="+ Add your first result" onAction={() => router.push('/labs')} color={colors.nutritionNav} />}
        </HubCard>}
        {!Object.values(preferences.visibleHealthModules).some(Boolean) && <Text style={styles.muted}>Health modules are hidden. Restore them from Settings.</Text>}
      </>}
      <Text style={styles.disclaimer}>Personal tracking only. Reclaim does not diagnose or interpret readings.</Text>
    </ScrollView>
    <HealthReadingModal key={open ? 'open' : 'closed'} visible={open} onClose={() => setOpen(false)} onSave={saveHealthReading} />
  </SafeAreaView>;
}

function HubCard({ title, icon, color, onPress, children }: { title: string; icon: string; color: string; onPress: () => void; children: ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onPress} style={[styles.card, { borderColor: `${color}55` }]}><View style={styles.cardHeading}><View style={[styles.icon, { backgroundColor: `${color}20`, borderColor: `${color}77` }]}><Text style={[styles.iconText, { color }]}>{icon}</Text></View><Text style={styles.cardTitle}>{title}</Text><Text style={styles.chevron}>›</Text></View><View style={styles.cardBody}>{children}</View></Pressable>;
}

function EmptyCard({ icon, title, description, action, onAction, color }: { icon: string; title: string; description: string; action: string; onAction: () => void; color: string }) {
  return <View style={styles.emptyBody}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyIcon}>{icon}</Text><Text style={styles.emptyDescription}>{description}</Text><Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); onAction(); }} style={[styles.emptyAction, { borderColor: `${color}66`, backgroundColor: `${color}15` }]}><Text style={[styles.emptyActionText, { color }]}>{action}</Text></Pressable></View>;
}

function Stat({ value, label }: { value: number; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function formatDateTime(value: string) { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function formatDay(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }

function BloodPressureSparkline({ readings }: { readings: HealthReading[] }) {
  const recent = [...readings].slice(0, 7).reverse();
  if (recent.length < 2) return null;
  const values = recent.map((reading) => reading.systolic);
  const min = Math.min(...values) - 5; const max = Math.max(...values) + 5;
  const points = values.map((value, index) => `${8 + index / (values.length - 1) * 284},${55 - (value - min) / (max - min) * 45}`).join(' ');
  return <View style={styles.sparkline}><Text style={styles.smallLabel}>RECENT SYSTOLIC READINGS</Text><Svg width="100%" height={64} viewBox="0 0 300 64" accessibilityLabel={`Recent systolic readings: ${values.join(', ')}`}><Polyline points={points} fill="none" stroke={colors.healthNav} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" /></Svg></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 40 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderRadius: layout.radius, padding: 16, marginBottom: 14, minHeight: 90 }, cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, cardBody: { marginTop: 10 }, icon: { width: 46, height: 46, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 25, fontWeight: '900' }, cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900', flex: 1 }, chevron: { color: colors.textMuted, fontSize: 28 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, smallLabel: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1 }, valueRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }, valueGroup: { flexShrink: 1 }, valueDivider: { width: 1, height: 44, backgroundColor: colors.border }, bpValue: { color: colors.text, fontSize: 27, fontWeight: '900' }, unit: { color: colors.textMuted, fontSize: 12 }, pulseValue: { color: colors.text, fontSize: 16, fontWeight: '800' }, sparkline: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 13, paddingTop: 10, marginBottom: 6 },
  emptyBody: { alignItems: 'center', gap: 8 }, emptyTitle: { color: colors.textMuted, fontSize: 13, alignSelf: 'flex-start' }, emptyIcon: { color: colors.border, fontSize: 40, paddingVertical: 4 }, emptyDescription: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 280 }, emptyAction: { minHeight: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, marginTop: 5 }, emptyActionText: { fontSize: 12, fontWeight: '900' },
  medStats: { flexDirection: 'row', gap: 8, marginTop: 12 }, stat: { flex: 1, minWidth: 0, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 8 }, statValue: { color: colors.text, fontSize: 20, fontWeight: '900' }, nextDose: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 14, paddingTop: 10 }, doseRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingVertical: 6 }, doseName: { color: colors.text, fontSize: 12, flex: 1 }, doseTime: { color: colors.text, fontSize: 12, fontWeight: '800' },
  labStats: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, labRow: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: 10, borderColor: colors.border, borderWidth: 1, borderRadius: 11, marginTop: 7 }, labNameBox: { flex: 1 }, labName: { color: colors.text, fontSize: 12, fontWeight: '800' }, labValue: { color: colors.text, fontSize: 12, maxWidth: '48%' },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 6 }, backText: { color: colors.healthNav, fontSize: 13, fontWeight: '800' }, detailAdd: { backgroundColor: colors.healthNav, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, detailAddText: { color: colors.background, fontSize: 12, fontWeight: '900' }, detailCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: 14, marginBottom: 12 }, sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 10 }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, link: { color: colors.healthNav, fontSize: 12, fontWeight: '800' }, readingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }, readingTime: { color: colors.textMuted, fontSize: 11, flex: 1 }, readingValue: { color: colors.text, fontSize: 11, fontWeight: '800' }, secondaryButton: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center', marginTop: 4 }, secondaryText: { color: colors.text, fontSize: 12, fontWeight: '800' }, disclaimer: { color: colors.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 22 },
});
