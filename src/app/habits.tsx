import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Href, Link, Redirect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainScreenHeader } from '@/components/main-screen-header';
import { ReductionCard } from '@/components/reduction-card';
import { TimerCard } from '@/components/timer-card';
import { HabitCard } from '@/components/habit-card';
import { WaterHabitCard } from '@/components/water-habit-card';
import { GoodHabitTemplateCard } from '@/components/good-habit-template-card';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, type } from '@/theme';
import { DEFAULT_PREFERENCES, hiddenHabitsDestination } from '@/lib/preferences';
import { formatTaperQuitStart, taperQuitPhase, trackerJourneySection } from '@/lib/taper-quit';
import { estimateTrackerSavings, formatSavings } from '@/lib/habit-savings';
import { useNow } from '@/hooks/use-now';
import { localDateKey } from '@/lib/progress';

export default function HabitsScreen() {
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();
  const { trackers, historicalEntries = [], waterLogs = [], goodHabitLogs = [], activityRoutes = [], taperSteps = [], hydrated, preferences = DEFAULT_PREFERENCES, swapHabitOrder, logGoodHabit, saveWaterDrink } = useTrackers();
  const active = trackers.filter((tracker) => !tracker.archived);
  const quitting = active.filter((tracker) => trackerJourneySection(tracker, taperSteps) === 'quitting');
  const reduction = active.filter((tracker) => trackerJourneySection(tracker, taperSteps) === 'reducing');
  const habits = active.filter((tracker) => trackerJourneySection(tracker, taperSteps) === 'building');
  const [view, setView] = useState<'good' | 'quit' | null>(null);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem('reclaim-habits-view').then((saved) => {
      if (mounted) setView(saved === 'good' || saved === 'quit' ? saved : habits.length && !quitting.length && !reduction.length ? 'good' : 'quit');
    }).catch(() => { if (mounted) setView(habits.length && !quitting.length && !reduction.length ? 'good' : 'quit'); });
    return () => { mounted = false; };
  }, [habits.length, quitting.length, reduction.length]);
  const selectView = (next: 'good' | 'quit') => { setView(next); void AsyncStorage.setItem('reclaim-habits-view', next).catch(() => undefined); };
  const [expandedTimers, setExpandedTimers] = useState<Record<string, boolean>>({});
  const [editingOrder, setEditingOrder] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const now = useNow(60_000);
  const quitStarts = quitting.map((tracker) => ({ tracker, startedAt: taperQuitPhase(tracker, taperSteps)?.startedAt ?? tracker.startedAt }));
  const totalSavings = quitStarts.reduce((sum, { tracker, startedAt }) => sum + estimateTrackerSavings(tracker.savingsExpenses, startedAt, now), 0);
  const totalQuitMs = quitStarts.reduce((sum, { startedAt }) => {
    const startedMs = startedAt ? Date.parse(startedAt) : NaN;
    return sum + (Number.isFinite(startedMs) ? Math.max(0, now - startedMs) : 0);
  }, 0);
  const totalQuitDays = Math.floor(totalQuitMs / 86_400_000);
  const orderControls = (section: typeof active, trackerId: string) => {
    if (!editingOrder) return null;
    const index = section.findIndex((tracker) => tracker.id === trackerId);
    return <View style={styles.orderControls}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${section[index].name} up`} disabled={index <= 0} onPress={() => swapHabitOrder(trackerId, section[index - 1].id)} style={[styles.orderButton, index <= 0 && styles.disabled]}><Text style={styles.orderText}>↑ Move up</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${section[index].name} down`} disabled={index >= section.length - 1} onPress={() => swapHabitOrder(trackerId, section[index + 1].id)} style={[styles.orderButton, index >= section.length - 1 && styles.disabled]}><Text style={styles.orderText}>↓ Move down</Text></Pressable>
    </View>;
  };

  if (!hydrated || view === null) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingMark}>R</Text>
      </View>
    );
  }
  if (!preferences.visibleSections.goals) {
    return <Redirect href={hiddenHabitsDestination(preferences.visibleSections) as Href} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <MainScreenHeader
          eyebrow="YOUR HABITS"
          subtitle="Track what you’re quitting, reducing, or building."
          accent={colors.habitsNav}
        />

        {deleted && <Text style={styles.deletedNotice}>{deleted} was permanently deleted.</Text>}

        <View style={styles.tabRow}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === 'good' }} onPress={() => selectView('good')} style={[styles.tab, view === 'good' && styles.tabActive]}><Text style={[styles.tabText, view === 'good' && styles.tabTextActive]}>Good Habits</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === 'quit' }} onPress={() => selectView('quit')} style={[styles.tab, view === 'quit' && styles.tabActive]}><Text style={[styles.tabText, view === 'quit' && styles.tabTextActive]}>Quitting & Tapering</Text></Pressable>
        </View>

        {view === 'quit' && <View style={styles.summaryCard}>
          <Pressable accessibilityRole="button" accessibilityLabel="Habits overview" accessibilityState={{ expanded: summaryExpanded }} onPress={() => setSummaryExpanded((current) => !current)} style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Your progress</Text><Text style={styles.summaryChevron}>{summaryExpanded ? '⌃' : '⌄'}</Text>
          </Pressable>
          {summaryExpanded && <View style={styles.summaryBody}>
            <View style={styles.summaryMetric}><Text style={styles.summaryLabel}>Total time saved</Text><Text style={styles.summaryValue}>{totalQuitDays.toLocaleString()} {totalQuitDays === 1 ? 'day' : 'days'}</Text></View>
            <View style={styles.summaryMetric}><Text style={styles.summaryLabel}>Total money saved</Text><Text style={styles.summaryValue}>{formatSavings(totalSavings)}</Text></View>
            <Text style={styles.summaryNote}>Combined across current quitting trackers. Time on simultaneous trackers is counted for each one; money is an estimate from saved expenses.</Text>
          </View>}
        </View>}

        <View style={styles.managementRow}>
          <Link href={(view === 'good' ? '/good-habit-types' : '/tracker-form') as Href} style={styles.addTracker}>{view === 'good' ? '+ Add good habit' : '+ Add tracker'}</Link>
          <Link href="/manage" style={styles.manageTrackers}>Manage trackers</Link>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: editingOrder }} onPress={() => setEditingOrder((editing) => !editing)} style={styles.editOrder}><Text style={styles.editOrderText}>{editingOrder ? 'Done editing order' : 'Edit order'}</Text></Pressable>

        {view === 'quit' && <><View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quitting</Text>
          <View style={styles.sectionControls}>
            <Text style={styles.sectionMeta}>{quitting.length} active</Text>
          </View>
        </View>
        <View style={styles.cardStack}>
          {quitting.map((tracker) => { const phase = taperQuitPhase(tracker, taperSteps); const expanded = expandedTimers[tracker.id] ?? false; const hasTimer = Boolean(phase?.startedAt ?? tracker.startedAt); return <View key={tracker.id}><TimerCard tracker={tracker} phaseStart={phase?.startedAt} phasePrecision={phase?.datePrecision} phaseStartLabel={phase ? formatTaperQuitStart(phase) : undefined} modeLabel={phase ? 'QUIT AFTER TAPER' : undefined} expanded={expanded} />{hasTimer && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${tracker.name} timer details`} accessibilityState={{ expanded }} onPress={() => setExpandedTimers((current) => ({ ...current, [tracker.id]: !expanded }))} style={styles.timerButton}><Text style={styles.timerToggle}>{expanded ? 'Hide timer details −' : 'Show timer details +'}</Text></Pressable>}{orderControls(quitting, tracker.id)}</View>; })}
        </View>

        {reduction.length > 0 && <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Reducing</Text>
            <Text style={styles.sectionMeta}>This week</Text>
          </View>
          <View style={styles.cardStack}>
            {reduction.map((tracker) => (
              <View key={tracker.id}><ReductionCard tracker={tracker} />{orderControls(reduction, tracker.id)}</View>
            ))}
          </View>
        </>}

        </>}

        {view === 'good' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Good Habits</Text>
              <Text style={styles.sectionMeta}>{habits.length} active</Text>
            </View>
            <View style={styles.cardStack}>
              {habits.map((tracker) => (
                <View key={tracker.id}>{tracker.habitTemplate === 'water'
                  ? <WaterHabitCard tracker={tracker} logs={waterLogs} onLog={() => saveWaterDrink({ id: `water-${Date.now()}-${Math.random().toString(36).slice(2)}`, trackerId: tracker.id, eventDate: localDateKey(), ounces: tracker.waterQuickAddOz ?? 8, recordedAt: new Date().toISOString() })} />
                  : tracker.habitTemplate ? <GoodHabitTemplateCard tracker={tracker} logs={goodHabitLogs} routes={activityRoutes} />
                    : <HabitCard tracker={tracker} entries={historicalEntries.filter((entry) => entry.trackerId === tracker.id)} onLog={() => logGoodHabit(tracker.id)} />}{orderControls(habits, tracker.id)}</View>
              ))}
            </View>
          </>
        )}
        {view === 'good' && habits.length === 0 && <View style={styles.emptyCard}><Text style={styles.sectionTitle}>Build something good.</Text><Text style={styles.emptyText}>Choose a habit, set a flexible goal, and log it as you go.</Text></View>}

        <Text style={styles.disclaimer}>
          Reclaim is a private tracking tool, not medical advice. Saved records stay
          on your device. Only content you explicitly submit for AI analysis or
          choose to export is shared.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 48,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.accent,
    color: colors.background,
    textAlign: 'center',
    lineHeight: 54,
    fontSize: 28,
    fontWeight: '900',
  },
  intro: { marginTop: 34, marginBottom: spacing.xl },
  eyebrow: {
    ...type.eyebrow,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    lineHeight: 43,
    letterSpacing: -1.2,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 34,
    marginBottom: spacing.md,
  },
  deletedNotice: { color: colors.success, backgroundColor: colors.accentSoft, borderRadius: 12, padding: 10, fontSize: 11, textAlign: 'center', marginTop: 8 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 18, marginTop: 8 },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8 },
  tabActive: { backgroundColor: colors.accentSoft, borderColor: colors.habitsNav },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  tabTextActive: { color: colors.habitsNav, fontWeight: '800' },
  emptyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: 22, marginTop: 20 },
  emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  summaryCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, marginBottom: 18, overflow: 'hidden' },
  summaryHeader: { minHeight: 54, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  summaryChevron: { color: colors.habitsNav, fontSize: 24, fontWeight: '700' },
  summaryBody: { borderTopWidth: 1, borderTopColor: colors.border, padding: 18, gap: 18 },
  summaryMetric: { flex: 1, gap: 5 },
  summaryLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  summaryValue: { color: colors.habitsNav, fontSize: 28, fontWeight: '900' },
  summaryNote: { color: colors.textDim, fontSize: 10, lineHeight: 15 },
  managementRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  addTracker: { flex: 1, color: colors.background, backgroundColor: colors.accent, borderRadius: 13, paddingVertical: 12, textAlign: 'center', fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  manageTrackers: { flex: 1, color: colors.textMuted, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingVertical: 12, textAlign: 'center', fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  editOrder: { alignSelf: 'flex-end', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 10 },
  editOrderText: { color: colors.habitsNav, fontSize: 12, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  sectionMeta: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  sectionControls: { alignItems: 'flex-end', gap: 5 },
  timerToggle: { color: colors.habitsNav, fontSize: 10, fontWeight: '800' },
  timerButton: { alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 11, marginTop: 6 },
  orderControls: { flexDirection: 'row', gap: 8, marginTop: 8 },
  orderButton: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 10 },
  orderText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  cardStack: { gap: spacing.md },
  disclaimer: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 38,
    paddingHorizontal: spacing.lg,
  },
});
