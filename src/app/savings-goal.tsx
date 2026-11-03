import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useTrackers } from '@/state/tracker-context';
import { formatSavings } from '@/lib/habit-savings';
import { activeSavingsGoal, quittingStarts, totalQuitSavings } from '@/lib/quit-progress';
import { colors, font, layout, radius, type } from '@/theme';

const IDEAS = ['New hiking boots', 'A weekend trip', 'Concert tickets', 'Something just for me'];

export default function SavingsGoalScreen() {
  const router = useRouter();
  const { trackers, taperSteps = [], savingsGoals = [], saveSavingsGoal, deleteSavingsGoal } = useTrackers();
  const saved = totalQuitSavings(quittingStarts(trackers, taperSteps));
  const current = activeSavingsGoal(savingsGoals, saved);
  const [name, setName] = useState(current?.goal.name ?? '');
  const [amount, setAmount] = useState(current ? String(current.goal.targetCents / 100) : '');
  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100);
  const valid = name.trim().length > 0 && Number.isFinite(cents) && cents > 0;
  const achieved = current && current.remainingCents === 0;
  const reached = savingsGoals.filter((item) => item.achievedAt).sort((a, b) => (b.achievedAt ?? '').localeCompare(a.achievedAt ?? ''));

  const save = () => {
    if (!valid) return;
    saveSavingsGoal({ id: current?.goal.id ?? `goal-${new Date().getTime()}`, name: name.trim(), targetCents: cents, createdAt: current?.goal.createdAt ?? new Date().toISOString() });
    router.back();
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{current ? 'Your savings goal' : 'Set a savings goal'}</Text>
    <Text style={styles.lead}>Turn the money you’re no longer spending into something you want. Reclaim counts toward it from your quit trackers’ savings, {formatSavings(saved)} so far.</Text>

    <View style={styles.field}>
      <Text style={styles.label}>What are you saving for?</Text>
      <TextInput value={name} onChangeText={setName} placeholder="New hiking boots" placeholderTextColor={colors.textDim} style={styles.input} accessibilityLabel="Goal name" maxLength={60} />
      {!current && <View style={styles.ideas}>{IDEAS.map((idea) => <Pressable key={idea} accessibilityRole="button" onPress={() => setName(idea)} style={styles.idea}><Text style={styles.ideaText}>{idea}</Text></Pressable>)}</View>}
    </View>

    <View style={styles.field}>
      <Text style={styles.label}>How much does it cost?</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="180" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" style={styles.input} accessibilityLabel="Goal amount in dollars" />
      {valid && <Text style={styles.hint}>{cents <= saved ? 'You’ve already saved enough for this.' : `${formatSavings(cents - saved)} to go.`}</Text>}
    </View>

    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid }} disabled={!valid} onPress={save} style={[styles.primary, !valid && styles.disabled]}><Text style={styles.primaryText}>{current ? 'Save changes' : 'Set goal'}</Text></Pressable>
    {achieved && <Pressable accessibilityRole="button" onPress={() => { saveSavingsGoal({ ...current.goal, achievedAt: new Date().toISOString() }); router.back(); }} style={styles.secondary}><Text style={styles.secondaryText}>I got it! Mark as reached</Text></Pressable>}
    {current && <Pressable accessibilityRole="button" onPress={() => Alert.alert('Remove goal?', `Remove “${current.goal.name}”? Your savings aren’t affected.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { deleteSavingsGoal(current.goal.id); router.back(); } }])} style={styles.link}><Text style={styles.danger}>Remove goal</Text></Pressable>}

    {reached.length > 0 && <View style={styles.field}>
      <Text style={styles.label}>Goals reached</Text>
      {reached.map((item) => <Text key={item.id} style={styles.hint}>{item.name} · {formatSavings(item.targetCents)}</Text>)}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 20 },
  title: { ...type.display, color: colors.text },
  lead: { ...type.body, color: colors.textMuted, fontFamily: font.regular },
  field: { gap: 8 },
  label: { ...type.heading, color: colors.text },
  hint: { ...type.metadata, color: colors.textMuted, fontFamily: font.medium },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 16, fontFamily: font.medium },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idea: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  ideaText: { color: colors.textMuted, fontSize: 13, fontFamily: font.semibold },
  primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.habitsNav, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.background, fontSize: 16, fontFamily: font.bold },
  disabled: { opacity: 0.4 },
  secondary: { minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.success, fontSize: 15, fontFamily: font.bold },
  link: { alignSelf: 'center', padding: 8 },
  danger: { color: colors.danger, fontSize: 14, fontFamily: font.semibold },
});
