import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { reductionPercent } from '@/lib/progress';
import { formatLocalStartDate } from '@/lib/date-format';
import { trackerDisplayName } from '@/lib/tracker-management';
import { Tracker } from '@/models/tracker';
import { colors, layout, spacing, type } from '@/theme';

export function ReductionCard({ tracker }: { tracker: Tracker }) {
  const baseline = tracker.baseline ?? 0;
  const current = tracker.current ?? 0;
  const reduction = reductionPercent(baseline, current);

  return (
    <Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.top}>
          <View style={styles.identity}>
            <View style={[styles.icon, { backgroundColor: `${tracker.color}1F` }]}>
              <Text style={[styles.iconText, { color: tracker.color }]}>{tracker.icon}</Text>
            </View>
            <View style={styles.metadata}>
              <Text style={styles.name}>{trackerDisplayName(tracker)}</Text>
              <Text style={styles.unit}>{tracker.unit}</Text>
              {tracker.startedAt && (
                <Text style={styles.startDate}>
                  Reduction started {formatLocalStartDate(tracker.startedAt)}
                </Text>
              )}
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: `${tracker.color}18` }]}>
            <Text style={[styles.badgeText, { color: tracker.color }]}>↓ {reduction}%</Text>
          </View>
        </View>

        <View style={styles.values}>
          <View>
            <Text style={styles.valueLabel}>BASELINE</Text>
            <Text style={styles.baseline}>{baseline}</Text>
          </View>
          <View style={styles.rule} />
          <View>
            <Text style={styles.valueLabel}>CURRENT</Text>
            <Text style={[styles.current, { color: tracker.color }]}>{current}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${100 - reduction}%`, backgroundColor: tracker.color }]} />
          <View style={[styles.target, { left: '25%' }]} />
        </View>
        <View style={styles.scale}>
          <Text style={styles.scaleText}>0</Text>
          <Text style={styles.scaleText}>baseline {baseline}</Text>
        </View>
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
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  metadata: { flex: 1 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, fontWeight: '600' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  unit: { ...type.micro, color: colors.textMuted, marginTop: 4 },
  startDate: { ...type.metadata, color: colors.textMuted, fontWeight: '600', marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, marginLeft: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  values: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 24 },
  valueLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 1, fontWeight: '600' },
  baseline: { color: colors.textMuted, fontSize: 27, fontWeight: '700', marginTop: 3 },
  current: { fontSize: 31, fontWeight: '700', marginTop: 1 },
  rule: { width: 1, height: 34, backgroundColor: colors.border, marginHorizontal: 22 },
  chevron: { marginLeft: 'auto', color: colors.textDim, fontSize: 28 },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 6, marginTop: 20, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  target: { position: 'absolute', width: 2, height: 8, top: -1, backgroundColor: colors.text },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  scaleText: { ...type.micro, color: colors.textMuted },
});
