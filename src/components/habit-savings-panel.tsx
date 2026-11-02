import { StyleSheet, Text, View } from 'react-native';

import { estimateExpenseSavings, estimateTrackerSavings, formatSavings } from '@/lib/habit-savings';
import { Tracker } from '@/models/tracker';
import { colors, spacing, font } from '@/theme';

export function HabitSavingsPanel({ tracker, quitAt, now }: { tracker: Tracker; quitAt?: string; now: number }) {
  const expenses = tracker.savingsExpenses ?? [];
  if (!expenses.length || !quitAt) return null;
  return <View style={styles.card}>
    <Text style={styles.eyebrow}>ESTIMATED MONEY SAVED</Text>
    <Text style={styles.total}>{formatSavings(estimateTrackerSavings(expenses, quitAt, now))}</Text>
    {expenses.map((expense) => <View key={expense.id} style={styles.row}>
      <View style={styles.nameWrap}><Text style={styles.name}>{expense.label}</Text>{expense.endedOn && <Text style={styles.stopped}>Stopped {expense.endedOn}</Text>}</View>
      <Text style={styles.amount}>{formatSavings(estimateExpenseSavings(expense, quitAt, now))}</Text>
    </View>)}
    <Text style={styles.note}>Estimate based on the recurring costs you entered. Lapses do not remove earlier savings.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: spacing.lg, marginTop: 16 },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.2, fontFamily: font.bold },
  total: { color: colors.text, fontSize: 30, fontFamily: font.bold, marginTop: 9, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 },
  nameWrap: { flex: 1 }, name: { color: colors.text, fontSize: 13, fontFamily: font.bold }, stopped: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, marginTop: 3 },
  amount: { color: colors.text, fontSize: 14, fontFamily: font.semibold }, note: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 9 },
});
