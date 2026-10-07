import { Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme';

export function NutritionNavigation({ date }: { date: string }) {
  return <View style={styles.row}>
    <Tile href="/nutrition-trends" label="Trends" icon="chart" hint="View your food trend report" />
    <Tile href="/nutrition-foods" label="Food Library" icon="library" hint="Open saved foods and meals" />
    <Tile href={{ pathname: '/nutrition-settings', params: { date } }} label="Goals & Meals" icon="target" hint="Manage nutrition targets and meal groups" />
  </View>;
}

function Tile({ href, label, icon, hint }: { href: Href; label: string; icon: 'chart' | 'library' | 'target'; hint: string }) {
  // Keep the dynamic Pressable style outside Link's asChild style merging.
  return <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
    <View style={styles.icon} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.nutritionNav} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {icon === 'chart' ? <><Path d="M4 3v17h17" /><Path d="m7 15 4-5 4 2 5-7" /></> : icon === 'library' ? <><Path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z" /><Path d="M12 5v15M5 8c1.5-.3 3 0 4 .5M5 12c1.5-.3 3 0 4 .5M15 8.5c1-.5 2.5-.8 4-.5M15 12.5c1-.5 2.5-.8 4-.5" /></> : <><Circle cx={12} cy={12} r={9} /><Circle cx={12} cy={12} r={5} /><Circle cx={12} cy={12} r={1} /></>}
      </Svg>
    </View>
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 8, marginTop: 12 },
  tile: { flex: 1, minWidth: 0, minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 5, paddingVertical: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: '#51415F', borderRadius: 16 },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: '#2A2140', borderColor: colors.nutritionNav },
  label: { color: colors.text, fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
});
