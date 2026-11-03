import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useTrackers } from '@/state/tracker-context';
import { useNow } from '@/hooks/use-now';
import { CravingEvent, CravingHelper } from '@/models/tracker';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { formatSavings } from '@/lib/habit-savings';
import { BREATH_HOLD_MS, BREATH_IN_MS, BREATH_OUT_MS, breathingPhase, sessionClock } from '@/lib/mindfulness-session';
import { activeSavingsGoal, featuredQuit, quitSummary, quittingStarts, totalQuitSavings } from '@/lib/quit-progress';
import { trackerDisplayName } from '@/lib/tracker-management';
import { colors, font, layout, radius, type } from '@/theme';

const BREATHE_MS = 2 * 60_000;
const HELPERS: { key: CravingHelper; label: string; detail: string }[] = [
  { key: 'breathing', label: 'Breathe for 2 minutes', detail: 'A slow breathing guide. Cravings ease as your body calms.' },
  { key: 'walk', label: 'Go for a walk', detail: 'Change where you are. Even ten minutes outside helps.' },
  { key: 'water', label: 'Drink a glass of water', detail: 'Something to do with your hands and mouth.' },
  { key: 'distraction', label: 'Distract myself', detail: 'Call someone, tidy up, play a game.' },
  { key: 'waited', label: 'Just wait it out', detail: 'Most cravings fade within 10–15 minutes.' },
];

type Stage = 'start' | 'breathe' | 'outcome' | 'done';

export default function CravingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tracker?: string }>();
  const { trackers, taperSteps = [], cravings = [], savingsGoals = [], preferences = DEFAULT_PREFERENCES, logCraving } = useTrackers();
  const now = useNow(1_000);
  const starts = quittingStarts(trackers, taperSteps).filter((item) => item.startedAt);
  const [trackerId, setTrackerId] = useState(() => featuredQuit(starts, params.tracker ?? preferences.featuredTrackerId)?.tracker.id);
  const [intensity, setIntensity] = useState<CravingEvent['intensity']>();
  const [helper, setHelper] = useState<CravingHelper>();
  const [stage, setStage] = useState<Stage>('start');
  const [breathStart, setBreathStart] = useState(0);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<CravingEvent['outcome']>();
  const selected = starts.find((item) => item.tracker.id === trackerId);
  const summary = selected?.startedAt ? quitSummary(selected.tracker, selected.startedAt, selected.precision, now) : undefined;
  const goal = activeSavingsGoal(savingsGoals, totalQuitSavings(starts, now));
  const beatenThisMonth = cravings.filter((item) => item.outcome === 'beaten' && item.at.slice(0, 7) === new Date(now).toISOString().slice(0, 7)).length;

  const choose = (key: CravingHelper) => {
    setHelper(key);
    if (key === 'breathing') { setBreathStart(new Date().getTime()); setStage('breathe'); } else setStage('outcome');
  };
  const save = (result: CravingEvent['outcome']) => {
    logCraving({ id: `craving-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, trackerId, at: new Date().toISOString(), intensity, outcome: result, helped: helper, note: note.trim() || undefined });
    setOutcome(result);
    setStage('done');
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ title: 'Craving' }} />
    {stage === 'start' && <>
      <Text style={styles.title}>Ride it out</Text>
      <Text style={styles.lead}>A craving is a wave. It builds, peaks and passes, usually within minutes. You don’t have to act on it.</Text>

      {starts.length > 1 && <View style={styles.block}>
        <Text style={styles.label}>What’s the craving for?</Text>
        <View style={styles.chips}>{starts.map(({ tracker }) => <Pressable key={tracker.id} accessibilityRole="radio" accessibilityState={{ checked: tracker.id === trackerId }} onPress={() => setTrackerId(tracker.id)} style={[styles.chip, tracker.id === trackerId && { borderColor: tracker.color, backgroundColor: `${tracker.color}1F` }]}>
          <Text style={[styles.chipText, tracker.id === trackerId && { color: tracker.color }]}>{trackerDisplayName(tracker)}</Text>
        </Pressable>)}</View>
      </View>}

      {selected && summary && <View style={[styles.reason, { borderColor: `${selected.tracker.color}55` }]}>
        <Text style={[styles.eyebrow, { color: selected.tracker.color }]}>REMEMBER WHY</Text>
        <Text style={styles.reasonBig}>{summary.days.toLocaleString()} {summary.days === 1 ? 'day' : 'days'} free of {trackerDisplayName(selected.tracker).toLowerCase()}</Text>
        {summary.savingsCents > 0 && <Text style={styles.reasonLine}>{formatSavings(summary.savingsCents)} kept in your pocket so far.</Text>}
        {goal && <Text style={styles.reasonLine}>{goal.remainingCents > 0 ? `${formatSavings(goal.remainingCents)} to go for ${goal.goal.name}.` : `You can afford ${goal.goal.name}.`}</Text>}
      </View>}

      <View style={styles.block}>
        <Text style={styles.label}>How strong is it?</Text>
        <View style={styles.scale}>{([1, 2, 3, 4, 5] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Intensity ${value} of 5`} accessibilityState={{ checked: intensity === value }} onPress={() => setIntensity(value)} style={[styles.scaleItem, intensity === value && styles.scaleOn]}>
          <Text style={[styles.scaleText, intensity === value && styles.scaleTextOn]}>{value}</Text>
        </Pressable>)}</View>
        <View style={styles.scaleEnds}><Text style={styles.hint}>Mild</Text><Text style={styles.hint}>Intense</Text></View>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Pick one thing to do right now</Text>
        {HELPERS.map((item) => <Pressable key={item.key} accessibilityRole="button" onPress={() => choose(item.key)} style={({ pressed }) => [styles.option, item.key === 'breathing' && styles.optionPrimary, pressed && styles.pressed]}>
          <Text style={[styles.optionTitle, item.key === 'breathing' && { color: colors.habitsNav }]}>{item.label}</Text>
          <Text style={styles.optionDetail}>{item.detail}</Text>
        </Pressable>)}
      </View>
    </>}

    {stage === 'breathe' && <Breathe startedAt={breathStart} now={now} onDone={() => setStage('outcome')} />}

    {stage === 'outcome' && <>
      <Text style={styles.title}>How did it go?</Text>
      {helper === 'walk' && <Text style={styles.lead}>Go take that walk. Come back and log how it went, or log it now.</Text>}
      {helper === 'walk' && preferences.visibleSections.routes && <Pressable accessibilityRole="button" onPress={() => router.navigate('/routes' as Href)} style={styles.secondary}><Text style={styles.secondaryText}>Track the walk in Routes</Text></Pressable>}
      <TextInput value={note} onChangeText={setNote} placeholder="What triggered it? (optional)" placeholderTextColor={colors.textDim} style={styles.input} multiline accessibilityLabel="Craving note" />
      <Pressable accessibilityRole="button" onPress={() => save('beaten')} style={styles.primary}><Text style={styles.primaryText}>I beat it</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => save('slipped')} style={styles.secondary}><Text style={styles.secondaryText}>I slipped</Text></Pressable>
      <Text style={styles.hint}>Logging a slip doesn’t reset your timer. If you want to restart it, you can do that from the tracker.</Text>
    </>}

    {stage === 'done' && <>
      <Text style={styles.title}>{outcome === 'beaten' ? 'Craving beaten' : 'Thanks for being honest'}</Text>
      <Text style={styles.lead}>{outcome === 'beaten'
        ? `That’s ${beatenThisMonth} ${beatenThisMonth === 1 ? 'craving' : 'cravings'} beaten this month. Each one makes the next one weaker.`
        : 'One slip doesn’t undo your progress. Noticing what triggered it is how the next one goes differently.'}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primary}><Text style={styles.primaryText}>Done</Text></Pressable>
    </>}
  </ScrollView>;
}

