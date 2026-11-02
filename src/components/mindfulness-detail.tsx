import { Href, Link, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, AppState, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoodHabitIcon } from './good-habit-icon';
import { goodHabitLogId, habitProgress } from '@/lib/good-habit-templates';
import { BREATH_HOLD_MS, BREATH_IN_MS, BREATH_OUT_MS, breathingPhase, sessionClock, sessionElapsedMs, sessionMinutes } from '@/lib/mindfulness-session';
import { quietPromptFor } from '@/lib/mindfulness-prompts';
import { localDateKey } from '@/lib/progress';
import { validWaterDate } from '@/lib/water-habit';
import type { GoodHabitLog, Tracker } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

type Session = { date: string; plannedMs: number; savedMs: number; runningSince: number | null };

export function MindfulnessDetail({ tracker, logs }: { tracker: Tracker; logs: GoodHabitLog[] }) {
  const { saveGoodHabitLog, deleteGoodHabitLog } = useTrackers();
  const navigation = useNavigation();
  const progress = habitProgress(tracker, logs, [], new Date());
  const [duration, setDuration] = useState(() => String(Math.max(1, Math.min(120, Math.ceil(progress.goal || 10)))));
  const [session, setSession] = useState<Session | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState(localDateKey);
  const [historyDate, setHistoryDate] = useState(localDateKey);
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [manualError, setManualError] = useState('');
  const [visual] = useState(() => new Animated.Value(0));
  const sessionRef = useRef<Session | null>(null);
  const mode = tracker.mindfulnessVisualMode ?? 'breathing';
  const sessionActive = Boolean(session);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => {
    navigation.setOptions({ headerShown: !sessionActive });
    return () => navigation.setOptions({ headerShown: true });
  }, [navigation, sessionActive]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!session?.runningSince) return;
    const ticker = setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(ticker);
  }, [session?.runningSince]);
  useEffect(() => {
    if (!session?.runningSince || reducedMotion || mode !== 'breathing') { visual.stopAnimation(); visual.setValue(0); return; }
    const cycle = Animated.loop(Animated.sequence([
      Animated.timing(visual, { toValue: 1, duration: BREATH_IN_MS, useNativeDriver: true }),
      Animated.delay(BREATH_HOLD_MS),
      Animated.timing(visual, { toValue: 0, duration: BREATH_OUT_MS, useNativeDriver: true }),
    ]));
    cycle.start();
    return () => cycle.stop();
  }, [session?.runningSince, mode, reducedMotion, visual]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      const active = sessionRef.current;
      if (state !== 'active' && active?.runningSince !== null && active) {
        const paused = { ...active, savedMs: sessionElapsedMs(active.savedMs, active.runningSince, Date.now()), runningSince: null };
        sessionRef.current = paused;
        setSession(paused);
      }
    });
    return () => listener.remove();
  }, []);

  const saveSession = useCallback((active: Session) => {
    const latest = sessionRef.current ?? active;
    const minutes = sessionMinutes(sessionElapsedMs(latest.savedMs, latest.runningSince, Date.now()));
    if (minutes > 0) saveGoodHabitLog({ id: goodHabitLogId(), trackerId: tracker.id, eventDate: latest.date, amount: minutes, note: `Timed session · ${mode === 'breathing' ? 'Breathing guide' : 'Quiet Zen'}`, source: 'manual', recordedAt: new Date().toISOString() });
    setDuration(String(Math.max(1, Math.min(120, Math.ceil(progress.goal - progress.amount - minutes)))));
    sessionRef.current = null;
    setSession(null);
  }, [mode, progress.amount, progress.goal, saveGoodHabitLog, tracker.id]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      const active = sessionRef.current;
      if (!active) return false;
      Alert.alert('Leave mindfulness session?', 'Save the time you practiced, or continue your session.', [
        { text: 'Continue', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { sessionRef.current = null; setSession(null); } },
        { text: 'Save time', onPress: () => saveSession(active) },
      ]);
      return true;
    });
    return () => listener.remove();
  }, [saveSession]);

  const elapsed = session ? sessionElapsedMs(session.savedMs, session.runningSince, clockNow) : 0;
  const planned = Number(duration);
  const start = () => {
    if (!Number.isFinite(planned) || planned < 1 || planned > 120) { Alert.alert('Choose a session length', 'Enter 1–120 minutes.'); return; }
    const now = Date.now();
    setClockNow(now);
    const started = { date: localDateKey(new Date(now)), plannedMs: planned * 60_000, savedMs: 0, runningSince: now };
    sessionRef.current = started;
    setSession(started);
  };
  const saveManual = () => {
    const minutes = Number(manualMinutes);
    if (!validWaterDate(manualDate) || manualDate > localDateKey() || manualDate < localDateKey(new Date(tracker.startedAt ?? 0))) { setManualError('Choose a valid date since this habit started.'); return; }
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) { setManualError('Enter minutes greater than zero and no more than 1,440.'); return; }
    saveGoodHabitLog({ id: editingLogId ?? goodHabitLogId(), trackerId: tracker.id, eventDate: manualDate, amount: minutes, note: manualNote.trim() || undefined, source: 'manual', recordedAt: new Date().toISOString() });
    setManualOpen(false); setEditingLogId(null); setManualMinutes(''); setManualNote(''); setManualError('');
  };
  if (session) return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><View style={styles.session}>
    <Text style={styles.eyebrow}>{mode === 'breathing' ? 'BREATHING GUIDE' : 'QUIET ZEN · A MOMENT OF CALM'}</Text>
    {mode === 'breathing' ? <>
      <View style={styles.visualWrap} accessibilityLabel="Breathing guide, expanding and contracting circle">
        <View style={styles.outerRing} /><View style={styles.middleRing} />
        <Animated.View style={[styles.orb, { transform: [{ scale: visual.interpolate({ inputRange: [0, 1], outputRange: [1, 1.32] }) }], opacity: visual.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }]} />
      </View>
      <Text style={styles.cue}>{session.runningSince ? { in: 'Breathe in', hold: 'Hold gently', out: 'Breathe out slowly' }[breathingPhase(clockNow - session.runningSince)] : 'Paused'}</Text>
      <Text style={styles.breathHint}>4 seconds in · 2-second pause · 6 seconds out. Follow comfortably; you can skip the hold.</Text>
      <Text style={styles.clock}>{sessionClock(elapsed)}</Text><Text style={styles.sub}>{sessionClock(Math.max(0, session.plannedMs - elapsed))} of your planned session remaining</Text>
    </> : <View style={styles.quietCenter}><Text style={styles.quietPrompt}>{quietPromptFor(elapsed)}</Text><Text style={[styles.clock, styles.quietClock]}>{sessionClock(elapsed)}</Text>{session.runningSince === null && <Text style={styles.sub}>Paused</Text>}</View>}
    {elapsed >= session.plannedMs && <Text style={styles.complete}>Your planned time is complete. Continue if you like, or save your practice.</Text>}
    <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => { const now = Date.now(); setClockNow(now); setSession((current) => current ? current.runningSince === null ? { ...current, runningSince: now } : { ...current, savedMs: sessionElapsedMs(current.savedMs, current.runningSince, now), runningSince: null } : current); }} style={styles.secondary}><Text style={styles.secondaryText}>{session.runningSince === null ? 'Resume' : 'Pause'}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => saveSession(session)} style={styles.primary}><Text style={styles.primaryText}>Finish &amp; save time</Text></Pressable></View>
  </View></SafeAreaView>;

  const historyLogs = logs.filter((item) => item.trackerId === tracker.id && item.eventDate === historyDate).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    <GoodHabitIcon type="mindfulness" size={82} style={styles.icon} /><Text style={styles.title}>{tracker.displayName || tracker.name}</Text>
    <View style={styles.card}><Text style={styles.eyebrow}>TODAY’S MINDFULNESS</Text><View style={styles.progressNumbers}><Text style={styles.big}>{Number(progress.amount.toFixed(1))}</Text><Text style={styles.progressGoal}>/ {progress.goal} min</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${progress.percent}%` }]} /></View><Text style={styles.sub}>Every minute you practice counts, even if you finish early.</Text></View>
    <View style={styles.card}><Text style={styles.section}>Start a session</Text><Text style={styles.sub}>{mode === 'breathing' ? 'A gently expanding circle guides your breathing.' : 'A still, dark screen with calming written prompts and your timer. No audio.'}</Text><Text style={styles.label}>Session length · minutes</Text><TextInput accessibilityLabel="Mindfulness session length in minutes" keyboardType="number-pad" value={duration} onChangeText={setDuration} style={styles.input} /><Pressable accessibilityRole="button" onPress={start} style={styles.primary}><Text style={styles.primaryText}>Start mindfulness</Text></Pressable><Text style={styles.sub}>Leaving the app pauses your timer. You can finish early and save your actual time.</Text></View>
    <View style={styles.card}><Text style={styles.section}>Practice history</Text><Text style={styles.label}>Date · YYYY-MM-DD</Text><TextInput accessibilityLabel="Mindfulness history date" value={historyDate} onChangeText={setHistoryDate} style={styles.input} />{historyLogs.length ? historyLogs.map((log) => <View key={log.id} style={styles.historyRow}><View style={styles.historyText}><Text style={styles.sub}>{Number(log.amount.toFixed(1))} min · {new Date(log.recordedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>{log.note && <Text style={styles.sub}>{log.note}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel="Edit mindfulness log" onPress={() => { setEditingLogId(log.id); setManualDate(log.eventDate); setManualMinutes(String(log.amount)); setManualNote(log.note ?? ''); setManualOpen(true); }}><Text style={styles.editAction}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete mindfulness log" onPress={() => Alert.alert('Delete practice log?', 'This removes these minutes from your progress.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteGoodHabitLog(log.id) }])}><Text style={styles.editAction}>Delete</Text></Pressable></View>) : <Text style={styles.sub}>No minutes logged on this date.</Text>}</View>
    <Pressable accessibilityRole="button" onPress={() => { setEditingLogId(null); setManualDate(localDateKey()); setManualMinutes(''); setManualNote(''); setManualError(''); setManualOpen(true); }} style={styles.secondary}><Text style={styles.secondaryText}>Log practice done elsewhere</Text></Pressable>
    <Link href={`/good-habit-form?type=mindfulness&id=${encodeURIComponent(tracker.id)}` as Href} style={styles.edit}>Edit goal, visual, or reminder</Link>
    <Modal visible={manualOpen} transparent animationType="fade" onRequestClose={() => setManualOpen(false)}><View style={styles.modalShade}><View style={styles.card}><Text style={styles.section}>{editingLogId ? 'Edit practice' : 'Log practice'}</Text><Text style={styles.label}>Date · YYYY-MM-DD</Text><TextInput accessibilityLabel="Mindfulness practice date" value={manualDate} onChangeText={setManualDate} style={styles.input} /><Text style={styles.label}>Minutes practiced</Text><TextInput accessibilityLabel="Mindfulness minutes practiced" keyboardType="decimal-pad" value={manualMinutes} onChangeText={setManualMinutes} style={styles.input} /><Text style={styles.label}>Note · optional</Text><TextInput accessibilityLabel="Mindfulness note" value={manualNote} onChangeText={setManualNote} style={styles.input} />{manualError ? <Text style={styles.error}>{manualError}</Text> : null}<Pressable accessibilityRole="button" onPress={saveManual} style={styles.primary}><Text style={styles.primaryText}>Save minutes</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setManualOpen(false)} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View></View></Modal>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, gap: 16, paddingBottom: 50 }, icon: { alignSelf: 'center', marginTop: 10 }, title: { color: colors.text, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 18, gap: 12 }, eyebrow: { color: colors.habitsNav, fontSize: 12, fontWeight: '900', letterSpacing: 1 }, section: { color: colors.text, fontSize: 20, fontWeight: '900' }, progressNumbers: { minHeight: 58, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }, big: { color: colors.text, fontSize: 36, lineHeight: 52, fontWeight: '900', includeFontPadding: true }, progressGoal: { color: colors.textMuted, fontSize: 18, lineHeight: 30, fontWeight: '700', includeFontPadding: true }, sub: { color: colors.textMuted, fontSize: 14, lineHeight: 21 }, label: { color: colors.text, fontSize: 14, fontWeight: '800' }, track: { height: 10, borderRadius: 6, backgroundColor: colors.border, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.habitsNav }, input: { minHeight: 52, paddingHorizontal: 14, color: colors.text, fontSize: 18, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  primary: { minHeight: 54, backgroundColor: colors.habitsNav, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, primaryText: { color: colors.background, fontSize: 16, fontWeight: '900' }, secondary: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, secondaryText: { color: colors.text, fontSize: 16, fontWeight: '800' }, edit: { color: colors.habitsNav, textAlign: 'center', padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden', fontWeight: '800' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, historyText: { flex: 1 }, editAction: { color: colors.habitsNav, fontSize: 13, fontWeight: '800', paddingVertical: 10 }, modalShade: { flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 20 }, error: { color: colors.danger, fontSize: 13 },
  session: { flex: 1, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', alignItems: 'center', justifyContent: 'space-around', padding: 24, gap: 15 }, quietCenter: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 32 }, quietPrompt: { color: colors.text, fontSize: 24, lineHeight: 36, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 }, quietClock: { fontSize: 52 }, visualWrap: { width: 290, height: 290, alignItems: 'center', justifyContent: 'center' }, outerRing: { position: 'absolute', width: 270, height: 270, borderRadius: 135, borderWidth: 1, borderColor: '#3A635D' }, middleRing: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: '#557D76' }, orb: { width: 150, height: 150, borderRadius: 75, backgroundColor: colors.habitsNav, shadowColor: colors.habitsNav, shadowOpacity: 0.6, shadowRadius: 32, elevation: 10 }, cue: { color: colors.text, fontSize: 25, fontWeight: '800', textAlign: 'center' }, breathHint: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' }, clock: { color: colors.text, fontSize: 52, fontWeight: '900', fontVariant: ['tabular-nums'] }, complete: { color: colors.habitsNav, fontSize: 14, textAlign: 'center' }, actions: { width: '100%', flexDirection: 'row', gap: 10 },
});
