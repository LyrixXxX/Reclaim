import { Pressable, StyleSheet, Text, View } from 'react-native';

import { localDateKey } from '@/lib/progress';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';

export function CheckInButton() {
  const { checkIns, checkInToday } = useTrackers();
  const checked = checkIns.includes(localDateKey());

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Still on plan today"
      disabled={checked}
      onPress={checkInToday}
      style={({ pressed }) => [
        styles.button,
        checked && styles.buttonChecked,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.check, checked && styles.checkFilled]}>
        <Text style={[styles.checkText, checked && styles.checkTextFilled]}>✓</Text>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, checked && styles.titleChecked]}>
          {checked ? 'Checked in for today' : 'Still on plan today'}
        </Text>
        <Text style={styles.caption}>
          {checked ? 'A small promise, kept.' : 'One tap. No notes required.'}
        </Text>
      </View>
      <Text style={styles.arrow}>{checked ? 'DONE' : '→'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 84,
    borderRadius: layout.radius,
    padding: spacing.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  buttonChecked: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#1F3A2C' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  check: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(11,13,12,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkFilled: { backgroundColor: colors.accent },
  checkText: { color: colors.background, fontSize: 21, fontFamily: font.bold },
  checkTextFilled: { color: colors.background },
  copy: { flex: 1 },
  title: { color: colors.background, fontSize: 16, fontFamily: font.bold },
  titleChecked: { color: colors.text },
  caption: { color: colors.textDim, fontSize: 12, marginTop: 5, fontFamily: font.semibold },
  arrow: { color: colors.background, fontSize: 19, fontFamily: font.bold },
});
