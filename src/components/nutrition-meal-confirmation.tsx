import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NutritionMealGroup } from '@/models/tracker';
import { colors, layout, spacing, font } from '@/theme';
import { isoToUs } from '@/lib/us-date';

type Props = {
  visible: boolean;
  groups: NutritionMealGroup[];
  selectedId?: string;
  eventDate: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onBack: () => void;
  onConfirm: () => void;
};

export function NutritionMealConfirmation({ visible, groups, selectedId, eventDate, busy, onSelect, onBack, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const canConfirm = !busy && groups.some((group) => group.id === selectedId);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onBack}>
    <View style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>What meal should this be added to?</Text>
          <Text style={styles.help}>Logging for {isoToUs(eventDate)}. Choose a meal, then confirm.</Text>
          <View style={styles.choices}>{groups.map((group) => {
            const selected = group.id === selectedId;
            return <Pressable key={group.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy }} disabled={busy} onPress={() => onSelect(group.id)} style={[styles.choice, selected && styles.selected]}>
              <Text style={[styles.choiceText, selected && styles.selectedText]}>{selected ? '✓ ' : ''}{group.name}</Text>
            </Pressable>;
          })}</View>
          {!groups.length && <Text style={styles.help}>No meal groups are available. Go back and add a meal group in Nutrition settings.</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canConfirm }} disabled={!canConfirm} onPress={onConfirm} style={[styles.confirm, !canConfirm && styles.disabled]}><Text style={styles.confirmText}>{busy ? 'Saving…' : 'Confirm'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={[styles.back, busy && styles.disabled]}><Text style={styles.choiceText}>Back</Text></Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000B3', justifyContent: 'center', paddingHorizontal: spacing.lg },
  card: { maxHeight: '100%', width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22 },
  content: { padding: spacing.lg },
  title: { color: colors.text, fontSize: 23, fontFamily: font.bold },
  help: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18, marginTop: 10 },
  choices: { gap: 9, marginTop: 20 },
  choice: { minHeight: 48, justifyContent: 'center', padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  selected: { backgroundColor: '#2A2140', borderColor: colors.nutritionNav },
  choiceText: { color: colors.text, fontSize: 14, fontFamily: font.semibold },
  selectedText: { color: colors.nutritionNav },
  confirm: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: colors.nutritionNav, marginTop: 20 },
  confirmText: { color: colors.background, fontSize: 14, fontFamily: font.bold },
  back: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginTop: 9 },
  disabled: { opacity: .5 },
});
