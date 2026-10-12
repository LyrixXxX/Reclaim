import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LapseModal } from '@/components/lapse-modal';
import { DurationProgress } from '@/components/duration-progress';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { RecoveryChart } from '@/components/recovery-chart';
import { RollingRangeControls } from '@/components/rolling-range-controls';
import { HabitDetail } from '@/components/habit-detail';
import { WaterHabitDetail } from '@/components/water-habit-detail';
import { GoodHabitTemplateDetail } from '@/components/good-habit-template-detail';
import { HabitMilestoneShowcase } from '@/components/habit-milestone-showcase';
import { HabitSavingsPanel } from '@/components/habit-savings-panel';
import { TaperDetail } from '@/components/taper-detail';
import { useNow } from '@/hooks/use-now';
import { elapsedParts, localDateKey, nextCheckpoint } from '@/lib/progress';
import { formatLocalStartDateTime } from '@/lib/date-format';
import { completedCalendarDays, DEFAULT_QUIT_CHECKPOINT_DAYS, formatTaperQuitStart, roundedNextCheckpoint, taperQuitPhase } from '@/lib/taper-quit';
import {
  currentStreakFromEntries,
  recoverySeriesFromEntries,
  recoveryStats,
} from '@/lib/recovery';
import { isBackfilled } from '@/lib/history';
import { RollingRange, rollingBounds } from '@/lib/rolling-range';
import { habitMilestones } from '@/lib/habit-milestones';
import { HistoricalEntry } from '@/models/tracker';
import { findTracker, useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';


export default function TrackerDetailScreen() {
  const { id, view, editStep } = useLocalSearchParams<{ id: string; view?: string; editStep?: string }>();
  const navigation = useNavigation();
  const now = useNow();
  const {
    trackers,
    historicalEntries = [],
    waterLogs = [],
    goodHabitLogs = [],
    activityRoutes = [],
    nutritionEntries = [],
    taperSteps = [],
    addLapse,
    updateLapse,
    removeLapse,
    changeStartDate,
    deleteHistory,
    saveHistoricalEntry,
    addReductionStep,
    editReductionStep,
    insertHistoricalReductionStep,
    deleteReductionStep,
  } = useTrackers();
  const tracker = findTracker(trackers, id);
  const trackerSteps = useMemo(() => taperSteps.filter((step) => step.trackerId === tracker?.id), [taperSteps, tracker?.id]);
  const quitPhase = tracker ? taperQuitPhase(tracker, trackerSteps) : undefined;
  const recoveryStartedAt = quitPhase?.startedAt ?? tracker?.startedAt;
  const [range, setRange] = useState<RollingRange>('30D');
  const [offset, setOffset] = useState(0);
  const [lapseOpen, setLapseOpen] = useState(false);
  const [editingLapse, setEditingLapse] = useState<HistoricalEntry | null>(null);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (tracker) navigation.setOptions({ title: tracker.name });
  }, [navigation, tracker]);

  const trackerEntries = useMemo(
    () => historicalEntries
      .filter((event) => event.trackerId === tracker?.id)
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    [historicalEntries, tracker?.id],
  );
  const recoveryStartDate = recoveryStartedAt ? localDateKey(new Date(recoveryStartedAt)) : undefined;
  const trackerLapses = trackerEntries.filter((entry) => entry.outcome === 'lapse'
    && (!recoveryStartDate || entry.eventDate >= recoveryStartDate));
  const allPoints = recoveryStartedAt
    ? recoverySeriesFromEntries(recoveryStartedAt, trackerEntries, new Date(now))
    : [];

  if (!tracker) {
    return <View style={styles.center}><Text style={styles.muted}>Tracker not found.</Text></View>;
  }

  if (tracker.mode === 'habit') {
    if (tracker.habitTemplate === 'water') return <WaterHabitDetail tracker={tracker} logs={waterLogs.filter((log) => log.trackerId === tracker.id)} />;
    if (tracker.habitTemplate) return <GoodHabitTemplateDetail tracker={tracker} logs={goodHabitLogs} routes={activityRoutes} foods={nutritionEntries} />;
    return <HabitDetail tracker={tracker} entries={trackerEntries} saveEntry={saveHistoricalEntry} />;
  }

  if (tracker.mode === 'reduction' && (!quitPhase || view === 'taper')) {
    return <TaperDetail tracker={tracker} steps={trackerSteps} entries={trackerEntries} addStep={addReductionStep} insertHistoricalStep={insertHistoricalReductionStep} editStep={editReductionStep} deleteStep={deleteReductionStep} initialEditStepId={editStep} />;
  }

  const stats = recoveryStats(allPoints);
  const streakStart = recoveryStartedAt
    ? currentStreakFromEntries(recoveryStartedAt, trackerEntries, new Date(now))
    : new Date(now).toISOString();
  const streak = elapsedParts(streakStart, now);
  const exactTimer = !quitPhase || quitPhase.exact;
  const roundedDays = completedCalendarDays(streakStart, new Date(now));
  const checkpointDays = tracker.checkpointDays ?? DEFAULT_QUIT_CHECKPOINT_DAYS;
  const checkpoint = exactTimer ? nextCheckpoint(streakStart, checkpointDays, now) : roundedNextCheckpoint(streakStart, checkpointDays, new Date(now));
  const bounds = rollingBounds(range, offset, new Date(now));
  const visiblePoints = allPoints.filter((point) => point.date >= bounds.start && point.date <= bounds.end);
  const validStartDate = /^\d{4}-\d{2}-\d{2}$/.test(startDateDraft)
    && startDateDraft <= localDateKey();

  const openStartDate = () => {
    setStartDateDraft(tracker.startedAt ? localDateKey(new Date(tracker.startedAt)) : localDateKey());
    setStartDateOpen(true);
  };
  const closeLapse = () => {
    setLapseOpen(false);
    setEditingLapse(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.abstinenceContent} showsVerticalScrollIndicator={false}>
        <TrackerHero tracker={tracker} subtitle={quitPhase ? 'The taper is preserved. Recovery begins with the zero-dose step, and a difficult day never erases earlier progress.' : 'Recovery is cumulative. A difficult day never erases earlier progress.'} />
        <Link href={{ pathname: '/tracker-form', params: { id: tracker.id } }} style={styles.editTrackerLink}>Edit tracker</Link>

        <View style={styles.timerPanel}>
          <Text style={styles.panelLabel}>{exactTimer ? 'CURRENT LIVE STREAK' : 'CURRENT QUIT DURATION'}</Text>
          {recoveryStartedAt && (
            <Text style={styles.detailStartDate}>
              {quitPhase ? formatTaperQuitStart(quitPhase) : `Abstinence started ${formatLocalStartDateTime(recoveryStartedAt)}`}
            </Text>
          )}
          <View style={styles.timerRow}>
            <Text style={styles.timerDays}>{exactTimer ? streak.days : roundedDays}</Text>
            <Text style={styles.timerUnit}>days</Text>
            {exactTimer ? <Text style={styles.timerClock}>{String(streak.hours).padStart(2, '0')}:{String(streak.minutes).padStart(2, '0')}:{String(streak.seconds).padStart(2, '0')}</Text> : <Text style={styles.roundedTimer}>ROUNDED TO CALENDAR DAYS</Text>}
          </View>
          {exactTimer && <DurationProgress startedAt={streakStart} now={now} color={tracker.color} />}
          <View style={styles.checkpointRow}>
            <View>
              <Text style={styles.microLabel}>NEXT CHECKPOINT</Text>
              <Text style={styles.checkpointTitle}>{checkpoint.targetDays} days</Text>
            </View>
            <Text style={styles.checkpointValue}>{checkpoint.remainingDays}d{exactTimer ? ` ${checkpoint.remainingHours}h` : ' · rounded'}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat value={stats.successfulDays} label="SUCCESSFUL" />
          <View style={styles.statDivider} />
          <Stat value={stats.totalTrackedDays} label="TRACKED" />
          <View style={styles.statDivider} />
          <Stat value={`${stats.successPercentage}%`} label="SUCCESS" />
        </View>

        <HabitMilestoneShowcase awards={habitMilestones(tracker, trackerEntries, recoveryStartedAt, new Date(now))} />
        <HabitSavingsPanel tracker={tracker} quitAt={recoveryStartedAt} now={now} />

        <View style={styles.chartPanel}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>CUMULATIVE RECOVERY</Text>
              <Text style={styles.sectionTitle}>Progress preserved</Text>
            </View>
            <Text style={[styles.totalBadge, { color: tracker.color }]}>
              {stats.successfulDays} days
            </Text>
          </View>
          <View style={{ width: '100%', marginTop: 18, marginBottom: 10 }}><RollingRangeControls range={range} onRange={setRange} offset={offset} onOffset={setOffset} start={range === 'ALL' ? allPoints[0]?.date ?? bounds.end : bounds.start} end={bounds.end} accent={tracker.color} /></View>
          <RecoveryChart points={visiblePoints} color={tracker.color} />
          <View style={styles.legend}>
            <View style={[styles.legendLine, { backgroundColor: tracker.color }]} />
            <Text style={styles.legendText}>Cumulative successful days</Text>
            <View style={[styles.legendDot, { borderColor: tracker.color }]} />
            <Text style={styles.legendText}>Lapse</Text>
          </View>
        </View>

        {quitPhase && <View style={styles.taperJourneyPanel}><Text style={styles.sectionEyebrow}>TAPER JOURNEY PRESERVED</Text><Text style={styles.taperJourneyTitle}>{tracker.baseline ?? trackerSteps[0]?.amount ?? 0} → 0 {quitPhase.step.unit}</Text><Text style={styles.taperJourneyBody}>Original reduction start, all {trackerSteps.length} taper steps, notes, durations, and historical amounts remain available.</Text><Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id, view: 'taper' } }} asChild><Pressable accessibilityRole="button" style={styles.taperJourneyButton}><Text style={styles.taperJourneyButtonText}>Open taper timeline</Text></Pressable></Link></View>}

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLapseOpen(true)}
            disabled={!tracker.startedAt}
            style={[styles.primaryAction, !tracker.startedAt && styles.disabled]}>
            <Text style={styles.primaryActionText}>Log a lapse</Text>
          </Pressable>
          {quitPhase ? <Link href={{ pathname: '/tracker/[id]', params: { id: tracker.id, view: 'taper', editStep: quitPhase.step.id } }} asChild><Pressable accessibilityRole="button" style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Refine quit date</Text></Pressable></Link> : <Pressable accessibilityRole="button" onPress={openStartDate} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Change start date</Text></Pressable>}
        </View>

        <View style={styles.historyPanel}>
          <Text style={styles.sectionEyebrow}>RECENT HISTORY</Text>
          {trackerLapses.length === 0 ? (
            <Text style={styles.emptyHistory}>No lapse records. Successful days are inferred automatically.</Text>
          ) : (
            <>
              {trackerLapses.slice(0, 5).map((event) => (
                <Pressable
                  key={event.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setEditingLapse(event);
                    setLapseOpen(true);
                  }}
                  style={styles.historyRow}>
                  <View style={[styles.historyMark, { borderColor: tracker.color }]} />
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyTitle}>Lapse recorded — progress preserved</Text>
                    <Text style={styles.historyMeta}>
                      {formatHistoryDate(event.eventDate)}{event.note ? ` · ${event.note}` : ''}
                      {isBackfilled(event) ? ` · Recorded ${formatRecordedDate(event.recordedAt)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.historyEdit}>Edit</Text>
                </Pressable>
              ))}
            </>
          )}
        </View>

        <View style={styles.dangerArea}>
          <Text style={styles.dangerLabel}>DANGER AREA</Text>
          <Text style={styles.dangerTitle}>{quitPhase ? 'Clear recovery history' : 'Clear history, keep tracker'}</Text>
          <Text style={styles.dangerBody}>
            {quitPhase ? 'Remove recovery check-ins, lapse records, and charts. The tracker and its taper timeline stay in Habits.' : 'Remove the start date, entries, lapses, and charts. This tracker stays in Habits.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setDeleteOpen(true)} style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>Clear history only</Text>
          </Pressable>
          <Link href={{ pathname: '/tracker-form', params: { id: tracker.id, delete: '1' } }} style={styles.deleteTrackerLink}>Delete the entire tracker →</Link>
        </View>

        <Text style={styles.footerNote}>No account · No cloud sync · No medical guidance</Text>
      </ScrollView>

      <LapseModal
        key={editingLapse?.id ?? (lapseOpen ? 'new-open' : 'closed')}
        visible={lapseOpen}
        trackerId={tracker.id}
        startedAt={recoveryStartedAt}
        event={editingLapse}
        onClose={closeLapse}
        onSave={(date, note) => {
          if (editingLapse) {
            updateLapse({
              ...editingLapse,
              eventDate: date,
              recordedAt: new Date().toISOString(),
              note: note?.trim() || undefined,
            });
          } else {
            addLapse(tracker.id, date, note);
          }
          closeLapse();
        }}
        onDelete={editingLapse ? () => {
          removeLapse(editingLapse.id);
          closeLapse();
        } : undefined}
      />

      <Modal visible={startDateOpen} transparent animationType="fade" onRequestClose={() => setStartDateOpen(false)}>
        <KeyboardSafeScrollView contentContainerStyle={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionEyebrow}>CHANGE START DATE</Text>
            <Text style={styles.modalTitle}>When did this begin?</Text>
            <Text style={styles.modalBody}>Recovery totals will recalculate from this calendar date.</Text>
            <TextInput
              accessibilityLabel="Tracker start date"
              value={startDateDraft}
              onChangeText={setStartDateDraft}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textDim}
              style={styles.modalInput}
            />
            {!validStartDate && <Text style={styles.validationText}>Enter today or an earlier date.</Text>}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setStartDateOpen(false)} style={styles.modalSecondary}>
                <Text style={styles.secondaryActionText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!validStartDate}
                onPress={() => {
                  changeStartDate(tracker.id, startDateDraft);
                  setStartDateOpen(false);
                }}
                style={[styles.modalPrimary, !validStartDate && styles.disabled]}>
                <Text style={styles.primaryActionText}>Save date</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardSafeScrollView>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.dangerLabel}>PERMANENT DELETION</Text>
            <Text style={styles.modalTitle}>Clear history but keep {tracker.name}?</Text>
            <Text style={styles.modalBody}>
              {quitPhase ? 'Recovery check-ins, lapse records, and charts will be removed. The tracker and taper timeline will remain in Habits.' : 'The start date, entries, lapses, and charts will be removed. The tracker will remain in Habits without a running timer.'}
            </Text>
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setDeleteOpen(false)} style={styles.modalSecondary}>
                <Text style={styles.secondaryActionText}>Keep history</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  deleteHistory(tracker.id, true);
                  setDeleteOpen(false);
                }}
                style={styles.confirmDelete}>
                <Text style={styles.confirmDeleteText}>Clear history, keep tracker</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TrackerHero({
  tracker,
  subtitle,
}: {
  tracker: { icon: string; color: string; name: string };
  subtitle: string;
}) {
  return (
    <>
      <View style={[styles.heroIcon, { backgroundColor: `${tracker.color}1F` }]}>
        <Text style={[styles.heroIconText, { color: tracker.color }]}>{tracker.icon}</Text>
      </View>
      <Text style={styles.title}>{tracker.name}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatHistoryDate(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatRecordedDate(timestamp: string) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  abstinenceContent: {
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    alignItems: 'center',
    paddingBottom: 40,
  },
  reductionContent: {
    flexGrow: 1,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    alignItems: 'center',
  },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  heroIconText: { fontSize: 34, fontWeight: '800' },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 18 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 430 },
  panel: { width: '100%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 30, alignItems: 'center' },
  reductionChartPanel: { width: '100%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 14 },
  panelLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  value: { fontSize: 68, fontWeight: '900', marginTop: 12, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', gap: 12, marginTop: 20 },
  control: { width: 70, height: 48, borderRadius: 15, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  controlText: { color: colors.text, fontSize: 25, fontWeight: '600' },
  baseline: { color: colors.textDim, fontSize: 12, marginTop: 20 },
  historyLink: { marginTop: 18, paddingVertical: 7, paddingHorizontal: 12 },
  historyLinkText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  detailStartDate: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  note: { color: colors.textDim, fontSize: 11, marginTop: 24, marginBottom: 12 },
  editTrackerLink: { color: colors.habitsNav, backgroundColor: colors.surface, borderColor: colors.habitsNav, borderWidth: 1, borderRadius: 14, fontSize: 14, fontWeight: '800', paddingHorizontal: 20, paddingVertical: 12, marginTop: 12, overflow: 'hidden', textAlign: 'center', minWidth: 140 },
  timerPanel: {
    width: '100%',
    marginTop: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radius,
    padding: spacing.lg,
  },
  timerRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  timerDays: { color: colors.text, fontSize: 44, fontWeight: '800', letterSpacing: -1.4, fontVariant: ['tabular-nums'] },
  timerUnit: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginLeft: 7 },
  timerClock: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  roundedTimer: { color: colors.textDim, fontSize: 8, fontWeight: '900', letterSpacing: .8, marginLeft: 'auto' },
  checkpointRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 18, paddingTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  microLabel: { color: colors.textDim, fontSize: 8, letterSpacing: 1.2, fontWeight: '800' },
  checkpointTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  checkpointValue: { color: colors.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statsRow: { width: '100%', flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, marginTop: 14, paddingVertical: 17 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.textDim, fontSize: 8, letterSpacing: 1.1, fontWeight: '800', marginTop: 5 },
  statDivider: { width: 1, backgroundColor: colors.border },
  chartPanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, marginTop: 14, padding: spacing.lg },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionEyebrow: { color: colors.textDim, fontSize: 9, letterSpacing: 1.3, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 5 },
  totalBadge: { fontSize: 12, fontWeight: '800' },
  rangeRow: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 3, marginTop: 18, marginBottom: 10 },
  rangeButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  rangeButtonActive: { backgroundColor: colors.border },
  rangeText: { color: colors.textDim, fontSize: 10, fontWeight: '700' },
  rangeTextActive: { color: colors.text },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  legendLine: { width: 18, height: 2, borderRadius: 2 },
  legendDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, marginLeft: 9 },
  legendText: { color: colors.textDim, fontSize: 9 },
  taperJourneyPanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, marginTop: 14, padding: spacing.lg },
  taperJourneyTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 7 },
  taperJourneyBody: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  taperJourneyButton: { alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingVertical: 12, marginTop: 13 },
  taperJourneyButtonText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  actionRow: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryAction: { flex: 1, backgroundColor: colors.accent, borderRadius: 14, alignItems: 'center', paddingVertical: 15 },
  primaryActionText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  secondaryAction: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', paddingVertical: 15 },
  secondaryActionText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  historyPanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 28 },
  emptyHistory: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyMark: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, marginRight: 12 },
  checkInMark: { width: 8, height: 8, borderRadius: 4, marginRight: 14 },
  historyCopy: { flex: 1 },
  historyTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  historyMeta: { color: colors.textDim, fontSize: 10, marginTop: 4 },
  historyEdit: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginLeft: 10 },
  dangerArea: { width: '100%', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 34, paddingTop: 24 },
  dangerLabel: { color: colors.danger, fontSize: 9, letterSpacing: 1.3, fontWeight: '800' },
  dangerTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 6 },
  dangerBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  dangerButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#5C302E', borderRadius: 13, paddingHorizontal: 16, paddingVertical: 12, marginTop: 14 },
  dangerButtonText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  deleteTrackerLink: { color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 16, paddingVertical: 8 },
  footerNote: { color: colors.textDim, fontSize: 11, marginTop: 34 },
  modalBackdrop: { flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg },
  modalTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 8 },
  modalBody: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 9 },
  modalInput: { color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 13, height: 48, paddingHorizontal: 13, marginTop: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
  validationText: { color: colors.danger, fontSize: 10, marginTop: 7 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  modalSecondary: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 13, alignItems: 'center', paddingVertical: 14 },
  modalPrimary: { flex: 1, backgroundColor: colors.accent, borderRadius: 13, alignItems: 'center', paddingVertical: 14 },
  confirmDelete: { flex: 1, backgroundColor: colors.danger, borderRadius: 13, alignItems: 'center', paddingVertical: 14 },
  confirmDeleteText: { color: colors.background, fontSize: 12, fontWeight: '800' },
});
