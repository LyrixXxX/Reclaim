import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, spacing, font } from '@/theme';

export function SavedAdConfirmation({ visible, onContinue, title = 'Saved', subject = 'Your entry' }: { visible: boolean; onContinue: () => void; title?: string; subject?: string }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{subject} is saved.</Text>
      <Pressable accessibilityRole="button" onPress={onContinue} style={styles.button}><Text style={styles.buttonText}>Continue</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.8)', padding: spacing.lg },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontFamily: font.semibold },
  body: { color: colors.textMuted, fontSize: 15, fontFamily: font.regular, lineHeight: 22, marginTop: 10 },
  button: { minHeight: 48, backgroundColor: colors.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonText: { color: colors.background, fontSize: 15, fontFamily: font.semibold },
});
