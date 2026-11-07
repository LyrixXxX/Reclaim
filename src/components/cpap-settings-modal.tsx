import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CpapTherapySettingsInput, validateCpapTherapySettings } from '@/lib/cpap';
import { CpapTherapySettings } from '@/models/tracker';
import { colors, spacing, font } from '@/theme';

export function CpapSettingsModal({ visible, setting, onClose, onSave }: { visible: boolean; setting?: CpapTherapySettings | null; onClose: () => void; onSave: (input: CpapTherapySettingsInput) => void }) {
  const insets = useSafeAreaInsets();
  const [effectiveDate, setEffectiveDate] = useState(setting?.effectiveDate ?? localDateKey());
  const [effectiveTime, setEffectiveTime] = useState(setting?.effectiveTime ? formatDisplayTime(setting.effectiveTime) : '');
  const [mode, setMode] = useState<'APAP' | 'CPAP'>(setting?.mode ?? 'APAP');
  const [minPressure, setMinPressure] = useState(setting ? `${setting.minPressure}` : '');
  const [maxPressure, setMaxPressure] = useState(setting ? `${setting.maxPressure}` : '');
  const [rampStartPressure, setRampStartPressure] = useState(setting?.rampStartPressure === undefined ? '' : `${setting.rampStartPressure}`);
  const [rampMinutes, setRampMinutes] = useState(setting?.rampMinutes === undefined ? '' : `${setting.rampMinutes}`);
  const [exhalationRelief, setExhalationRelief] = useState(setting?.exhalationRelief ?? '');
  const [humidity, setHumidity] = useState(setting?.humidity ?? '');
  const [heatedTubeTemperature, setHeatedTubeTemperature] = useState(setting?.heatedTubeTemperature ?? '');
  const [maskName, setMaskName] = useState(setting?.maskName ?? '');
  const [note, setNote] = useState(setting?.note ?? '');
  const [error, setError] = useState<string>();

  const save = () => {
    const normalizedTime = effectiveTime.trim() ? parseDisplayTime(effectiveTime) : undefined;
    if (effectiveTime.trim() && !normalizedTime) return setError('Enter time like 9:30 PM, or leave it blank.');
    const input: CpapTherapySettingsInput = {
      id: setting?.id,
      effectiveDate: effectiveDate.trim(),
      effectiveTime: normalizedTime,
      mode,
      minPressure: Number(minPressure),
      maxPressure: Number(maxPressure),
      rampStartPressure: optionalNumber(rampStartPressure),
      rampMinutes: optionalNumber(rampMinutes),
      exhalationRelief,
      humidity,
      heatedTubeTemperature,
      maskName,
      note,
    };
    const nextError = validateCpapTherapySettings(input);
    if (nextError) return setError(nextError);
    onSave(input);
    onClose();
  };

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}><View><Text style={styles.eyebrow}>THERAPY SETTINGS</Text><Text style={styles.title}>{setting ? 'Edit settings period' : 'Add settings change'}</Text></View><Pressable onPress={onClose} hitSlop={10}><Text style={styles.close}>Cancel</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Text style={styles.help}>Record the settings shown on the machine. Reclaim will place them on pressure charts without interpreting them.</Text>
          <Field label="Effective date · YYYY-MM-DD" value={effectiveDate} onChangeText={setEffectiveDate} keyboardType="numbers-and-punctuation" />
          <Field label="Optional exact time · 9:30 PM" value={effectiveTime} onChangeText={setEffectiveTime} autoCapitalize="characters" placeholder="Leave blank if unknown" />
          <Text style={styles.fieldLabel}>MODE</Text><View style={styles.modeRow}>{(['APAP', 'CPAP'] as const).map((item) => <Pressable key={item} onPress={() => setMode(item)} style={[styles.mode, mode === item && styles.modeActive]}><Text style={[styles.modeText, mode === item && styles.modeTextActive]}>{item}</Text></Pressable>)}</View>
          <View style={styles.twoColumn}><Field containerStyle={styles.column} label="MIN PRESSURE" value={minPressure} onChangeText={setMinPressure} keyboardType="decimal-pad" suffix="cmH₂O" /><Field containerStyle={styles.column} label="MAX PRESSURE" value={maxPressure} onChangeText={setMaxPressure} keyboardType="decimal-pad" suffix="cmH₂O" /></View>
          <Text style={styles.optional}>Optional machine details</Text>
          <View style={styles.twoColumn}><Field containerStyle={styles.column} label="RAMP START" value={rampStartPressure} onChangeText={setRampStartPressure} keyboardType="decimal-pad" suffix="cmH₂O" /><Field containerStyle={styles.column} label="RAMP MINUTES" value={rampMinutes} onChangeText={setRampMinutes} keyboardType="number-pad" /></View>
          <Field label="EXHALATION RELIEF / RESLEX" value={exhalationRelief} onChangeText={setExhalationRelief} placeholder="Example: 2" />
          <Field label="HUMIDITY" value={humidity} onChangeText={setHumidity} />
          <Field label="HEATED TUBE TEMPERATURE" value={heatedTubeTemperature} onChangeText={setHeatedTubeTemperature} />
          <Field label="MASK" value={maskName} onChangeText={setMaskName} />
          <Field label="NOTE" value={note} onChangeText={setNote} multiline placeholder="Optional reason or context" />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable onPress={save} style={styles.save}><Text style={styles.saveText}>Save settings</Text></Pressable>
          <View style={{ height: insets.bottom + 240 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function Field({ label, suffix, containerStyle, ...props }: React.ComponentProps<typeof TextInput> & { label: string; suffix?: string; containerStyle?: object }) {
  return <View style={[styles.field, containerStyle]}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.inputRow}><TextInput {...props} placeholderTextColor={colors.textDim} style={[styles.input, props.multiline && styles.multiline]} />{suffix && <Text style={styles.suffix}>{suffix}</Text>}</View></View>;
}

function optionalNumber(value: string) { return value.trim() ? Number(value) : undefined; }
function localDateKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function parseDisplayTime(value: string) {
  const match = value.trim().match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*([AP]M)$/i);
  if (!match) return undefined;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
function formatDisplayTime(value: string) { const [rawHour, minute] = value.split(':').map(Number); const suffix = rawHour >= 12 ? 'PM' : 'AM'; const hour = rawHour % 12 || 12; return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`; }

const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.72)' }, sheet: { maxHeight: '94%', minHeight: '68%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, eyebrow: { color: colors.cpapNav, fontSize: 11, fontFamily: font.bold, letterSpacing: 1.2 }, title: { color: colors.text, fontSize: 21, fontFamily: font.bold, marginTop: 4 }, close: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold, padding: 8 }, content: { padding: spacing.lg }, help: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18, marginBottom: 12 }, field: { marginTop: 13 }, fieldLabel: { color: colors.textDim, fontSize: 11, fontFamily: font.semibold, letterSpacing: .7, marginBottom: 6 }, inputRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background }, input: { flex: 1, color: colors.text, fontSize: 14, fontFamily: font.regular, paddingHorizontal: 13, paddingVertical: 12 }, multiline: { minHeight: 90, textAlignVertical: 'top' }, suffix: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, paddingRight: 12 }, twoColumn: { flexDirection: 'row', gap: 10 }, column: { flex: 1 }, modeRow: { flexDirection: 'row', gap: 8 }, mode: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border }, modeActive: { borderColor: colors.cpapNav, backgroundColor: colors.accentSoft }, modeText: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold }, modeTextActive: { color: colors.cpapNav }, optional: { color: colors.text, fontSize: 15, fontFamily: font.semibold, marginTop: 24 }, error: { color: colors.danger, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 12 }, save: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cpapNav, borderRadius: 14, marginTop: 18 }, saveText: { color: colors.background, fontSize: 13, fontFamily: font.bold } });
