import { Href, Link } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNow } from '@/hooks/use-now';
import { localDateKey } from '@/lib/progress';
import { WaterUnit, waterDisplayAmount, waterGoalOn, waterProgress, waterStreak, waterToOunces, waterTotalOn } from '@/lib/water-habit';
import { Tracker, WaterLog } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export function WaterHabitDetail({ tracker, logs }: { tracker: Tracker; logs: WaterLog[] }) {
  const { saveWaterDrink } = useTrackers();
  const now = useNow(30_000);
  const today = localDateKey(new Date(now));
  const progress = waterProgress(tracker, logs, today);
  const unit = tracker.waterDisplayUnit ?? 'fl oz';
  const [customOpen, setCustomOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [entryUnit, setEntryUnit] = useState<WaterUnit>(unit);
  const [error, setError] = useState('');
  const addDrink = (ounces: number) => {
    if (!Number.isFinite(ounces) || ounces <= 0 || ounces > 1000) { setError('Enter an amount greater than zero.'); return; }
    saveWaterDrink({ id: `water-${Date.now()}-${Math.random().toString(36).slice(2)}`, trackerId: tracker.id, eventDate: localDateKey(), ounces, recordedAt: new Date().toISOString() });
    setCustomOpen(false); setAmount(''); setError('');
  };
  const recentDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - index); return localDateKey(date); });
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.icon}>💧</Text><Text style={styles.title}>{tracker.displayName || tracker.name}</Text>
    <Text style={styles.sub}>Today · {today}</Text>
    <View style={styles.card}>
      <Text style={styles.label}>TODAY&apos;S WATER</Text>
      <Text style={styles.amount}>{waterDisplayAmount(progress.amount, unit)}<Text style={styles.target}> / {progress.goal === null ? '—' : waterDisplayAmount(progress.goal, unit)} {unit}</Text></Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percent }} style={styles.track}><View style={[styles.fill, { width: `${progress.percent}%` }]} /></View>
      <Text style={styles.sub}>{progress.percent}% of daily goal{progress.goal && progress.amount >= progress.goal ? ' · Goal reached' : ''}</Text>
      <Pressable accessibilityRole="button" onPress={() => addDrink(tracker.waterQuickAddOz ?? 8)} style={styles.primary}><Text style={styles.primaryText}>+ {waterDisplayAmount(tracker.waterQuickAddOz ?? 8, unit)} {unit}</Text></Pressable>
      {(tracker.waterPresetOz ?? []).length > 0 && <View style={styles.presetRow}>{tracker.waterPresetOz?.map((preset, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Log ${waterDisplayAmount(preset, unit)} ${unit}`} onPress={() => addDrink(preset)} style={styles.preset}><Text style={styles.presetText}>+ {waterDisplayAmount(preset, unit)} {unit}</Text></Pressable>)}</View>}
      <Pressable accessibilityRole="button" onPress={() => { setEntryUnit(unit); setCustomOpen(true); }} style={styles.secondary}><Text style={styles.secondaryText}>Add different amount</Text></Pressable>
    </View>
    <View style={styles.card}><Text style={styles.sectionTitle}>Consistency</Text><Text style={styles.sub}>{waterStreak(tracker, logs, today)} completed {waterStreak(tracker, logs, today) === 1 ? 'day' : 'days'} in a row. Today does not break the streak while it is unfinished.</Text></View>
    <View style={styles.card}><Text style={styles.sectionTitle}>Recent days</Text>{recentDays.map((date) => { const total = waterTotalOn(logs, tracker.id, date); const goal = waterGoalOn(tracker, date); const percent = goal ? Math.min(100, total / goal * 100) : 0; return <View key={date} style={styles.day}><View style={styles.dayHeader}><Text style={styles.dayText}>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text><Text style={styles.dayValue}>{total ? `${waterDisplayAmount(total, unit)} / ${goal === null ? '—' : waterDisplayAmount(goal, unit)} ${unit}` : 'No drinks logged'}</Text></View><View accessibilityLabel={`${date}: ${waterDisplayAmount(total, unit)} of ${goal === null ? 'no goal' : waterDisplayAmount(goal, unit)} ${unit}`} style={styles.dayTrack}>{total > 0 && <View style={[styles.dayFill, { width: `${percent}%` }]} />}</View></View>; })}<Link href={`/water-history?id=${encodeURIComponent(tracker.id)}` as Href} style={styles.link}>View and correct drink history ›</Link></View>
    <Link href={`/water-form?id=${encodeURIComponent(tracker.id)}` as Href} style={styles.edit}>Edit water goal and serving</Link>
    <Text style={styles.disclaimer}>Personal tracking only. Reclaim does not recommend a hydration target.</Text>
    <Modal visible={customOpen} transparent animationType="fade" onRequestClose={() => setCustomOpen(false)}><View style={styles.shade}><View style={styles.modal}><Text style={styles.sectionTitle}>Add a drink</Text><View style={styles.presetRow}>{(['fl oz', 'mL'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: entryUnit === choice }} onPress={() => { const value = Number(amount); setAmount(amount.trim() && Number.isFinite(value) ? waterDisplayAmount(waterToOunces(value, entryUnit), choice) : ''); setEntryUnit(choice); }} style={[styles.preset, entryUnit === choice && styles.unitSelected]}><Text style={styles.presetText}>{choice}</Text></Pressable>)}</View><Text style={styles.sub}>Amount consumed · {entryUnit}</Text><TextInput autoFocus accessibilityLabel={`Custom drink amount in ${entryUnit}`} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder={entryUnit === 'mL' ? 'e.g. 250' : 'e.g. 12'} placeholderTextColor={colors.textDim} style={styles.input} />{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={() => addDrink(waterToOunces(Number(amount), entryUnit))} style={styles.primary}><Text style={styles.primaryText}>Log drink</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { setCustomOpen(false); setError(''); }} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View></View></Modal>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', padding: spacing.lg, paddingBottom: 50, gap: 14 },
  icon: { fontSize: 40, textAlign: 'center' }, title: { color: colors.text, fontSize: 28, fontWeight: '900', textAlign: 'center' }, sub: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, gap: 12 }, label: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1 }, amount: { color: colors.text, fontSize: 38, fontWeight: '900' }, target: { color: colors.textMuted, fontSize: 16 }, track: { height: 16, borderRadius: 9, backgroundColor: colors.border, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.habitsNav },
  primary: { minHeight: 50, backgroundColor: colors.habitsNav, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, primaryText: { color: colors.background, fontSize: 16, fontWeight: '900' }, presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, preset: { minHeight: 44, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.habitsNav, alignItems: 'center', justifyContent: 'center' }, unitSelected: { backgroundColor: colors.accentSoft }, presetText: { color: colors.habitsNav, fontSize: 13, fontWeight: '800' }, secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: colors.text, fontSize: 15, fontWeight: '800' }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  day: { gap: 7, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 }, dayHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, dayText: { color: colors.textMuted, fontSize: 12 }, dayValue: { color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'right' }, dayTrack: { height: 7, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }, dayFill: { height: '100%', borderRadius: 4, backgroundColor: colors.habitsNav }, link: { color: colors.habitsNav, fontSize: 14, fontWeight: '800', marginTop: 6 }, edit: { color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 15, textAlign: 'center', overflow: 'hidden', fontWeight: '800' }, disclaimer: { color: colors.textDim, fontSize: 11, lineHeight: 17 },
  shade: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 22 }, modal: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 20, gap: 12 }, input: { color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 15, fontSize: 18 }, error: { color: colors.danger, fontSize: 12 },
});