function Breathe({ startedAt, now, onDone }: { startedAt: number; now: number; onDone: () => void }) {
  const [scale] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(false);
  const elapsed = Math.max(0, now - startedAt);
  const remaining = Math.max(0, BREATHE_MS - elapsed);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined); }, []);
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1, duration: BREATH_IN_MS, useNativeDriver: true }),
      Animated.delay(BREATH_HOLD_MS),
      Animated.timing(scale, { toValue: 0, duration: BREATH_OUT_MS, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, scale]);
  return <View style={styles.breathe}>
    <View style={styles.orbWrap} accessibilityLabel="Breathing guide">
      <View style={styles.ring} />
      <Animated.View style={[styles.orb, { transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] }]} />
    </View>
    <Text style={styles.cue}>{remaining > 0 ? { in: 'Breathe in', hold: 'Hold gently', out: 'Breathe out slowly' }[breathingPhase(elapsed)] : 'Nicely done'}</Text>
    <Text style={styles.clock}>{sessionClock(remaining)}</Text>
    <Pressable accessibilityRole="button" onPress={onDone} style={remaining > 0 ? styles.secondary : styles.primary}><Text style={remaining > 0 ? styles.secondaryText : styles.primaryText}>{remaining > 0 ? 'I’m done early' : 'Continue'}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 18 },
  title: { ...type.display, color: colors.text },
  lead: { ...type.body, color: colors.textMuted, fontFamily: font.regular },
  block: { gap: 10 },
  label: { ...type.heading, color: colors.text },
  hint: { ...type.metadata, color: colors.textDim, fontFamily: font.medium },
  eyebrow: { ...type.eyebrow },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  chipText: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold },
  reason: { borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, padding: 18, gap: 6 },
  reasonBig: { ...type.title, color: colors.text },
  reasonLine: { ...type.body, color: colors.textMuted, fontFamily: font.medium },
  scale: { flexDirection: 'row', gap: 8 },
  scaleItem: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  scaleOn: { borderColor: colors.habitsNav, backgroundColor: `${colors.habitsNav}1F` },
  scaleText: { color: colors.textMuted, fontSize: 16, fontFamily: font.bold },
  scaleTextOn: { color: colors.habitsNav },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  option: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 4 },
  optionPrimary: { borderColor: `${colors.habitsNav}66` },
  optionTitle: { color: colors.text, fontSize: 16, fontFamily: font.bold },
  optionDetail: { ...type.metadata, color: colors.textMuted, fontFamily: font.regular },
  pressed: { opacity: 0.8 },
  input: { minHeight: 80, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, padding: 14, fontSize: 15, fontFamily: font.regular, textAlignVertical: 'top' },
  primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.habitsNav, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { color: colors.background, fontSize: 16, fontFamily: font.bold },
  secondary: { minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  secondaryText: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  breathe: { alignItems: 'stretch', gap: 20, paddingTop: 24 },
  orbWrap: { alignSelf: 'center', width: 260, height: 260, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 250, height: 250, borderRadius: 125, borderWidth: 1, borderColor: `${colors.habitsNav}44` },
  orb: { width: 150, height: 150, borderRadius: 75, backgroundColor: colors.habitsNav, opacity: 0.85 },
  cue: { color: colors.text, fontSize: 24, fontFamily: font.semibold, textAlign: 'center' },
  clock: { color: colors.textMuted, fontSize: 40, fontFamily: font.bold, fontVariant: ['tabular-nums'], textAlign: 'center' },
});
