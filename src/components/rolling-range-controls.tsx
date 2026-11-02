import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RangeSelector } from '@/components/range-selector';
import { RollingRange, rollingLabel, rollingOptions } from '@/lib/rolling-range';
import { colors, font } from '@/theme';
import { Icon } from '@/components/icon';

export function RollingRangeControls({ range, onRange, offset, onOffset, start, end, accent }: {
  range: RollingRange; onRange: (range: RollingRange) => void; offset: number;
  onOffset: (offset: number) => void; start: string; end: string; accent: string;
}) {
  return <View style={styles.container}><RangeSelector options={rollingOptions} value={range} onChange={(value) => { onRange(value); onOffset(0); }} accent={accent} />
    <View style={styles.row}>
      {range !== 'ALL' && <Pressable accessibilityRole="button" accessibilityLabel="Previous date window" onPress={() => onOffset(offset - 1)} style={styles.arrow}><Icon name="chevronLeft" size={20} color={colors.textMuted} /></Pressable>}
      <Text style={styles.label}>{range === 'ALL' ? 'All · ' : ''}{rollingLabel(start, end)}</Text>
      {range !== 'ALL' && <Pressable accessibilityRole="button" accessibilityLabel="Next date window" accessibilityState={{ disabled: offset === 0 }} disabled={offset === 0} onPress={() => onOffset(Math.min(0, offset + 1))} style={[styles.arrow, offset === 0 && styles.disabled]}><Icon name="chevronRight" size={20} color={colors.textMuted} /></Pressable>}
    </View>
  </View>;
}

const styles = StyleSheet.create({ container: { width: '100%', alignSelf: 'stretch', flexGrow: 0, flexShrink: 0 }, row: { width: '100%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }, arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceRaised }, arrowText: { fontSize: 25, fontFamily: font.regular, color: colors.text }, label: { flex: 1, minWidth: 0, color: colors.text, fontSize: 13, fontFamily: font.semibold, textAlign: 'center' }, disabled: { opacity: .35 } });
