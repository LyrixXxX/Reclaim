import { StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { liveDuration } from '@/lib/duration';
import { colors } from '@/theme';

export function DurationProgress({ startedAt, now, color, compact = false }: { startedAt: string; now: number; color: string; compact?: boolean }) {
  const duration = liveDuration(startedAt, now);
  return <View style={[styles.container, compact && styles.compact]}>
    <Text style={[styles.fullDuration, compact && styles.compactSummary]}>{duration.fullLabel}</Text>
    <View style={styles.rows}>{duration.rows.map((row) => <ProgressBar
      key={row.unit}
      label={row.unit.toUpperCase()}
      progress={row.progress}
      color={color}
      totalLabel={row.totalLabel}
      secondaryLabel={compact ? undefined : row.secondaryLabel}
    />)}</View>
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', marginTop: 18 },
  compact: { marginTop: 16 },
  fullDuration: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  compactSummary: { fontSize: 13, lineHeight: 18 },
  rows: { gap: 12, marginTop: 14 },
});
