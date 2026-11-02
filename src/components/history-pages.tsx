import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { historyPage, initialHistoryPage } from '@/lib/history-pages';
import { colors, font } from '@/theme';

export function HistoryPages<T>({ items, children, startAt = 'first', pageSize }: { items: readonly T[]; children: (page: T[]) => ReactNode; startAt?: 'first' | 'last'; pageSize?: number }) {
  const [requestedPage, setPage] = useState(() => initialHistoryPage(items.length, startAt, pageSize));
  const result = historyPage(items, requestedPage, pageSize);
  // Keep the stored cursor valid after deletion so later additions cannot jump pages.
  if (requestedPage !== result.page) setPage(result.page);
  const controls = <View style={styles.controls}>
    <Text style={styles.summary} accessibilityLiveRegion="polite">Page {result.page + 1} of {result.pageCount} · {result.first}–{result.last} of {result.total} entries</Text>
    {result.pageCount > 1 && <View style={styles.buttons}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous history page" disabled={result.page === 0} onPress={() => setPage(result.page - 1)} style={[styles.button, result.page === 0 && styles.disabled]}><Text style={styles.label}>‹ Previous</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next history page" disabled={result.page === result.pageCount - 1} onPress={() => setPage(result.page + 1)} style={[styles.button, result.page === result.pageCount - 1 && styles.disabled]}><Text style={styles.label}>Next ›</Text></Pressable>
    </View>}
  </View>;
  return <View>{result.total > 0 && controls}{children(result.items)}{result.pageCount > 1 && controls}</View>;
}

const styles = StyleSheet.create({
  controls: { paddingVertical: 12, gap: 8 }, summary: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18, textAlign: 'center' }, buttons: { flexDirection: 'row', gap: 10 }, button: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }, label: { color: colors.text, fontSize: 14, fontFamily: font.bold }, disabled: { opacity: .35 },
});
