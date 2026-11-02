import { Pressable, StyleSheet, Text, View } from 'react-native';

import { selectionHaptic } from '@/lib/haptics';
import { colors, type, font } from '@/theme';

type Option<T extends string> = { value: T; label: string };

export function RangeSelector<T extends string>({ options, value, onChange, accent = colors.accent }: { options: Option<T>[]; value: T; onChange: (value: T) => void; accent?: string }) {
  return <View style={styles.shell}>
    {options.map((option) => {
      const active = value === option.value;
      return <Pressable
        key={option.value}
        accessibilityRole="radio"
        accessibilityState={{ checked: active }}
        onPress={() => { selectionHaptic(); onChange(option.value); }}
        style={[styles.button, active && { backgroundColor: `${accent}18`, borderColor: `${accent}7A` }]}
      >
        <Text numberOfLines={1} style={[styles.text, active && { color: accent }]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  shell: { width: '100%', flexDirection: 'row', gap: 5, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 4 },
  button: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 4 },
  text: { ...type.micro, color: colors.textMuted, fontFamily: font.bold },
});
