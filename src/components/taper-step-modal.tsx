import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { localDateKey } from '@/lib/progress';
import { formatClockTime, localClockTime, parseClockTime } from '@/lib/clock-time';
import { DatePrecision, TaperStep } from '@/models/tracker';
import { TaperStepInput } from '@/lib/taper';
import { colors, layout, spacing } from '@/theme';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';

const PRECISIONS: { value: DatePrecision; label: string }[] = [
  { value: 'exact', label: 'Exact date and time' },
  { value: 'date_only', label: 'Date only' },
  { value: 'approximate', label: 'Approximate date' },
  { value: 'unknown', label: 'Unknown date' },
];

export function TaperStepModal({
  visible,
  step,
  defaultUnit,
  error,
  historical = false,
  onClose,
  onSave,
}: {
  visible: boolean;
  step?: TaperStep | null;
  defaultUnit: string;
  error?: string;
  historical?: boolean;
  onClose: () => void;
  onSave: (input: TaperStepInput) => void;
}) {
  const start = splitTimestamp(step?.startedAt);
  const end = splitTimestamp(step?.endedAt);
  const [amount, setAmount] = useState(step?.amount.toString() ?? '');
  const [unit, setUnit] = useState(step?.unit ?? defaultUnit);
  const [precision, setPrecision] = useState<DatePrecision>(step?.datePrecision ?? 'exact');
  const [startDate, setStartDate] = useState(start.date || localDateKey());
  const [startTime, setStartTime] = useState(start.time || localClockTime());
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [note, setNote] = useState(step?.note ?? '');
  const [localError, setLocalError] = useState('');
  const modalEyebrow = step ? 'EDIT TAPER STEP' : historical ? 'ADD PAST REDUCTION' : 'ADD REDUCTION STEP';
  const modalTitle = step ? 'Correct this step' : historical ? 'Add a historical step' : 'Begin the next amount';
  const modalBody = step || historical
    ? 'Saving recalculates neighboring durations while preserving your original taper start and current step; impossible or overlapping dates will be rejected'
    : 'The current step will be completed and preserved in your timeline';

  const save = () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) return setLocalError('Enter a valid non-negative amount.');
    if (!unit.trim()) return setLocalError('Measurement unit is required.');
    if (precision !== 'unknown' && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return setLocalError('Enter a valid start date.');
    const normalizedStart = parseClockTime(startTime);
    const normalizedEnd = endTime.trim() ? parseClockTime(endTime) : undefined;
    if (precision === 'exact' && !normalizedStart) return setLocalError('Enter a start time like 9:30 AM, or select date-only precision.');
    if (step?.status === 'completed' && endDate && endTime.trim() && !normalizedEnd) return setLocalError('Enter an end time like 6:15 PM, or leave it blank.');
    onSave({
      amount: numericAmount,
      unit,
      startedAt: precision === 'unknown' ? undefined : `${startDate}T${precision === 'exact' ? normalizedStart : '00:00'}:00`,
      endedAt: step?.status === 'completed' && endDate
        ? `${endDate}T${normalizedEnd || '00:00'}:00`
        : step?.endedAt,
      datePrecision: precision,
      note,
    });
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardSafeScrollView contentContainerStyle={[styles.backdrop, styles.scroll]}><View style={styles.card}>
      <Text style={styles.eyebrow}>{modalEyebrow}</Text>
      <Text style={styles.title}>{modalTitle}</Text>
      <Text style={styles.body}>{modalBody}</Text>
      <Text style={styles.label}>NEW AMOUNT</Text><TextInput accessibilityLabel="Step amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={colors.textDim} style={styles.input} />
      <Text style={styles.label}>UNIT</Text><TextInput accessibilityLabel="Step unit" value={unit} onChangeText={setUnit} placeholder="times per day" placeholderTextColor={colors.textDim} style={styles.input} />
      <Text style={styles.label}>DATE PRECISION</Text>
      <View style={styles.precisionList}>{PRECISIONS.filter((item) => !historical || item.value !== 'unknown').map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: precision === item.value }} onPress={() => setPrecision(item.value)} style={[styles.precisionButton, precision === item.value && styles.selected]}><View style={[styles.radio, precision === item.value && styles.radioSelected]}>{precision === item.value && <View style={styles.radioFill} />}</View><Text style={styles.precisionText}>{item.label}</Text></Pressable>)}</View>
      {precision !== 'unknown' && <><Text style={styles.label}>START DATE</Text><TextInput accessibilityLabel="Step start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} />{precision === 'exact' && <><Text style={styles.label}>START TIME</Text><TextInput accessibilityLabel="Step start time" value={startTime} onChangeText={setStartTime} autoCapitalize="characters" placeholder="9:30 AM" placeholderTextColor={colors.textDim} style={styles.input} /></>}</>}
      {step?.status === 'completed' && <><Text style={styles.label}>END DATE</Text><TextInput accessibilityLabel="Step end date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.label}>END TIME · OPTIONAL</Text><TextInput accessibilityLabel="Step end time" value={endTime} onChangeText={setEndTime} autoCapitalize="characters" placeholder="6:15 PM" placeholderTextColor={colors.textDim} style={styles.input} /></>}
      <Text style={styles.label}>NOTE · OPTIONAL</Text><TextInput accessibilityLabel="Step note" value={note} onChangeText={setNote} multiline placeholder="Context for this step" placeholderTextColor={colors.textDim} style={[styles.input, styles.note]} />
      {(localError || error) && <Text style={styles.error}>{localError || error}</Text>}
      <View style={styles.actions}><Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" onPress={save} style={styles.save}><Text style={styles.saveText}>{step ? 'Save changes' : 'Add step'}</Text></Pressable></View>
    </View></KeyboardSafeScrollView>
  </Modal>;
}

function splitTimestamp(timestamp?: string) { if (!timestamp) return { date: '', time: '' }; const date = new Date(timestamp); return { date: localDateKey(date), time: formatClockTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`) }; }

const styles = StyleSheet.create({
  backdrop: { flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.78)', padding: spacing.lg }, scroll: { justifyContent: 'center' }, card: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.3, fontWeight: '600' }, title: { color: colors.text, fontSize: 22, fontWeight: '600', marginTop: 8 }, body: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 7 }, label: { color: colors.textDim, fontSize: 11, letterSpacing: 1.1, fontWeight: '600', marginTop: 17, marginBottom: 7 }, input: { minHeight: 45, color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 12 }, note: { minHeight: 70, paddingTop: 11, textAlignVertical: 'top' },
  precisionList: { gap: 6 }, precisionButton: { flexDirection: 'row', alignItems: 'center', minHeight: 42, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 11 }, selected: { borderColor: '#45503D' }, radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.textDim, alignItems: 'center', justifyContent: 'center', marginRight: 9 }, radioSelected: { borderColor: colors.accent }, radioFill: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }, precisionText: { color: colors.text, fontSize: 11, fontWeight: '700' }, error: { color: colors.danger, fontSize: 11, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 22 }, cancel: { flex: 1, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 13, paddingVertical: 13 }, cancelText: { color: colors.text, fontSize: 12, fontWeight: '700' }, save: { flex: 1, alignItems: 'center', backgroundColor: colors.accent, borderRadius: 13, paddingVertical: 13 }, saveText: { color: colors.background, fontSize: 12, fontWeight: '600' },
});
