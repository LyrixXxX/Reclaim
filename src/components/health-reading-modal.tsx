import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { HealthReadingInput, localDateTimeParts, validateHealthReading } from '@/lib/health';
import { formatClockTime, parseClockTime } from '@/lib/clock-time';
import { HealthReading } from '@/models/tracker';
import { colors, layout, spacing } from '@/theme';

export function HealthReadingModal({ visible, reading, onClose, onSave }: { visible: boolean; reading?: HealthReading | null; onClose: () => void; onSave: (input: HealthReadingInput) => void }) {
  const parts = localDateTimeParts(reading?.measuredAt);
  const [systolic, setSystolic] = useState(reading?.systolic.toString() ?? '');
  const [diastolic, setDiastolic] = useState(reading?.diastolic.toString() ?? '');
  const [pulse, setPulse] = useState(reading?.pulse.toString() ?? '');
  const [date, setDate] = useState(parts.date);
  const [time, setTime] = useState(formatClockTime(parts.time));
  const [note, setNote] = useState(reading?.note ?? '');
  const [error, setError] = useState('');
  const save = () => {
    const clock = parseClockTime(time);
    if (!clock) return setError('Enter a time like 9:30 AM or 6:15 PM.');
    const input = { id: reading?.id, systolic: Number(systolic), diastolic: Number(diastolic), pulse: Number(pulse), measuredAt: `${date}T${clock}:00`, note };
    const nextError = validateHealthReading(input);
    if (nextError) return setError(nextError);
    onSave(input); onClose();
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardSafeScrollView contentContainerStyle={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{reading ? 'EDIT READING' : 'ADD READING'}</Text>
        <Text style={styles.title}>Blood pressure and pulse</Text>
        <View style={styles.bpRow}><NumberField label="SYSTOLIC" value={systolic} setValue={setSystolic} /><Text style={styles.slash}>/</Text><NumberField label="DIASTOLIC" value={diastolic} setValue={setDiastolic} /></View>
        <Text style={styles.unit}>mmHg</Text>
        <Text style={styles.label}>PULSE · BPM</Text><TextInput accessibilityLabel="Pulse" value={pulse} onChangeText={setPulse} keyboardType="number-pad" placeholder="65" placeholderTextColor={colors.textDim} style={styles.input} />
        <View style={styles.dateRow}><View style={styles.flex}><Text style={styles.label}>DATE</Text><TextInput accessibilityLabel="Reading date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} /></View><View style={styles.flex}><Text style={styles.label}>TIME</Text><TextInput accessibilityLabel="Reading time" value={time} onChangeText={setTime} autoCapitalize="characters" placeholder="9:30 AM" placeholderTextColor={colors.textDim} style={styles.input} /></View></View>
        <Text style={styles.label}>NOTE · OPTIONAL</Text><TextInput accessibilityLabel="Reading note" value={note} onChangeText={setNote} multiline placeholder="Context for this reading" placeholderTextColor={colors.textDim} style={[styles.input, styles.note]} />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.actions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable onPress={save} style={styles.save}><Text style={styles.saveText}>Save reading</Text></Pressable></View>
      </View>
    </KeyboardSafeScrollView>
  </Modal>;
}

function NumberField({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) { return <View style={styles.flex}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label === 'SYSTOLIC' ? 'Systolic blood pressure' : 'Diastolic blood pressure'} value={value} onChangeText={setValue} keyboardType="number-pad" maxLength={3} placeholder={label === 'SYSTOLIC' ? '120' : '80'} placeholderTextColor={colors.textDim} style={[styles.input, styles.bpInput]} /></View>; }

const styles = StyleSheet.create({
  backdrop: { flexGrow: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.78)', padding: spacing.lg }, card: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.3, fontWeight: '600' }, title: { color: colors.text, fontSize: 22, fontWeight: '600', marginTop: 7, marginBottom: 3 }, label: { color: colors.textDim, fontSize: 11, letterSpacing: 1.1, fontWeight: '600', marginTop: 17, marginBottom: 7 }, input: { minHeight: 46, color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 12, fontSize: 14 }, bpRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, flex: { flex: 1 }, slash: { color: colors.textMuted, fontSize: 30, paddingBottom: 7 }, bpInput: { fontSize: 24, fontWeight: '600', textAlign: 'center' }, unit: { color: colors.textDim, textAlign: 'center', fontSize: 11, marginTop: 6 }, dateRow: { flexDirection: 'row', gap: 10 }, note: { minHeight: 74, paddingTop: 11, textAlignVertical: 'top' }, error: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 12 }, actions: { flexDirection: 'row', gap: 9, marginTop: 22 }, cancel: { flex: 1, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 13, paddingVertical: 13 }, cancelText: { color: colors.text, fontSize: 12, fontWeight: '700' }, save: { flex: 1, alignItems: 'center', backgroundColor: colors.accent, borderRadius: 13, paddingVertical: 13 }, saveText: { color: colors.background, fontSize: 12, fontWeight: '600' },
});
