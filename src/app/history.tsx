import { useLocalSearchParams } from 'expo-router';
import { HistoryPages } from '@/components/history-pages';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';

import {
  historyCompleteness,
  isBackfilled,
  outcomeLabel,
} from '@/lib/history';
import { localDateKey } from '@/lib/progress';
import { taperQuitPhase } from '@/lib/taper-quit';
import { DayOutcome, HistoricalEntry, TrackerId } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';
import { Icon } from '@/components/icon';

const OUTCOMES: { value: DayOutcome; label: string; hint: string }[] = [
  { value: 'stayed_on_plan', label: 'Stayed on plan', hint: 'A successful day' },
  { value: 'lapse', label: 'Lapse', hint: 'Progress is preserved' },
  { value: 'partial', label: 'Partial reduction / exceeded target', hint: 'A mixed day' },
  { value: 'no_data', label: 'No data / unsure', hint: 'Neither success nor lapse' },
  { value: 'note_only', label: 'Add note only', hint: 'Keep the inferred outcome' },
];
const HABIT_OUTCOMES: { value: DayOutcome; label: string; hint: string }[] = [
  { value: 'stayed_on_plan', label: 'Completed', hint: 'Log progress for this date' },
  { value: 'no_data', label: 'No completion recorded', hint: 'Do not count this day' },
  { value: 'note_only', label: 'Note only', hint: 'Keep context without a completion' },
];

const STATE_COLORS: Record<DayOutcome, string> = {
  stayed_on_plan: colors.success,
  lapse: colors.textMuted,
  partial: colors.nicotine,
  no_data: colors.textDim,
  note_only: colors.caffeine,
};

