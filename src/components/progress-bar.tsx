import { StyleSheet, Text, View } from 'react-native';

import { colors, type } from '@/theme';

type Props = { label: string; progress: number; color: string; totalLabel?: string; secondaryLabel?: string };

export function ProgressBar({ label, progress, color, totalLabel, secondaryLabel }: Props) {
  const bounded = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.item, totalLabel && styles.durationItem]}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.percent}>{Math.round(bounded * 100)}%</Text>
      </View>
      {totalLabel && <Text style={styles.total}>{totalLabel}</Text>}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${bounded === 0 ? 0 : Math.max(2, bounded * 100)}%`, backgroundColor: color }]} />
      </View>
      {secondaryLabel && <Text style={styles.secondary}>{secondaryLabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flex: 1, minWidth: 64 },
  durationItem: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%', minWidth: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  label: { ...type.micro, color: colors.textMuted, fontWeight: '600' },
  percent: { ...type.micro, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  total: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 7, fontVariant: ['tabular-nums'] },
  track: { height: 4, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  secondary: { ...type.micro, color: colors.textMuted, marginTop: 5, fontVariant: ['tabular-nums'] },
});
