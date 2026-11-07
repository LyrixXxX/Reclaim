import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DetailsDraft, detailsDraftFrom, parseDetails } from '@/lib/personal-details';
import type { WeightTdeeProfile } from '@/models/tracker';
import { colors, font, spacing } from '@/theme';

export type DetailsWeight = { value: string; unit: 'lb' | 'kg' };

/** Height, birth year, the BMR formula and, when asked for, weight. All of them can be left blank. */
export function PersonalDetailsFields({ draft, onChange, weight, onWeightChange }: { draft: DetailsDraft; onChange: (patch: Partial<DetailsDraft>) => void; weight?: DetailsWeight; onWeightChange?: (patch: Partial<DetailsWeight>) => void }) {
  return <View>
    {weight && onWeightChange && <>
      <Text style={styles.label}>Weight</Text>
      <View style={styles.row}>
        <View style={styles.grow}><TextInput accessibilityLabel="Current weight" keyboardType="decimal-pad" placeholder="Weight" placeholderTextColor={colors.textDim} value={weight.value} onChangeText={(value) => onWeightChange({ value })} style={styles.input} /></View>
        {(['lb', 'kg'] as const).map((unit) => <Pressable key={unit} accessibilityRole="radio" accessibilityState={{ checked: weight.unit === unit }} onPress={() => onWeightChange({ unit })} style={[styles.choice, weight.unit === unit && styles.chosen]}><Text style={styles.choiceText}>{unit}</Text></Pressable>)}
      </View>
    </>}
    <Text style={styles.label}>Height</Text>
    <View style={styles.row}>
      <View style={styles.grow}><TextInput accessibilityLabel="Height, feet" keyboardType="number-pad" placeholder="Feet" placeholderTextColor={colors.textDim} value={draft.feet} onChangeText={(feet) => onChange({ feet })} style={styles.input} /></View>
      <View style={styles.grow}><TextInput accessibilityLabel="Height, inches" keyboardType="decimal-pad" placeholder="Inches" placeholderTextColor={colors.textDim} value={draft.inches} onChangeText={(inches) => onChange({ inches })} style={styles.input} /></View>
    </View>
    <Text style={styles.label}>Birth year</Text>
    <TextInput accessibilityLabel="Birth year" keyboardType="number-pad" maxLength={4} placeholder="e.g. 1990" placeholderTextColor={colors.textDim} value={draft.birthYear} onChangeText={(birthYear) => onChange({ birthYear })} style={styles.input} />
    <Text style={styles.label}>Sex for the BMR formula</Text>
    <View style={styles.row}>
      {(['male', 'female'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: draft.formulaSex === choice }} onPress={() => onChange({ formulaSex: draft.formulaSex === choice ? '' : choice })} style={[styles.choice, styles.grow, draft.formulaSex === choice && styles.chosen]}><Text style={styles.choiceText}>{choice === 'male' ? 'Male' : 'Female'}</Text></Pressable>)}
    </View>
    <Text style={styles.help}>Used only for the calorie formula, which has one version for each.</Text>
  </View>;
}

export function PersonalDetailsModal({ title, note, profile, askWeight, onClose, onSave }: { title: string; note: string; profile?: WeightTdeeProfile; askWeight?: boolean; onClose: () => void; onSave: (profile: WeightTdeeProfile, weight?: { value: number; unit: 'lb' | 'kg' }) => void }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(() => detailsDraftFrom(profile));
  const [weight, setWeight] = useState<DetailsWeight>({ value: '', unit: 'lb' });
  const save = () => {
    const weightValue = Number(weight.value.trim());
    if (askWeight && weight.value.trim() && !(weightValue > 0)) { Alert.alert('Check your details', 'Enter a weight greater than zero, or leave it blank.'); return; }
    try {
      onSave(parseDetails(draft), askWeight && weight.value.trim() ? { value: weightValue, unit: weight.unit } : undefined);
    } catch (cause) { Alert.alert('Check your details', cause instanceof Error ? cause.message : 'Please check what you entered.'); }
  };
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.modal}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.note}>{note}</Text>
    <PersonalDetailsFields draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} weight={askWeight ? weight : undefined} onWeightChange={(patch) => setWeight((current) => ({ ...current, ...patch }))} />
    <Pressable accessibilityRole="button" onPress={save} style={styles.save}><Text style={styles.saveText}>Save</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
  </ScrollView></SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontFamily: font.bold },
  note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, fontFamily: font.regular, marginTop: 8 },
  label: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold, marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  input: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, minHeight: 54, paddingHorizontal: 16, fontSize: 18, fontFamily: font.regular },
  choice: { minWidth: 64, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 13 },
  chosen: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceText: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 18, fontFamily: font.regular, marginTop: 8 },
  save: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.accent, marginTop: 26 },
  saveText: { color: colors.background, fontSize: 16, fontFamily: font.bold },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: colors.textMuted, fontSize: 15, fontFamily: font.semibold },
});
