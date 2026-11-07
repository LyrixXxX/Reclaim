import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DurationProgress } from '@/components/duration-progress';
import { formatSavings } from '@/lib/habit-savings';
import { useNow } from '@/hooks/use-now';
import { DatePrecision, Tracker } from '@/models/tracker';
import { formatLocalStartDate } from '@/lib/date-format';
import { trackerDisplayName } from '@/lib/tracker-management';
import { checkpointLabel, quitSummary } from '@/lib/quit-progress';
import { colors, layout, spacing, type, font } from '@/theme';
import { Chevron } from '@/components/icon';

export function TimerCard({ tracker, phaseStart, phasePrecision = 'exact', phaseStartLabel, modeLabel = 'ABSTINENT', expanded = true, beaten = 0 }: { beaten?: number; tracker: Tracker; phaseStart?: string; phasePrecision?: DatePrecision; phaseStartLabel?: string; modeLabel?: string; expanded?: boolean }) {
  const now = useNow();
  const open = () => router.push({ pathname: '/tracker/[id]', params: { id: tracker.id } });
  const startedAt = phaseStart ?? tracker.startedAt;
  if (!startedAt) return <Pressable accessibilityRole="button" onPress={open} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}><Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
          <View style={styles.metadata}><Text style={styles.name}>{trackerDisplayName(tracker)}</Text><Text style={styles.mode}>{modeLabel}</Text><Text style={styles.startDate}>Set a quit date to start this timer.</Text></View>
        </View>
        <Chevron color={colors.textMuted} />
      </View>
    </Pressable>;
  const summary = quitSummary(tracker, startedAt, phasePrecision, now);
  const exact = summary.exact;
  const clock = `${String(summary.hours).padStart(2, '0')}:${String(summary.minutes).padStart(2, '0')}:${String(Math.floor((now - Date.parse(startedAt)) / 1000) % 60).padStart(2, '0')}`;

  return (
    <Pressable accessibilityRole="button" onPress={open} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.topRow}>
          <View style={styles.identity}>
            <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}>
              <Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text>
            </View>
            <View style={styles.metadata}>
              <Text style={styles.name}>{trackerDisplayName(tracker)}</Text>
              <Text style={styles.startDate}>
                {modeLabel !== 'ABSTINENT' ? `${modeLabel} · ` : ''}{phaseStartLabel ?? `Since ${formatLocalStartDate(startedAt)}`}
              </Text>
            </View>
          </View>
          <Chevron color={colors.textMuted} />
        </View>

        <View style={styles.timer}>
          <Text style={styles.days}>{summary.days.toLocaleString()}</Text>
          <Text style={styles.daysLabel}>{summary.days === 1 ? 'day' : 'days'}</Text>
          {exact ? <Text style={styles.clock}>{clock}</Text> : <Text style={styles.rounded}>ROUNDED</Text>}
        </View>

        <View style={styles.track} accessibilityLabel={`${summary.daysToNext} days to ${checkpointLabel(summary.nextDays)}`}>
          <View style={[styles.fill, { width: `${Math.max(2, summary.checkpointProgress * 100)}%`, backgroundColor: tracker.color }]} />
        </View>
        <View style={styles.nextRow}>
          <Text style={styles.nextText}>Next: <Text style={styles.nextStrong}>{checkpointLabel(summary.nextDays)}</Text></Text>
          <Text style={styles.nextText}>{summary.daysToNext.toLocaleString()} {summary.daysToNext === 1 ? 'day' : 'days'} to go</Text>
        </View>

        {(summary.savingsCents > 0 || beaten > 0) && <View style={styles.stats}>
          {summary.savingsCents > 0 && <View style={styles.stat}><Text style={[styles.statText, { color: colors.success }]}>{formatSavings(summary.savingsCents)} saved</Text></View>}
          {beaten > 0 && <View style={styles.stat}><Text style={styles.statText}>{beaten} {beaten === 1 ? 'craving' : 'cravings'} beaten</Text></View>}
        </View>}

        {exact && expanded && <View style={styles.details}><DurationProgress startedAt={startedAt} now={now} color={tracker.color} compact /></View>}
      </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.86 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  metadata: { flex: 1 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 21, fontFamily: font.semibold },
  name: { color: colors.text, fontSize: 16, fontFamily: font.semibold },
  mode: { ...type.micro, color: colors.textMuted, letterSpacing: 1.1, fontFamily: font.semibold, marginTop: 4 },
  startDate: { ...type.metadata, color: colors.textMuted, fontFamily: font.semibold, marginTop: 4 },
  chevron: { color: colors.textDim, fontSize: 28, fontFamily: font.regular },
  timer: { flexDirection: 'row', alignItems: 'baseline', marginTop: 16 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, marginTop: 14, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  nextText: { ...type.metadata, color: colors.textMuted, fontFamily: font.medium },
  nextStrong: { color: colors.text, fontFamily: font.bold },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  stat: { borderRadius: 999, backgroundColor: colors.surfaceRaised, paddingHorizontal: 10, paddingVertical: 5 },
  statText: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold },
  details: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  days: { color: colors.text, fontSize: 40, letterSpacing: -1.5, fontFamily: font.semibold, fontVariant: ['tabular-nums'] },
  daysLabel: { color: colors.textMuted, fontSize: 15, fontFamily: font.semibold, marginLeft: 7 },
  clock: { color: colors.textMuted, fontSize: 15, fontFamily: font.semibold, marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  rounded: { ...type.micro, color: colors.textMuted, fontFamily: font.bold, letterSpacing: 1, marginLeft: 'auto' },
  savings: { color: colors.success, fontSize: 12, fontFamily: font.semibold, marginTop: 10 },
  checkpoint: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkpointLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 1, fontFamily: font.semibold },
  checkpointTitle: { color: colors.textMuted, fontSize: 12, fontFamily: font.bold, marginTop: 4 },
  countdown: { color: colors.text, fontSize: 13, fontFamily: font.bold, fontVariant: ['tabular-nums'] },
});
