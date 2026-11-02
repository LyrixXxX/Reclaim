import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

export function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <Image source={require('../../assets/images/reclaim-icon.png')} style={styles.mark} resizeMode="contain" accessible={false} />
        <Text style={styles.name}>Reclaim</Text>
      </View>
      <View style={styles.privatePill} accessibilityLabel="Records are stored on this device">
        <View style={styles.dot} />
        <Text style={styles.privateText}>On device</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },
  name: { color: colors.text, fontSize: 16, letterSpacing: 0.2, fontWeight: '700' },
  privatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  privateText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
});
