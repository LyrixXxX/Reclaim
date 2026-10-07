import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Header } from '@/components/header';
import { colors, spacing } from '@/theme';

type Props = {
  eyebrow: string;
  subtitle: string;
  accent?: string;
};

export function MainScreenHeader({ eyebrow, subtitle, accent = colors.accent }: Props) {
  return <View style={styles.wrapper}>
    <Header />
    <Animated.View entering={FadeIn.duration(800)} style={styles.intro}>
      <View style={[styles.accentLine, { backgroundColor: accent }]} />
      <Text accessibilityRole="header" style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  intro: { marginTop: 22, marginBottom: spacing.lg },
  accentLine: { width: 34, height: 3, borderRadius: 2, marginBottom: 13 },
  eyebrow: { fontSize: 10, lineHeight: 13, letterSpacing: 1.6, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 9, maxWidth: 560 },
});