export default function HistoryScreen() {
  const params = useLocalSearchParams<{ id?: TrackerId }>();
  const {
    trackers,
    historicalEntries = [],
    taperSteps = [],
    saveHistoricalEntry,
    deleteHistoricalEntry,
  } = useTrackers();
  const initialId = trackers.some((tracker) => tracker.id === params.id)
    ? params.id!
    : trackers[0].id;
  const [trackerId, setTrackerId] = useState<TrackerId>(initialId);
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<HistoricalEntry | null>(null);
  const [outcome, setOutcome] = useState<DayOutcome>('stayed_on_plan');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const tracker = trackers.find((item) => item.id === trackerId)!;
  const positive = tracker.mode === 'habit';
  const labelFor = (entry: HistoricalEntry) => positive ? entry.outcome === 'stayed_on_plan' ? `${entry.value ?? 1} completion${(entry.value ?? 1) === 1 ? '' : 's'}` : entry.outcome === 'no_data' ? 'No completion recorded' : entry.outcome === 'note_only' ? 'Note only' : outcomeLabel(entry.outcome) : outcomeLabel(entry.outcome);
  const quitPhase = taperQuitPhase(tracker, taperSteps);
  const entries = useMemo(
    () => historicalEntries
      .filter((entry) => entry.trackerId === trackerId)
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    [historicalEntries, trackerId],
  );
  const entryByDate = useMemo(
    () => new Map(entries.map((entry) => [entry.eventDate, entry])),
    [entries],
  );
  const days = calendarDays(month, positive);
  const todayKey = localDateKey();
  const completeness = historyCompleteness(quitPhase?.startedAt ?? tracker.startedAt, entries);

  const openDate = (date: string) => {
    if (date > todayKey) return;
    const existing = entryByDate.get(date) ?? null;
    setSelectedDate(date);
    setEditing(existing);
    setOutcome(existing?.outcome ?? 'stayed_on_plan');
    setNote(existing?.note ?? '');
    setAmount(existing?.value?.toString() ?? '');
  };
  const closeEditor = () => {
    setSelectedDate(null);
    setEditing(null);
    setNote('');
    setAmount('');
    setDeleteConfirmOpen(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>HABIT HISTORY</Text>
        <Text style={styles.title}>Your days, recorded{'\n'}without judgment.</Text>
        <Text style={styles.subtitle}>
          Add or correct any past day. Backfilled entries update this habit’s history and trends.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackerTabs}>
          {trackers.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => setTrackerId(item.id)}
              style={[styles.trackerTab, trackerId === item.id && styles.trackerTabActive]}>
              <View style={[styles.trackerDot, { backgroundColor: item.color }]} />
              <Text style={[styles.trackerTabText, trackerId === item.id && styles.trackerTabTextActive]}>
                {item.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{completeness}%</Text>
            <Text style={styles.metricLabel}>HISTORY COMPLETENESS</Text>
            <Text style={styles.metricHint}>Days with explicit entries</Text>
          </View>
        </View>

        <View style={styles.calendar}>
          <View style={styles.monthHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} style={styles.monthButton}>
              <Icon name="chevronLeft" size={20} color={colors.textMuted} />
            </Pressable>
            <Text style={styles.monthTitle}>
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              disabled={isCurrentMonth(month)}
              onPress={() => setMonth(shiftMonth(month, 1))}
              style={[styles.monthButton, isCurrentMonth(month) && styles.disabled]}>
              <Icon name="chevronRight" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {(positive ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekDay}>{day}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {days.map((date, index) => {
              if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const key = localDateKey(date);
              const entry = entryByDate.get(key);
              const future = key > todayKey;
              const todayPending = key === todayKey && !entry;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatLongDate(key)}, ${entry ? labelFor(entry) : future ? 'Future date' : todayPending ? 'Today pending' : 'Unrecorded'}`}
                  disabled={future}
                  onPress={() => openDate(key)}
                  style={[styles.dayCell, todayPending && styles.todayCell, future && styles.futureCell]}>
                  <Text style={[styles.dayNumber, future && styles.futureText]}>{date.getDate()}</Text>
                  {entry ? (
                    <View style={[styles.stateDot, {
                      backgroundColor: entry.outcome === 'no_data' ? 'transparent' : STATE_COLORS[entry.outcome],
                      borderColor: STATE_COLORS[entry.outcome],
                    }]} />
                  ) : (
                    <View style={[styles.unrecordedDot, todayPending && styles.pendingDot]} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            {(positive ? [
              ['Completed', colors.success, false],
              ['No completion', colors.textDim, true],
              ['Unrecorded', colors.border, true],
              ['Today pending', colors.accent, true],
            ] : [
              ['Stayed on plan', colors.success, false],
              ['Lapse', colors.textMuted, false],
              ['Partial reduction', colors.nicotine, false],
              ['No data', colors.textDim, true],
              ['Unrecorded', colors.border, true],
              ['Today pending', colors.accent, true],
            ]).map(([label, color, hollow]) => (
              <View key={String(label)} style={styles.legendItem}>
                <View style={[styles.legendDot, {
                  backgroundColor: hollow ? 'transparent' : String(color),
                  borderColor: String(color),
                }]} />
                <Text style={styles.legendText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.recentPanel}>
          <Text style={styles.panelEyebrow}>ENTRY HISTORY</Text>
          {entries.length === 0 ? (
            <Text style={styles.emptyText}>No entries yet. Tap any past date to add one.</Text>
          ) : <HistoryPages key={trackerId} items={entries}>{(page) => page.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              onPress={() => openDate(entry.eventDate)}
              style={styles.entryRow}>
              <View style={[styles.entryMark, { borderColor: STATE_COLORS[entry.outcome] }]} />
              <View style={styles.entryCopy}>
                <Text style={styles.entryTitle}>{labelFor(entry)}</Text>
                <Text style={styles.entryMeta}>
                  {formatLongDate(entry.eventDate)}
                  {isBackfilled(entry) ? ` · Recorded ${formatRecorded(entry.recordedAt)}` : ''}
                </Text>
                {entry.note && <Text style={styles.entryNote}>{entry.note}</Text>}
              </View>
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          ))}</HistoryPages>}
        </View>

        <Text style={styles.footer}>Entries stay private on this device.</Text>
      </ScrollView>

      <Modal visible={Boolean(selectedDate)} transparent animationType="fade" onRequestClose={closeEditor}>
        <View style={styles.backdrop}>
          <KeyboardSafeScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalCard}>
              <Text style={styles.panelEyebrow}>{editing ? 'EDIT DAY' : 'BACKFILL DAY'}</Text>
              <Text style={styles.modalTitle}>{selectedDate ? formatLongDate(selectedDate) : ''}</Text>
              <Text style={styles.modalBody}>{positive ? 'Correct or backfill this day’s habit progress.' : 'Choose the outcome that best reflects the day. No judgment, just useful history.'}</Text>
              {editing && isBackfilled(editing) && (
                <Text style={styles.recordedText}>Recorded {formatRecorded(editing.recordedAt)}</Text>
              )}

              <View style={styles.outcomeList}>
                {(positive ? HABIT_OUTCOMES : OUTCOMES).map((item) => (
                  <Pressable
                    key={item.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: outcome === item.value }}
                    onPress={() => setOutcome(item.value)}
                    style={[styles.outcomeButton, outcome === item.value && styles.outcomeButtonActive]}>
                    <View style={[styles.outcomeRadio, outcome === item.value && { borderColor: tracker.color }]}>
                      {outcome === item.value && <View style={[styles.outcomeRadioFill, { backgroundColor: tracker.color }]} />}
                    </View>
                    <View style={styles.outcomeCopy}>
                      <Text style={styles.outcomeTitle}>{item.label}</Text>
                      <Text style={styles.outcomeHint}>{item.hint}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>

              {positive && outcome === 'stayed_on_plan' && <><Text style={styles.noteLabel}>COMPLETIONS</Text><TextInput accessibilityLabel="Habit completions" keyboardType="number-pad" value={amount} onChangeText={setAmount} placeholder="1" placeholderTextColor={colors.textDim} style={styles.amountInput} /></>}

              <Text style={styles.noteLabel}>NOTE · OPTIONAL</Text>
              <TextInput
                accessibilityLabel="Historical entry note"
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Add context you may want later"
                placeholderTextColor={colors.textDim}
                style={styles.noteInput}
              />

              {tracker.mode === 'reduction' && !quitPhase && (
                <>
                  <Text style={styles.noteLabel}>AMOUNT · {tracker.unit?.toUpperCase()}</Text>
                  <TextInput accessibilityLabel="Historical amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="Optional amount" placeholderTextColor={colors.textDim} style={styles.amountInput} />
                </>
              )}

              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" onPress={closeEditor} style={styles.cancelButton}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (!selectedDate) return;
                    const habitCount = amount.trim() ? Number(amount) : 1;
                    if (positive && outcome === 'stayed_on_plan' && (!Number.isInteger(habitCount) || habitCount < 1)) { Alert.alert('Enter a valid count', 'Completions must be a whole number of at least one.'); return; }
                    saveHistoricalEntry({
                      id: editing?.id,
                      trackerId,
                      eventDate: selectedDate,
                      outcome,
                      note,
                      value: positive ? outcome === 'stayed_on_plan' ? habitCount : 0 : amount.trim() && Number.isFinite(Number(amount)) ? Number(amount) : undefined,
                    });
                    closeEditor();
                  }}
                  style={styles.saveButton}>
                  <Text style={styles.saveText}>{editing ? 'Save changes' : 'Save entry'}</Text>
                </Pressable>
              </View>

              {editing && (
                <Pressable accessibilityRole="button" onPress={() => setDeleteConfirmOpen(true)} style={styles.removeButton}>
                  <Text style={styles.removeText}>Remove this entry</Text>
                </Pressable>
              )}
            </View>
          </KeyboardSafeScrollView>
        </View>
      </Modal>

      <Modal visible={deleteConfirmOpen} transparent animationType="fade" onRequestClose={() => setDeleteConfirmOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.panelEyebrow}>REMOVE ENTRY</Text>
            <Text style={styles.modalTitle}>Remove this historical entry?</Text>
            <Text style={styles.modalBody}>Recovery totals and charts will recalculate. No other tracker history will be changed.</Text>
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setDeleteConfirmOpen(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Keep entry</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (editing) deleteHistoricalEntry(editing.id);
                  closeEditor();
                }}
                style={styles.confirmRemoveButton}>
                <Text style={styles.confirmRemoveText}>Remove entry</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function calendarDays(month: Date, mondayFirst = false) {
  const leading = mondayFirst ? (month.getDay() + 6) % 7 : month.getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: count }, (_, index) =>
      new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];
}

function shiftMonth(month: Date, amount: number) {
  return new Date(month.getFullYear(), month.getMonth() + amount, 1);
}

function isCurrentMonth(month: Date) {
  const today = new Date();
  return month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
}

function formatLongDate(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatRecorded(timestamp: string) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, paddingBottom: 42 },
  eyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: font.semibold, marginTop: 12 },
  title: { color: colors.text, fontSize: 31, lineHeight: 36, letterSpacing: -0.7, fontFamily: font.bold, marginTop: 8 },
  subtitle: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 20, marginTop: 10 },
  trackerTabs: { gap: 8, paddingVertical: 22 },
  trackerTab: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 9 },
  trackerTabActive: { backgroundColor: colors.surfaceRaised },
  trackerDot: { width: 7, height: 7, borderRadius: 4 },
  trackerTabText: { color: colors.textDim, fontSize: 11, fontFamily: font.bold },
  trackerTabTextActive: { color: colors.text },
  metricRow: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, paddingVertical: 18 },
  metric: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  metricDivider: { width: 1, backgroundColor: colors.border },
  metricValue: { color: colors.text, fontSize: 24, fontFamily: font.semibold },
  metricLabel: { color: colors.textMuted, fontSize: 11, letterSpacing: 1, fontFamily: font.semibold, textAlign: 'center', marginTop: 5 },
  metricHint: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, textAlign: 'center', marginTop: 4 },
  calendar: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.md, marginTop: 14 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3, marginBottom: 14 },
  monthButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  monthButtonText: { color: colors.text, fontSize: 24 , fontFamily: font.regular},
  monthTitle: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  disabled: { opacity: 0.3 },
  weekRow: { flexDirection: 'row' },
  weekDay: { width: '14.2857%', color: colors.textDim, fontSize: 11, fontFamily: font.semibold, textAlign: 'center', paddingBottom: 7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', aspectRatio: 0.9, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  todayCell: { borderWidth: 1, borderColor: colors.accentSoft },
  futureCell: { opacity: 0.35 },
  dayNumber: { color: colors.text, fontSize: 12, fontFamily: font.bold },
  futureText: { color: colors.textDim },
  stateDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1, marginTop: 5 },
  unrecordedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 6 },
  pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 13 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1 },
  legendText: { color: colors.textDim, fontSize: 11 , fontFamily: font.regular},
  recentPanel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 14 },
  panelEyebrow: { color: colors.textDim, fontSize: 11, letterSpacing: 1.2, fontFamily: font.semibold },
  emptyText: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 14 },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  entryMark: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, marginRight: 11 },
  entryCopy: { flex: 1 },
  entryTitle: { color: colors.text, fontSize: 12, fontFamily: font.bold },
  entryMeta: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, marginTop: 4 },
  entryNote: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 4 },
  editText: { color: colors.textDim, fontSize: 11, fontFamily: font.bold, marginLeft: 8 },
  footer: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, textAlign: 'center', marginTop: 26 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', justifyContent: 'center', padding: spacing.lg },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg },
  confirmCard: { width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg },
  modalTitle: { color: colors.text, fontSize: 22, fontFamily: font.semibold, marginTop: 8 },
  modalBody: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 19, marginTop: 7 },
  recordedText: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, marginTop: 8 },
  outcomeList: { gap: 7, marginTop: 18 },
  outcomeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 11 },
  outcomeButtonActive: { borderColor: '#2A4A3A' },
  outcomeRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.textDim, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  outcomeRadioFill: { width: 8, height: 8, borderRadius: 4 },
  outcomeCopy: { flex: 1 },
  outcomeTitle: { color: colors.text, fontSize: 12, fontFamily: font.bold },
  outcomeHint: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, marginTop: 2 },
  noteLabel: { color: colors.textDim, fontSize: 11, letterSpacing: 1.2, fontFamily: font.semibold, marginTop: 18, marginBottom: 7 },
  noteInput: { minHeight: 70, color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 11, textAlignVertical: 'top' },
  amountInput: { minHeight: 46, color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 11 },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 20 },
  cancelButton: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 13, alignItems: 'center', paddingVertical: 13 },
  cancelText: { color: colors.text, fontSize: 12, fontFamily: font.bold },
  saveButton: { flex: 1, backgroundColor: colors.accent, borderRadius: 13, alignItems: 'center', paddingVertical: 13 },
  saveText: { color: colors.background, fontSize: 12, fontFamily: font.semibold },
  removeButton: { alignItems: 'center', paddingTop: 17 },
  removeText: { color: colors.danger, fontSize: 11, fontFamily: font.bold },
  confirmRemoveButton: { flex: 1, backgroundColor: colors.danger, borderRadius: 13, alignItems: 'center', paddingVertical: 13 },
  confirmRemoveText: { color: colors.background, fontSize: 12, fontFamily: font.semibold },
});
