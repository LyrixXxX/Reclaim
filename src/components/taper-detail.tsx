import { HistoryPages } from '@/components/history-pages';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DurationProgress } from '@/components/duration-progress';
import { TaperStepModal } from '@/components/taper-step-modal';
import { ValueChart } from '@/components/value-chart';
import { useNow } from '@/hooks/use-now';
import { formatLocalStartDate } from '@/lib/date-format';
import {
  addTaperStep,
  deleteTaperStep,
  editTaperStep,
  formatStepStart,
  generateStepId,
  insertHistoricalTaperStep,
  stepDuration,
  taperReductionPercent,
  TaperStepInput,
} from '@/lib/taper';
import { trackerDisplayName } from '@/lib/tracker-management';
import { HistoricalEntry, TaperStep, Tracker, TrackerState } from '@/models/tracker';
import { colors, layout, spacing } from '@/theme';

export function TaperDetail({
  tracker,
  steps,
  entries,
  addStep,
  editStep,
  insertHistoricalStep,
  deleteStep,
  initialEditStepId,
}: {
  tracker: Tracker;
  steps: TaperStep[];
  entries: HistoricalEntry[];
  addStep: (trackerId: string, input: TaperStepInput, stepId: string) => void;
  editStep: (stepId: string, input: TaperStepInput) => void;
  insertHistoricalStep: (trackerId: string, input: TaperStepInput, stepId: string) => void;
  deleteStep: (stepId: string, confirmed: boolean) => void;
  initialEditStepId?: string;
}) {
  const now = useNow();
  const initialStep = steps.find((step) => step.id === initialEditStepId) ?? null;
  const [modalOpen, setModalOpen] = useState(Boolean(initialStep));
  const [editing, setEditing] = useState<TaperStep | null>(initialStep);
  const [historical, setHistorical] = useState(false);
  const [deleting, setDeleting] = useState<TaperStep | null>(null);
  const [formError, setFormError] = useState('');
  const ordered = useMemo(() => [...steps].sort((a, b) => {
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return Date.parse(a.startedAt) - Date.parse(b.startedAt);
  }), [steps]);
  const current = steps.find((step) => step.status === 'current');
  const baseline = tracker.baseline ?? ordered[0]?.amount ?? 0;
  const currentAmount = current?.amount ?? tracker.current ?? baseline;
  const reduction = taperReductionPercent(baseline, currentAmount);
  const overallDuration = stepDuration(tracker.startedAt, undefined, now);
  const currentDuration = stepDuration(current?.startedAt, undefined, now);
  const previewState: TrackerState = { trackers: [tracker], checkIns: [], taperSteps: steps };

  const close = () => { setModalOpen(false); setEditing(null); setHistorical(false); setFormError(''); };
  const save = (input: TaperStepInput) => {
    if (editing) {
      const result = editTaperStep(previewState, editing.id, input);
      if (result.error) return setFormError(result.error);
      editStep(editing.id, input);
    } else if (historical) {
      const id = generateStepId(tracker.id);
      const result = insertHistoricalTaperStep(previewState, tracker.id, input, id);
      if (result.error) return setFormError(result.error);
      insertHistoricalStep(tracker.id, input, id);
    } else {
      const id = generateStepId(tracker.id);
      const result = addTaperStep(previewState, tracker.id, input, id);
      if (result.error) return setFormError(result.error);
      addStep(tracker.id, input, id);
    }
    close();
  };

  return <SafeAreaView style={styles.safe} edges={['bottom']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.heroIcon, { backgroundColor: `${tracker.color}1F` }]}><Text style={[styles.heroIconText, { color: tracker.color }]}>{tracker.icon}</Text></View>
      <Text style={styles.title}>{trackerDisplayName(tracker)}</Text>
      <Text style={styles.subtitle}>Every reduction is preserved as part of the journey.</Text>
      <Link href={{ pathname: '/tracker-form', params: { id: tracker.id } }} asChild>
        <Pressable accessibilityRole="button" style={styles.editLink}><Text style={styles.editLinkText}>Edit tracker and overall start</Text></Pressable>
      </Link>

      <View style={styles.summary}>
        <Text style={styles.eyebrow}>ORIGINAL JOURNEY</Text>
        <Text style={styles.overallStarted}>{tracker.startedAt ? `Overall taper started ${formatLocalStartDate(tracker.startedAt)}` : 'Overall taper start not recorded'}</Text>
        <View style={styles.amountJourney}><Text style={styles.journeyAmount}>{baseline} {tracker.unit}</Text><Text style={styles.arrow}>→</Text><Text style={[styles.journeyAmount, { color: tracker.color }]}>{currentAmount} {current?.unit ?? tracker.unit}</Text></View>
        <Text style={[styles.reduction, { color: tracker.color }]}>{reduction}% reduction</Text>
        <View style={styles.summaryStats}>
          <View style={styles.summaryStat}><Text style={styles.statValue}>{overallDuration ? conciseDuration(overallDuration) : '—'}</Text><Text style={styles.statLabel}>TOTAL JOURNEY</Text></View>
          <View style={styles.divider} />
          <View style={styles.summaryStat}><Text style={styles.statValue}>{currentDuration ? conciseDuration(currentDuration) : '—'}</Text><Text style={styles.statLabel}>CURRENT STEP</Text></View>
        </View>
      </View>

      <View style={styles.currentPanel}>
        <View style={styles.currentHeader}><View><Text style={styles.eyebrow}>CURRENT STEP</Text><Text style={styles.currentAmount}>{currentAmount} {current?.unit ?? tracker.unit}</Text></View><Text style={[styles.currentBadge, { color: tracker.color }]}>ACTIVE</Text></View>
        {current ? <Text style={styles.startLabel}>{formatStepStart(current)}</Text> : <Text style={styles.startLabel}>No current step recorded</Text>}
        {currentDuration ? <View style={styles.timerBlock}><View style={styles.largeDuration}><Text style={styles.largeNumber}>{currentDuration.years}</Text><Text style={styles.largeUnit}>y</Text><Text style={styles.largeNumber}>{currentDuration.months}</Text><Text style={styles.largeUnit}>mo</Text><Text style={styles.largeNumber}>{currentDuration.days}</Text><Text style={styles.largeUnit}>d</Text></View><Text style={styles.clock}>{String(currentDuration.hours).padStart(2, '0')}:{String(currentDuration.minutes).padStart(2, '0')}:{String(currentDuration.seconds).padStart(2, '0')}</Text></View> : <Text style={styles.timerUnavailable}>Set a current-step date to begin the live timer.</Text>}
        {current?.startedAt && <DurationProgress startedAt={current.startedAt} now={now} color={tracker.color} />}
      </View>

      <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setModalOpen(true); }} style={styles.addButton}><Text style={styles.addText}>+ Add reduction step</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setHistorical(true); setModalOpen(true); }} style={styles.historicalButton}><Text style={styles.historicalButtonText}>+ Add past reduction step</Text></Pressable>

      <View style={styles.timelinePanel}>
        <Text style={styles.eyebrow}>TAPER TIMELINE</Text><Text style={styles.sectionTitle}>Every step, preserved</Text>
        <HistoryPages key={tracker.id} items={[...ordered].reverse()}>{(page) => page.map((step) => {
          const index = ordered.indexOf(step);
          const duration = stepDuration(step.startedAt, step.endedAt, now);
          const stepReduction = taperReductionPercent(baseline, step.amount);
          return <View key={step.id} style={styles.stepRow}>
            <View style={styles.timelineRail}><View style={[styles.timelineDot, { borderColor: tracker.color, backgroundColor: step.status === 'current' ? tracker.color : colors.surface }]} />{step !== page.at(-1) && <View style={styles.timelineLine} />}</View>
            <View style={styles.stepCard}><View style={styles.stepHeader}><Text style={styles.stepLabel}>{index === 0 ? 'INITIAL BASELINE' : step.status === 'current' ? 'CURRENT STEP' : `STEP ${index + 1}`}</Text><View style={styles.stepActions}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${step.amount} ${step.unit} step`} onPress={() => { setEditing(step); setModalOpen(true); }} hitSlop={8}><Text style={styles.editText}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${step.amount} ${step.unit} step`} onPress={() => setDeleting(step)} hitSlop={8}><Text style={styles.deleteText}>Delete</Text></Pressable></View></View><Text style={styles.stepAmount}>{step.amount} {step.unit}</Text><Text style={styles.stepDate}>{formatTimelineDate(step)}</Text>{duration && step.endedAt && <Text style={styles.stepDuration}>{fullDuration(duration)} completed</Text>}<Text style={styles.stepReduction}>{stepReduction}% reduction from baseline</Text>{step.note && <Text style={styles.stepNote}>{step.note}</Text>}</View>
          </View>;
        })}</HistoryPages>
      </View>

      <View style={styles.historyChart}><Text style={styles.eyebrow}>RECORDED AMOUNTS</Text><Text style={styles.sectionTitle}>Amounts over time</Text><ValueChart entries={entries} color={tracker.color} unit={tracker.unit} /></View>
      <Link href={{ pathname: '/history', params: { id: tracker.id } }} asChild>
        <Pressable accessibilityRole="button" style={styles.historyLink}><Text style={styles.historyLinkText}>Open reduction check-in history</Text></Pressable>
      </Link>
      {tracker.notes && <View style={styles.notes}><Text style={styles.eyebrow}>PRIVATE NOTES</Text><Text style={styles.notesText}>{tracker.notes}</Text></View>}
      <Text style={styles.footer}>No account · No cloud sync · No medical guidance</Text>
    </ScrollView>
    <TaperStepModal key={editing?.id ?? (modalOpen ? historical ? 'history-open' : 'new-open' : 'closed')} visible={modalOpen} step={editing} historical={historical} defaultUnit={current?.unit ?? tracker.unit ?? ''} error={formError} onClose={close} onSave={save} />
    <Modal visible={Boolean(deleting)} transparent animationType="fade" onRequestClose={() => setDeleting(null)}><View style={styles.confirmBackdrop}><View style={styles.confirmCard}><Text style={styles.confirmTitle}>Delete this taper step?</Text><Text style={styles.confirmBody}>The step will be removed and neighboring durations will be recalculated. Your original taper start remains unchanged.</Text><View style={styles.actions}><Pressable onPress={() => setDeleting(null)} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>Cancel</Text></Pressable><Pressable onPress={() => { if (deleting) { const result = deleteTaperStep(previewState, deleting.id, true); if (!result.error) deleteStep(deleting.id, true); } setDeleting(null); }} style={styles.confirmDelete}><Text style={styles.confirmDeleteText}>Delete step</Text></Pressable></View></View></View></Modal>
  </SafeAreaView>;
}

