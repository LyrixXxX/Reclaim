import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { addWaterShortcut, MAX_WATER_SHORTCUTS, removeWaterShortcut, WaterUnit, waterDisplayAmount, waterShortcuts, waterToOunces } from '@/lib/water-habit';
import { Tracker } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, font } from '@/theme';

/**
 * Water quick-add buttons: the main one, then the user's other bottle and glass sizes, then +.
 * Tap logs (the caller confirms); long-press a size to make it the main button or remove it.
 */
export function WaterQuickAdd({ tracker, onPick, compact }: { tracker: Tracker; onPick: (ounces: number) => void; compact?: boolean }) {
  const { setWaterShortcuts } = useTrackers();
  const unit = tracker.waterDisplayUnit ?? 'fl oz';
  const { main, others } = waterShortcuts(tracker);
  const [adding, setAdding] = useState(false);
  const label = (ounces: number) => `${waterDisplayAmount(ounces, unit)} ${unit}`;
  const manage = (ounces: number) => Alert.alert(`${label(ounces)} button`, undefined, [
    { text: 'Make main button', onPress: () => setWaterShortcuts(tracker.id, addWaterShortcut(tracker, ounces, true)) },
    { text: 'Remove', style: 'destructive', onPress: () => setWaterShortcuts(tracker.id, removeWaterShortcut(tracker, ounces)) },
    { text: 'Cancel', style: 'cancel' },
  ]);

  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Add ${label(main)} of water`} onPress={() => onPick(main)} style={[styles.main, compact && styles.mainCompact]}>
      <Text style={[styles.mainText, compact && styles.mainTextCompact]}>+ {label(main)}</Text>
    </Pressable>
    <View style={styles.row}>
      {others.map((ounces) => <Pressable key={ounces} accessibilityRole="button" accessibilityLabel={`Add ${label(ounces)} of water`} accessibilityHint="Long-press to make it the main button or remove it" onPress={() => onPick(ounces)} onLongPress={() => manage(ounces)} style={styles.chip}>
        <Text style={styles.chipText}>+ {label(ounces)}</Text>
      </Pressable>)}
      {others.length < MAX_WATER_SHORTCUTS && <Pressable accessibilityRole="button" accessibilityLabel="Add a quick-add button" onPress={() => setAdding(true)} style={[styles.chip, styles.addChip]}>
        <Text style={styles.addText}>{others.length ? '+ Size' : '+ Add a bottle size'}</Text>
      </Pressable>}
    </View>
    {others.length > 0 && !compact && <Text style={styles.hint}>Long-press a size to make it the main button or remove it.</Text>}
    <AddShortcut visible={adding} unit={unit} onClose={() => setAdding(false)} onSave={(ounces, makeMain) => { setWaterShortcuts(tracker.id, addWaterShortcut(tracker, ounces, makeMain)); setAdding(false); }} />
  </View>;
}

function AddShortcut({ visible, unit, onClose, onSave }: { visible: boolean; unit: WaterUnit; onClose: () => void; onSave: (ounces: number, makeMain: boolean) => void }) {
  const [entryUnit, setEntryUnit] = useState<WaterUnit>(unit);
  const [text, setText] = useState('');
  const [makeMain, setMakeMain] = useState(false);
  const [error, setError] = useState('');
  const close = () => { setText(''); setMakeMain(false); setError(''); onClose(); };
  const save = () => {
    const ounces = waterToOunces(Number(text.replace(',', '.')), entryUnit);
    if (!text.trim() || !Number.isFinite(ounces) || ounces <= 0 || ounces > 1000) { setError('Enter an amount greater than zero, up to 1,000 fl oz.'); return; }
    setText(''); setMakeMain(false); setError('');
    onSave(ounces, makeMain);
  };
  return <Modal visible={visible} transparent animationType="fade" onShow={() => setEntryUnit(unit)} onRequestClose={close}>
    <View style={styles.shade}><View style={styles.modal}>
      <Text style={styles.title}>Add a quick-add button</Text>
      <Text style={styles.hint}>For a bottle or glass you drink often, like a 16.9 fl oz bottle.</Text>
      <View style={styles.row}>{(['fl oz', 'mL'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: entryUnit === choice }} onPress={() => setEntryUnit(choice)} style={[styles.chip, entryUnit === choice && styles.unitOn]}><Text style={styles.chipText}>{choice}</Text></Pressable>)}</View>
      <TextInput autoFocus accessibilityLabel={`Bottle size in ${entryUnit}`} keyboardType="decimal-pad" value={text} onChangeText={setText} placeholder={entryUnit === 'mL' ? 'e.g. 500' : 'e.g. 16.9'} placeholderTextColor={colors.textDim} style={styles.input} />
      <View style={styles.switchRow}><Text style={styles.switchText}>Make it the main button</Text><Switch accessibilityLabel="Make it the main button" value={makeMain} onValueChange={setMakeMain} trackColor={{ false: colors.border, true: colors.habitsNav }} thumbColor={colors.text} /></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={save} style={styles.main}><Text style={styles.mainText}>Save button</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={close} style={styles.cancel}><Text style={styles.switchText}>Cancel</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  main: { minHeight: 50, backgroundColor: colors.habitsNav, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  mainCompact: { minHeight: 46, backgroundColor: colors.accentSoft },
  mainText: { color: colors.background, fontSize: 16, fontFamily: font.bold },
  mainTextCompact: { color: colors.habitsNav, fontSize: 15, fontFamily: font.semibold },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.habitsNav, alignItems: 'center', justifyContent: 'center' },
  chipText: { color: colors.habitsNav, fontSize: 13, fontFamily: font.semibold },
  addChip: { borderColor: colors.border, borderStyle: 'dashed' },
  addText: { color: colors.textMuted, fontSize: 13, fontFamily: font.semibold },
  unitOn: { backgroundColor: colors.accentSoft },
  hint: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18 },
  shade: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 22 },
  modal: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 18, fontFamily: font.semibold },
  input: { color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 15, fontSize: 18, fontFamily: font.regular },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchText: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  error: { color: colors.danger, fontSize: 12, fontFamily: font.regular },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
