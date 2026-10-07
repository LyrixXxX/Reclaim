import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

export function BrandedLoading() {
  return <View style={styles.screen} accessibilityLabel="Opening Reclaim" accessibilityState={{ busy: true }}>
    <Image source={require('../../assets/images/reclaim-icon.png')} resizeMode="contain" style={styles.icon} accessible={false} />
    <View style={styles.spinner}><ActivityIndicator size="small" color={colors.accent} /></View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  icon: { width: 120, height: 120, borderRadius: 24 },
  spinner: { position: 'absolute', top: '50%', marginTop: 86 },
});
