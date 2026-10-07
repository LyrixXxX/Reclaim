import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

export function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <Image source={require('../../assets/images/reclaim-icon.png')} style={styles.mark} resizeMode="contain" accessible={false} />
        <Text style={styles.name}>RECLAIM</Text>
      </View>
      <View style={styles.privatePill}>
        <View style={styles.dot} />
        <Text style={styles.privateText}>ON DEVICE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  name: { color: colors.text, fontSize: 13, letterSpacing: 2.3, fontWeight: '900' },
  privatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 99,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  privateText: { color: colors.textMuted, fontSize: 9, letterSpacing: 1.1, fontWeight: '800' },
});
