import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DurationProgress } from '@/components/duration-progress';
import { estimateTrackerSavings, formatSavings } from '@/lib/habit-savings';
import { useNow } from '@/hooks/use-now';
import { DatePrecision, Tracker } from '@/models/tracker';
import { elapsedParts, nextCheckpoint } from '@/lib/progress';
import { formatLocalStartDate } from '@/lib/date-format';
import { trackerDisplayName } from '@/lib/tracker-management';
import { completedCalendarDays, roundedNextCheckpoint } from '@/lib/taper-quit';
import { colors, layout, spacing, type } from '@/theme';

export function TimerCard({ tracker, phaseStart, phasePrecision = 'exact', phaseStartLabel, modeLabel = 'ABSTINENT', expanded = true }: { tracker: Tracker; phaseStart?: string; phasePrecision?: DatePrecision; phaseStartLabel?: string; modeLabel?: string; expanded?: boolean }) {
  const now = useNow();
  const startedAt = phaseStart ?? tracker.startedAt;
  if (!startedAt) return <Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id } }} asChild>
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}><Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
          <View style={styles.metadata}><Text style={styles.name}>{trackerDisplayName(tracker)}</Text><Text style={styles.mode}>{modeLabel}</Text><Text style={styles.startDate}>Set a quit date to start this timer.</Text></View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  </Link>;
  const exact = phasePrecision === 'exact';
  const elapsed = elapsedParts(startedAt, now);
  const roundedDays = completedCalendarDays(startedAt, new Date(now));
  const checkpoints = tracker.checkpointDays ?? [1, 3, 7, 14, 30, 60, 90, 180, 365];
  const checkpoint = exact ? nextCheckpoint(startedAt, checkpoints, now) : roundedNextCheckpoint(startedAt, checkpoints, new Date(now));

  return (
    <Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.topRow}>
          <View style={styles.identity}>
            <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}>
              <Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text>
            </View>
            <View style={styles.metadata}>
              <Text style={styles.name}>{trackerDisplayName(tracker)}</Text>
              <Text style={styles.mode}>{modeLabel}</Text>
              <Text style={styles.startDate}>
                {phaseStartLabel ?? `Started ${formatLocalStartDate(startedAt)}`}
              </Text>
            </View>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        <View style={styles.timer}>
          <Text style={styles.days}>{exact ? elapsed.days : roundedDays}</Text>
          <Text style={styles.daysLabel}>days</Text>
          {exact ? <Text style={styles.clock}>{String(elapsed.hours).padStart(2, '0')}:{String(elapsed.minutes).padStart(2, '0')}:{String(elapsed.seconds).padStart(2, '0')}</Text> : <Text style={styles.rounded}>ROUNDED</Text>}
        </View>
        {!!tracker.savingsExpenses?.length && <Text style={styles.savings}>Estimated saved · {formatSavings(estimateTrackerSavings(tracker.savingsExpenses, startedAt, now))}</Text>}

        {exact && expanded && <DurationProgress startedAt={startedAt} now={now} color={tracker.color} compact />}

        {expanded && <View style={styles.checkpoint}>
          <View>
            <Text style={styles.checkpointLabel}>NEXT CHECKPOINT</Text>
            <Text style={styles.checkpointTitle}>{checkpoint.targetDays} days</Text>
          </View>
          <Text style={styles.countdown}>{checkpoint.remainingDays}d{exact ? ` ${checkpoint.remainingHours}h` : ' · rounded'}</Text>
        </View>}
      </Pressable>
    </Link>
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
  iconText: { fontSize: 21, fontWeight: '600' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  mode: { ...type.micro, color: colors.textMuted, letterSpacing: 1.1, fontWeight: '600', marginTop: 4 },
  startDate: { ...type.metadata, color: colors.textMuted, fontWeight: '600', marginTop: 4 },
  chevron: { color: colors.textDim, fontSize: 28, fontWeight: '300' },
  timer: { flexDirection: 'row', alignItems: 'baseline', marginTop: 22 },
  days: { color: colors.text, fontSize: 44, letterSpacing: -1.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  daysLabel: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginLeft: 7 },
  clock: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  rounded: { ...type.micro, color: colors.textMuted, fontWeight: '700', letterSpacing: 1, marginLeft: 'auto' },
  savings: { color: colors.success, fontSize: 12, fontWeight: '600', marginTop: 10 },
  checkpoint: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkpointLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 1, fontWeight: '600' },
  checkpointTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  countdown: { color: colors.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