function conciseDuration(value: NonNullable<ReturnType<typeof stepDuration>>) { if (value.years) return `${value.years}y ${value.months}mo`; if (value.months) return `${value.months}mo ${value.days}d`; return `${value.days}d ${value.hours}h`; }
function fullDuration(value: NonNullable<ReturnType<typeof stepDuration>>) { const parts = []; if (value.years) parts.push(`${value.years} years`); if (value.months) parts.push(`${value.months} months`); if (value.days) parts.push(`${value.days} days`); if (!parts.length) parts.push(`${value.hours} hours`); return parts.join(', '); }
function formatTimelineDate(step: TaperStep) { if (!step.startedAt) return 'Date not recorded'; const start = new Date(step.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); if (step.status === 'current') return formatStepStart(step); if (!step.endedAt) return `${formatStepStart(step)} · End date not recorded`; const end = new Date(step.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); return `${step.datePrecision === 'approximate' ? 'Approximately ' : ''}${start} – ${end}`; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, alignItems: 'center', paddingBottom: 44 }, heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, heroIconText: { fontSize: 34, fontWeight: '600' }, title: { color: colors.text, fontSize: 30, fontWeight: '700', marginTop: 18 }, subtitle: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8 }, editLink: { padding: 10, marginTop: 5 }, editLinkText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  summary: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 18, alignItems: 'center' }, eyebrow: { color: colors.textDim, fontSize: 11, letterSpacing: 1.2, fontWeight: '600' }, overallStarted: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 7 }, amountJourney: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 9, marginTop: 18 }, journeyAmount: { color: colors.text, fontSize: 18, fontWeight: '600' }, arrow: { color: colors.textDim, fontSize: 18 }, reduction: { fontSize: 13, fontWeight: '600', marginTop: 8 }, summaryStats: { width: '100%', flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 18, paddingTop: 16 }, summaryStat: { flex: 1, alignItems: 'center' }, divider: { width: 1, backgroundColor: colors.border }, statValue: { color: colors.text, fontSize: 17, fontWeight: '600' }, statLabel: { color: colors.textDim, fontSize: 11, letterSpacing: 1, fontWeight: '600', marginTop: 5 },
  currentPanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 14 }, currentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, currentAmount: { color: colors.text, fontSize: 24, fontWeight: '700', marginTop: 5 }, currentBadge: { fontSize: 11, letterSpacing: 1.2, fontWeight: '600' }, startLabel: { color: colors.textMuted, fontSize: 11, marginTop: 8 }, timerBlock: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18 }, largeDuration: { flexDirection: 'row', alignItems: 'baseline' }, largeNumber: { color: colors.text, fontSize: 25, fontWeight: '600', marginLeft: 7 }, largeUnit: { color: colors.textMuted, fontSize: 11, marginLeft: 2 }, clock: { color: colors.textMuted, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }, timerUnavailable: { color: colors.textDim, fontSize: 11, marginTop: 18 },
  addButton: { width: '100%', backgroundColor: colors.accent, borderRadius: 15, alignItems: 'center', paddingVertical: 15, marginTop: 14 }, addText: { color: colors.background, fontSize: 13, fontWeight: '600' },
  historicalButton: { width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 15, alignItems: 'center', paddingVertical: 14, marginTop: 9 }, historicalButtonText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  timelinePanel: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 24 }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 5, marginBottom: 15 }, stepRow: { flexDirection: 'row' }, timelineRail: { width: 22, alignItems: 'center' }, timelineDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, marginTop: 17, zIndex: 2 }, timelineLine: { width: 1, flex: 1, backgroundColor: colors.border }, stepCard: { flex: 1, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 14, paddingLeft: 8 }, stepHeader: { flexDirection: 'row', justifyContent: 'space-between' }, stepActions: { flexDirection: 'row', gap: 12 }, stepLabel: { color: colors.textDim, fontSize: 11, letterSpacing: 1.1, fontWeight: '600' }, editText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' }, deleteText: { color: colors.danger, fontSize: 11, fontWeight: '700' }, stepAmount: { color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 5 }, stepDate: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 5 }, stepDuration: { color: colors.textMuted, fontSize: 11, marginTop: 4 }, stepReduction: { color: colors.textDim, fontSize: 11, marginTop: 5 }, stepNote: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 7, fontStyle: 'italic' },
  historyChart: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg, marginTop: 14 }, historyLink: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14, overflow: 'hidden' }, historyLinkText: { color: colors.text, fontSize: 12, fontWeight: '700' }, notes: { width: '100%', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 25, paddingTop: 18 }, notesText: { color: colors.textMuted, fontSize: 11, lineHeight: 18, marginTop: 7 }, footer: { color: colors.textDim, fontSize: 11, marginTop: 30 },
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', padding: spacing.lg, justifyContent: 'center' }, confirmCard: { width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg }, confirmTitle: { color: colors.text, fontSize: 20, fontWeight: '600' }, confirmBody: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 9 }, actions: { flexDirection: 'row', gap: 9, marginTop: 20 }, confirmCancel: { flex: 1, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 13, paddingVertical: 13 }, confirmCancelText: { color: colors.text, fontSize: 12, fontWeight: '700' }, confirmDelete: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.danger, borderRadius: 13, paddingVertical: 13 }, confirmDeleteText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
});
