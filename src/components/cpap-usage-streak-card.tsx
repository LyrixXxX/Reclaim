import { StyleSheet, Text, View } from 'react-native';

import { CpapUsageStreakStats } from '@/lib/cpap';
import { colors, layout, spacing, type } from '@/theme';

export function CpapUsageStreakCard({ stats }: { stats: CpapUsageStreakStats }) {
  const status = statusContent(stats);
  return <View style={styles.card}>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>4-HOUR USE STREAK</Text>
      <View style={[styles.status, status.active && styles.statusActive]}>
        <Text style={[styles.statusText, status.active && styles.statusTextActive]}>{status.label}</Text>
      </View>
    </View>
    <Text style={styles.value}>{stats.current} <Text style={styles.valueUnit}>{stats.current === 1 ? 'night' : 'nights'}</Text></Text>
    <Text style={styles.message}>{status.message}</Text>
    <View style={styles.metrics}>
      <Metric label="LONGEST" value={`${stats.longest}`} />
      <Metric label="QUALIFYING" value={`${stats.qualifyingNights}`} />
      <Metric label="RECORDED" value={`${stats.recordedNights}`} />
    </View>
    <Text style={styles.note}>A qualifying night contains at least four recorded therapy hours. This is a tracking threshold, not medical advice.</Text>
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function statusContent(stats: CpapUsageStreakStats) {
  if (stats.state === 'active') return { label: 'ACTIVE', message: `${stats.current} consecutive qualifying nights.`, active: true };
  if (stats.state === 'building') return { label: 'BUILDING', message: 'One more consecutive qualifying night activates the streak.', active: false };
  if (stats.state === 'below_threshold') return { label: 'ENDED', message: 'The latest recorded night was under four hours. Earlier progress remains in your history.', active: false };
  if (stats.state === 'no_data') return {
    label: 'NO DATA',
    message: `No completed record for ${formatDate(stats.referenceDate)}. ${stats.current ? 'The last confirmed run is preserved until you backfill it.' : 'Add it later and Reclaim will recalculate.'}`,
    active: false,
  };
  return { label: 'NO DATA', message: 'Add a completed CPAP night to begin tracking.', active: false };
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  eyebrow: { ...type.micro, color: colors.textMuted, fontWeight: '900', letterSpacing: 1 },
  status: { borderRadius: 999, backgroundColor: colors.surfaceRaised, paddingHorizontal: 9, paddingVertical: 5 },
  statusActive: { backgroundColor: colors.accentSoft },
  statusText: { ...type.micro, color: colors.textMuted, fontWeight: '900', letterSpacing: .7 },
  statusTextActive: { color: colors.accent },
  value: { color: colors.text, fontSize: 36, fontWeight: '900', marginTop: 10, fontVariant: ['tabular-nums'] },
  valueUnit: { color: colors.textMuted, fontSize: 16 },
  message: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  metrics: { flexDirection: 'row', borderTopColor: colors.border, borderTopWidth: 1, marginTop: 15, paddingTop: 13 },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: colors.text, fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricLabel: { ...type.micro, color: colors.textMuted, fontWeight: '900', marginTop: 3 },
  note: { ...type.micro, color: colors.textMuted, textAlign: 'center', marginTop: 13 },
});
