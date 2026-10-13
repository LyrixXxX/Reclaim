import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, spacing } from '@/theme';

export function SavedAdConfirmation({ visible, adReady, onContinue }: { visible: boolean; adReady: boolean; onContinue: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>Saved</Text>
      <Text style={styles.body}>{adReady ? 'Your entry is saved. A test ad may appear when you continue.' : 'Your entry is saved.'}</Text>
      <Pressable accessibilityRole="button" onPress={onContinue} style={styles.button}><Text style={styles.buttonText}>Continue</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.8)', padding: spacing.lg },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10 },
  button: { minHeight: 48, backgroundColor: colors.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonText: { color: colors.background, fontSize: 15, fontWeight: '800' },
});
