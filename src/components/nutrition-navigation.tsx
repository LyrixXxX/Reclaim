import { Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, font } from '@/theme';

export function NutritionNavigation({ date }: { date: string }) {
  return <View style={styles.row}>
    <Tile href="/nutrition-trends" label="Trends" icon="chart" hint="View your food trend report" />
    <Tile href={{ pathname: '/nutrition-settings', params: { date } }} label="Macros" icon="target" hint="Manage macro and additional food targets" />
  </View>;
}

function Tile({ href, label, icon, hint }: { href: Href; label: string; icon: 'chart' | 'target'; hint: string }) {
  // Keep the dynamic Pressable style outside Link's asChild style merging.
  return <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
    <View style={styles.icon} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.nutritionNav} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {icon === 'chart' ? <><Path d="M4 3v17h17" /><Path d="m7 15 4-5 4 2 5-7" /></> : <><Circle cx={12} cy={12} r={9} /><Circle cx={12} cy={12} r={5} /><Circle cx={12} cy={12} r={1} /></>}
      </Svg>
    </View>
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 8, marginTop: 9 },
  tile: { flex: 1, minWidth: 0, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 5, paddingVertical: 8, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.surface, borderColor: colors.nutritionNav },
  label: { color: colors.text, fontSize: 11, lineHeight: 14, fontFamily: font.semibold, textAlign: 'center' },
});
