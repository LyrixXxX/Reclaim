import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { HistoricalEntry, TrackerId } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';
import { colors, layout, spacing } from '@/theme';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';

type Props = {
  visible: boolean;
  trackerId: TrackerId;
  startedAt?: string;
  event?: HistoricalEntry | null;
  onClose: () => void;
  onSave: (date: string, note?: string) => void;
  onDelete?: () => void;
};

export function LapseModal({
  visible, startedAt, event, onClose, onSave, onDelete,
}: Props) {
  const [date, setDate] = useState(event?.eventDate ?? localDateKey());
  const [note, setNote] = useState(event?.note ?? '');

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date)
    && date <= localDateKey()
    && (!startedAt || date >= localDateKey(new Date(startedAt)));

  const shiftDate = (days: number) => {
    const next = new Date(`${date}T00:00:00`);
    if (Number.isNaN(next.getTime())) return;
    next.setDate(next.getDate() + days);
    setDate(localDateKey(next));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafeScrollView contentContainerStyle={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>{event ? 'EDIT RECORD' : 'LOG A LAPSE'}</Text>
          <Text style={styles.title}>Progress stays with you.</Text>
          <Text style={styles.body}>
            This day will appear as a flat segment. Previous successful days are never removed.
          </Text>

          <Text style={styles.label}>DATE</Text>
          <View style={styles.dateRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => shiftDate(-1)} style={styles.stepButton}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <TextInput
              accessibilityLabel="Lapse date"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textDim}
              style={styles.dateInput}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Next day" onPress={() => shiftDate(1)} style={styles.stepButton}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          {!valid && <Text style={styles.error}>Use a date between the tracker start and today.</Text>}

          <Text style={styles.label}>NOTE · OPTIONAL</Text>
          <TextInput
            accessibilityLabel="Optional lapse note"
            value={note}
            onChangeText={setNote}
            placeholder="What would be useful to remember?"
            placeholderTextColor={colors.textDim}
            multiline
            style={styles.noteInput}
          />

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!valid}
              onPress={() => onSave(date, note)}
              style={[styles.primary, !valid && styles.disabled]}>
              <Text style={styles.primaryText}>{event ? 'Save changes' : 'Log lapse'}</Text>
            </Pressable>
          </View>
          {event && onDelete && (
            <Pressable accessibilityRole="button" onPress={onDelete} style={styles.deleteRecord}>
              <Text style={styles.deleteRecordText}>Delete this lapse record</Text>
            </Pressable>
          )}
        </View>
      </KeyboardSafeScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flexGrow: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radius,
    padding: spacing.lg,
  },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.5, fontWeight: '600' },
  title: { color: colors.text, fontSize: 23, fontWeight: '600', marginTop: 8 },
  body: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  label: { color: colors.textDim, fontSize: 11, letterSpacing: 1.2, fontWeight: '600', marginTop: 22, marginBottom: 8 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateInput: {
    flex: 1,
    height: 46,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepButton: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 21 },
  error: { color: colors.danger, fontSize: 11, marginTop: 7 },
  noteInput: {
    minHeight: 78,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 12,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  primary: { flex: 1, backgroundColor: colors.accent, borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: colors.background, fontSize: 13, fontWeight: '600' },
  secondary: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  deleteRecord: { alignItems: 'center', paddingTop: 18 },
  deleteRecordText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
});
