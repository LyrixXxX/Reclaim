import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BODY_PART_COLORS, BODY_PART_LABELS, bodyPartFor, muscleLabel } from '@/lib/body-parts';
import { MuscleGroup, StrengthSet } from '@/models/tracker';
import { colors, font, radius } from '@/theme';

// The workout logger is drawn as a notebook page: a dated heading, one ruled line per set, and a
// short entry line at the bottom of the exercise being worked on.

export const SET_KIND_LABELS: Record<StrengthSet['kind'], string> = { working: 'Working', warmup: 'Warm-up', drop: 'Drop', failure: 'Failure' };
const SET_KIND_MARKS: Partial<Record<StrengthSet['kind'], string>> = { warmup: 'W', drop: 'D', failure: 'F' };

export function NotepadPill({ label, onPress, active, tone = 'neutral', disabled }: { label: string; onPress: () => void; active?: boolean; tone?: 'neutral' | 'accent' | 'danger'; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active, disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={[styles.pill, active && styles.pillActive, disabled && styles.disabled]}>
    <Text style={[styles.pillText, active && styles.pillTextActive, tone === 'accent' && !active && { color: colors.workoutsNav }, tone === 'danger' && { color: colors.danger }]}>{label}</Text>
  </Pressable>;
}

export function BodyPartTag({ muscle }: { muscle: MuscleGroup }) {
  const part = bodyPartFor(muscle);
  const color = BODY_PART_COLORS[part];
  const detail = muscle !== part ? ` · ${muscleLabel(muscle)}` : '';
  return <View style={[styles.tag, { backgroundColor: `${color}22` }]}><Text style={[styles.tagText, { color }]} numberOfLines={1}>{BODY_PART_LABELS[part]}{detail}</Text></View>;
}

export function PageHeader({ date, name, onRename, elapsed, paused, onTogglePause }: { date: string; name: string; onRename: (name: string) => void; elapsed: string; paused: boolean; onTogglePause: () => void }) {
  return <View style={styles.header}>
    <View style={styles.headerTop}>
      <Text style={styles.date}>{date}</Text>
      <View style={styles.headerClock}>
        <Text style={[styles.clock, paused && { color: colors.textDim }]}>{paused ? 'Paused · ' : ''}{elapsed}</Text>
        <NotepadPill label={paused ? 'Resume' : 'Pause'} onPress={onTogglePause} />
      </View>
    </View>
    <TextInput accessibilityLabel="Workout name" value={name} onChangeText={onRename} onEndEditing={() => { if (!name.trim()) onRename('Workout'); }}
      style={styles.name} placeholder="Workout name" placeholderTextColor={colors.textDim} returnKeyType="done" />
    <View style={styles.rule} />
  </View>;
}

export function SetLine({ index, label, set, durationLabel, editing, onPress }: { index: number; label: string; set: StrengthSet; durationLabel?: string; editing: boolean; onPress: () => void }) {
  const mark = SET_KIND_MARKS[set.kind];
  return <Pressable accessibilityRole="button" accessibilityLabel={`Set ${index}, ${SET_KIND_LABELS[set.kind]}, ${label}. Edit`} onPress={onPress} style={[styles.line, editing && styles.lineEditing]}>
    <Text style={styles.margin}>{index}</Text>
    <Text style={[styles.lineText, set.kind === 'warmup' && { color: colors.textMuted }]}>{label}</Text>
    {mark && <Text style={styles.mark}>{mark}</Text>}
    {(durationLabel || set.notes) && <Text style={styles.lineMeta} numberOfLines={1}>{[durationLabel, set.notes].filter(Boolean).join(' · ')}</Text>}
  </Pressable>;
}

/** A planned set from the routine, drawn faintly like pencil until it is logged. */
export function PlannedLine({ index, label, onPress }: { index: number; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Planned set ${index}, ${label}. Use as next set`} onPress={onPress} style={styles.line}>
    <Text style={[styles.margin, styles.planned]}>{index}</Text>
    <Text style={[styles.lineText, styles.planned]}>{label}</Text>
    <Text style={[styles.lineMeta, styles.planned]}>planned</Text>
  </Pressable>;
}

export function RestLine({ remaining, paused, onSkip, onTogglePause, onAdd }: { remaining: string; paused: boolean; onSkip: () => void; onTogglePause: () => void; onAdd: () => void }) {
  return <View style={styles.rest} accessibilityLiveRegion="polite">
    <Text style={styles.restText}>Rest {remaining}{paused ? ' · paused' : ''}</Text>
    <View style={styles.row}>
      <NotepadPill label="+30 s" onPress={onAdd} />
      <NotepadPill label={paused ? 'Resume' : 'Pause'} onPress={onTogglePause} />
      <NotepadPill label="Skip" onPress={onSkip} tone="accent" />
    </View>
  </View>;
}

/** Compact weight × reps field pair with a log button; the bottom line of the active exercise. */
export function EntryLine({ index, weight, amount, weightPlaceholder, amountPlaceholder, joiner, onWeight, onAmount, onLog, logLabel, disabled, children }: {
  index: number; weight: string; amount: string; weightPlaceholder: string; amountPlaceholder: string; joiner: string;
  onWeight: (value: string) => void; onAmount: (value: string) => void; onLog: () => void; logLabel: string; disabled?: boolean; children?: ReactNode;
}) {
  return <View style={styles.entry}>
    <View style={styles.entryRow}>
      <Text style={styles.margin}>{index}</Text>
      <TextInput accessibilityLabel={weightPlaceholder} value={weight} onChangeText={onWeight} placeholder={weightPlaceholder} placeholderTextColor={colors.textDim} keyboardType="decimal-pad" style={styles.field} />
      <Text style={styles.joiner}>{joiner}</Text>
      <TextInput accessibilityLabel={amountPlaceholder} value={amount} onChangeText={onAmount} placeholder={amountPlaceholder} placeholderTextColor={colors.textDim} keyboardType="decimal-pad" style={styles.field} />
      <Pressable accessibilityRole="button" accessibilityLabel={logLabel} disabled={disabled} onPress={onLog} style={[styles.log, disabled && styles.disabled]}><Text style={styles.logText}>{logLabel}</Text></Pressable>
    </View>
    {children && <View style={styles.entryTools}>{children}</View>}
  </View>;
}

export const notepadStyles = StyleSheet.create({
  block: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
  blockActive: { borderColor: `${colors.workoutsNav}66` },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  exerciseName: { flex: 1, color: colors.text, fontSize: 17, fontFamily: font.bold },
  hint: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 19 },
  noteInput: { color: colors.text, fontSize: 14, fontFamily: font.regular, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  addExercise: { borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  addExerciseText: { color: colors.workoutsNav, fontSize: 15, fontFamily: font.bold },
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  pill: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  pillActive: { backgroundColor: colors.workoutsNav },
  pillText: { color: colors.text, fontSize: 13, fontFamily: font.semibold },
  pillTextActive: { color: colors.background },
  disabled: { opacity: 0.4 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 150 },
  tagText: { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.3 },
  header: { gap: 6, marginBottom: 4 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headerClock: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { color: colors.textMuted, fontSize: 14, fontFamily: font.medium },
  clock: { color: colors.text, fontSize: 14, fontFamily: font.semibold, fontVariant: ['tabular-nums'] },
  name: { color: colors.text, fontSize: 28, lineHeight: 34, fontFamily: font.extrabold, letterSpacing: -0.6, paddingVertical: 2, paddingHorizontal: 0 },
  rule: { height: 2, borderRadius: 1, backgroundColor: colors.workoutsNav, width: 36, marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  lineEditing: { backgroundColor: `${colors.workoutsNav}14` },
  margin: { width: 22, color: colors.textDim, fontSize: 13, fontFamily: font.semibold, fontVariant: ['tabular-nums'], textAlign: 'right' },
  lineText: { color: colors.text, fontSize: 16, fontFamily: font.semibold, fontVariant: ['tabular-nums'] },
  lineMeta: { flex: 1, color: colors.textMuted, fontSize: 12, fontFamily: font.regular, textAlign: 'right' },
  mark: { color: colors.workoutsNav, fontSize: 11, fontFamily: font.bold, borderWidth: 1, borderColor: `${colors.workoutsNav}88`, borderRadius: 4, paddingHorizontal: 4 },
  planned: { color: colors.textDim, fontFamily: font.medium },
  rest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  restText: { color: colors.workoutsNav, fontSize: 15, fontFamily: font.bold, fontVariant: ['tabular-nums'] },
  entry: { paddingTop: 10, gap: 8 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, color: colors.text, fontSize: 16, fontFamily: font.semibold, fontVariant: ['tabular-nums'], textAlign: 'center', paddingHorizontal: 8 },
  joiner: { color: colors.textMuted, fontSize: 16, fontFamily: font.semibold },
  log: { minHeight: 44, minWidth: 64, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: colors.workoutsNav, alignItems: 'center', justifyContent: 'center' },
  logText: { color: colors.background, fontSize: 15, fontFamily: font.bold },
  entryTools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 32 },
});
