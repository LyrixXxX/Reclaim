import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius } from '@/theme';

/** A one-time nudge that sections can be swiped, shown above the bottom bar until dismissed or used. */
export function SwipeHint({ onDismiss }: { onDismiss: () => void }) {
  const [shift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(shift, { toValue: -14, duration: 600, useNativeDriver: true }),
        Animated.timing(shift, { toValue: 14, duration: 900, useNativeDriver: true }),
        Animated.timing(shift, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.delay(500),
      ]));
      loop.start();
    }).catch(() => undefined);
    return () => loop?.stop();
  }, [shift]);
  return <View pointerEvents="box-none" style={styles.wrap}>
    <View style={styles.pill} accessibilityRole="alert">
      <Animated.Text style={[styles.hand, { transform: [{ translateX: shift }] }]} accessible={false}>⇆</Animated.Text>
      <Text style={styles.text}>Swipe left or right to move between sections</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss swipe tip" hitSlop={10} onPress={onDismiss} style={styles.button}><Text style={styles.buttonText}>Got it</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 112, alignItems: 'center', paddingHorizontal: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 520, borderRadius: radius.lg, borderWidth: 1, borderColor: `${colors.accent}55`, backgroundColor: colors.surfaceRaised, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  hand: { color: colors.accent, fontSize: 22, fontFamily: font.bold, width: 26, textAlign: 'center' },
  text: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontFamily: font.semibold },
  button: { borderRadius: radius.pill, backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { color: colors.background, fontSize: 13, fontFamily: font.bold },
});
