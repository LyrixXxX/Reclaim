import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { HistoryPages } from '@/components/history-pages';
import { useNow } from '@/hooks/use-now';
import { doseDayPart, stackDoseKey, stackMembersForToday, stackNeedsReview, type ScheduledDose } from '@/lib/medication-regimen';
import { formatMedicationTime, parse12HourTime, scheduleLabel, splitMedicationTime, type Meridiem } from '@/lib/medications';
import { localDateKey } from '@/lib/progress';
import { supplementDosesForDate, supplementEventDay, supplementEvents, validateSupplementDraft, visibleSupplements, type SupplementDraft } from '@/lib/supplements';
import type { Medication, MedicationEvent, SupplementStack } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

type Tab = 'today' | 'regimen' | 'history';
type Filter = 'active' | 'as_needed' | 'archived';
type TimeDraft = { hour: string; minute: string; period: Meridiem };
const DAYS = [{ id: 1, label: 'Sun' }, { id: 2, label: 'Mon' }, { id: 3, label: 'Tue' }, { id: 4, label: 'Wed' }, { id: 5, label: 'Thu' }, { id: 6, label: 'Fri' }, { id: 7, label: 'Sat' }];
const PARTS = ['Overnight', 'Morning', 'Afternoon', 'Evening'] as const;
const supplementIcon = require('../../assets/images/medication-supplement-icon.png');
const morningIcon = require('../../assets/images/medication-morning-icon.png');
const eveningIcon = require('../../assets/images/medication-evening-icon.png');

export default function SupplementsScreen() {
  const { medications = [], medicationEvents = [], supplementStacks = [], saveSupplement, archiveSupplement,
    logSupplement, deleteSupplementLog, saveSupplementStack, deleteSupplementStack } = useTrackers();
  const [tab, setTab] = useState<Tab>('today');
  const [filter, setFilter] = useState<Filter>('active');
  const [editing, setEditing] = useState<Medication | null | undefined>();
  const [stackEditing, setStackEditing] = useState<SupplementStack | null | undefined>();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [asNeededOpen, setAsNeededOpen] = useState(false);
  const [undo, setUndo] = useState<{ ids: string[]; label: string } | null>(null);
  const today = localDateKey(new Date(useNow(60_000)));
  const supplements = visibleSupplements(medications);
  const events = supplementEvents(medications, medicationEvents);
  const doses = supplementDosesForDate(medications, medicationEvents, today);
  const taken = doses.filter((dose) => dose.status === 'taken').length;
  const skipped = doses.filter((dose) => dose.status === 'skipped').length;
  const remaining = doses.length - taken - skipped;
  const asNeeded = supplements.filter((item) => !item.archived && (item.schedule.type === 'as_needed' || item.schedule.type === 'interval'));
  const scheduledKeys = new Set(supplementStacks.flatMap((stack) => stackMembersForToday(stack, doses).map((dose) => stackDoseKey(dose.medication.id, dose.time))));
  const regimen = supplements.filter((item) => filter === 'archived' ? item.archived
    : !item.archived && (filter === 'active' || item.schedule.type === 'as_needed' || item.schedule.type === 'interval'));
  const history = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const record = (items: { item: Medication; key?: string }[], outcome: 'taken' | 'skipped', label: string) => {
    if (outcome === 'taken') {
      Alert.alert(items.length > 1 ? `Take ${items.length} supplements?` : `Take ${label}?`,
        items.length > 1 ? 'Confirm that you took these supplement doses.' : 'Confirm that you took this supplement dose.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes, taken', onPress: () => commitRecord(items, outcome, label) }]);
      return;
    }
    commitRecord(items, outcome, label);
  };
  const commitRecord = (items: { item: Medication; key?: string }[], outcome: 'taken' | 'skipped', label: string) => {
    if (items.some(({ key }) => key && !key.startsWith(`${localDateKey()}T`))) {
      Alert.alert('The day changed', 'Please review today’s schedule again.'); return;
    }
    const ids = items.map(({ item, key }) => {
      const id = Crypto.randomUUID();
      logSupplement(item.id, id, outcome, key);
      return id;
    });
    if (ids.length) setUndo({ ids, label: `${label} · ${outcome === 'taken' ? 'Taken' : 'Skipped'}` });
  };
  const doseRow = (dose: ScheduledDose) => <View key={stackDoseKey(dose.medication.id, dose.time)} style={styles.doseRow}>
    <Image source={supplementIcon} style={styles.itemIcon} accessibilityLabel="Supplement" />
    <View style={styles.flex}><Text style={styles.doseName}>{dose.medication.name}</Text><Text style={styles.meta}>{dose.medication.strength ? `${dose.medication.strength} · ` : ''}{formatMedicationTime(dose.time)}</Text></View>
    {dose.status ? <Text style={[styles.status, dose.status === 'taken' ? styles.taken : styles.skipped]}>{dose.status === 'taken' ? '✓ Taken' : 'Skipped'}</Text>
      : <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={`Take ${dose.medication.name} at ${formatMedicationTime(dose.time)}`} onPress={() => record([{ item: dose.medication, key: dose.key }], 'taken', dose.medication.name)} style={styles.takeButton}><Text style={styles.takeText}>Take</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Skip ${dose.medication.name} at ${formatMedicationTime(dose.time)}`} onPress={() => record([{ item: dose.medication, key: dose.key }], 'skipped', dose.medication.name)} style={styles.skipButton}><Text style={styles.skipText}>Skip</Text></Pressable></View>}
  </View>;

  return <SafeAreaView style={styles.safe} edges={['top']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>VITAMINS &amp; SUPPLEMENTS</Text><Text style={styles.subtitle}>Stay on track, your way.</Text>
    <View style={styles.tabs}>{(['today', 'regimen', 'history'] as const).map((choice) => <Pressable key={choice} accessibilityRole="tab" accessibilityState={{ selected: tab === choice }} onPress={() => setTab(choice)} style={[styles.tab, tab === choice && styles.tabSelected]}><Text style={[styles.tabText, tab === choice && styles.tabTextSelected]}>{choice === 'today' ? 'Today' : choice === 'regimen' ? 'Regimen' : 'History'}</Text></Pressable>)}</View>
    {undo && <View style={styles.undo}><View style={styles.flex}><Text style={styles.doseName}>Recorded</Text><Text style={styles.meta}>{undo.label}</Text></View><Pressable accessibilityRole="button" onPress={() => { undo.ids.forEach(deleteSupplementLog); setUndo(null); }} style={styles.undoButton}><Text style={styles.linkText}>Undo</Text></Pressable></View>}
    {tab === 'today' && <>
      <View style={styles.progress}><View style={styles.progressTop}><View style={styles.flex}><Text style={styles.sectionTitle}>Today’s progress</Text><Text style={styles.body}>{taken} of {doses.length} scheduled doses taken</Text></View><Text style={styles.percent}>{doses.length ? Math.round(taken / doses.length * 100) : 0}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${doses.length ? taken / doses.length * 100 : 0}%` }]} /></View><View style={styles.stats}><Text style={styles.stat}>✓ {taken} taken</Text><Text style={styles.stat}>◷ {remaining} remaining</Text><Text style={styles.stat}>× {skipped} skipped</Text></View></View>
      {!doses.length && <Text style={styles.empty}>No scheduled supplement doses today. Add a schedule in Regimen, or log an as-needed supplement below.</Text>}
      {PARTS.map((part) => {
        const partDoses = doses.filter((dose) => doseDayPart(dose.time) === part);
        if (!partDoses.length) return null;
        const stacks = supplementStacks.map((stack) => ({ stack, members: stackMembersForToday(stack, partDoses) })).filter(({ members }) => members.length);
        const standalone = partDoses.filter((dose) => !scheduledKeys.has(stackDoseKey(dose.medication.id, dose.time)));
        return <View key={part} style={styles.dayPart}><Pressable accessibilityRole="button" accessibilityState={{ expanded: !collapsed[part] }} onPress={() => setCollapsed((current) => ({ ...current, [part]: !current[part] }))} style={styles.partHead}>{part === 'Morning' || part === 'Evening' || part === 'Overnight' ? <Image source={part === 'Morning' ? morningIcon : eveningIcon} style={styles.partIcon} /> : <Text style={styles.afternoonIcon}>◉</Text>}<Text style={styles.partName}>{part}</Text><Text style={styles.partCount}>{partDoses.length} {partDoses.length === 1 ? 'dose' : 'doses'}  {collapsed[part] ? '⌄' : '⌃'}</Text></Pressable>{!collapsed[part] && <View style={styles.partBody}>
          {stacks.map(({ stack, members }) => <View key={stack.id} style={styles.stackCard}><Text style={styles.stackTitle}>{stack.name}</Text><Text style={styles.meta}>{members.length} supplement doses · {members.filter((dose) => dose.status === 'taken').length} taken</Text><View style={styles.actions}>{members.some((dose) => !dose.status) && <><Pressable accessibilityRole="button" onPress={() => record(members.filter((dose) => !dose.status).map((dose) => ({ item: dose.medication, key: dose.key })), 'taken', stack.name)} style={styles.takeButton}><Text style={styles.takeText}>Take remaining</Text></Pressable><Pressable accessibilityRole="button" onPress={() => record(members.filter((dose) => !dose.status).map((dose) => ({ item: dose.medication, key: dose.key })), 'skipped', stack.name)} style={styles.skipButton}><Text style={styles.skipText}>Skip</Text></Pressable></>}</View>{members.map(doseRow)}</View>)}
          {standalone.map(doseRow)}
        </View>}</View>;
      })}
      {!!asNeeded.length && <View style={styles.dayPart}><Pressable accessibilityRole="button" accessibilityState={{ expanded: asNeededOpen }} onPress={() => setAsNeededOpen(!asNeededOpen)} style={styles.partHead}><Text style={styles.partName}>As needed & interval</Text><Text style={styles.partCount}>{asNeeded.length}  {asNeededOpen ? '⌃' : '⌄'}</Text></Pressable>{asNeededOpen && <View style={styles.partBody}>{asNeeded.map((item) => <View key={item.id} style={styles.doseRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item.name}</Text><Text style={styles.meta}>{scheduleLabel(item.schedule)} · {events.filter((event) => event.medicationId === item.id && supplementEventDay(event) === today && event.outcome === 'taken').length} taken today</Text></View><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => record([{ item }], 'taken', item.name)} style={styles.takeButton}><Text style={styles.takeText}>Take</Text></Pressable><Pressable accessibilityRole="button" onPress={() => record([{ item }], 'skipped', item.name)} style={styles.skipButton}><Text style={styles.skipText}>Skip</Text></Pressable></View></View>)}</View>}</View>}
      <Text style={styles.footnote}>This is a personal record, not a supplement recommendation or treatment plan.</Text>
    </>}
    {tab === 'regimen' && <>
      <Text style={styles.sectionTitle}>Your regimen</Text><Text style={styles.body}>Set up the vitamins and supplements you choose to use.</Text>
      <View style={styles.filters}>{([['active', 'Active'], ['as_needed', 'As needed'], ['archived', 'Archived']] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: filter === id }} onPress={() => setFilter(id)} style={[styles.filter, filter === id && styles.filterSelected]}><Text style={[styles.filterText, filter === id && styles.tabTextSelected]}>{label}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.primary}><Text style={styles.primaryText}>+ Add vitamin or supplement</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setStackEditing(null)} style={styles.secondary}><Text style={styles.secondaryText}>+ Create supplement stack</Text></Pressable>
      {filter === 'active' && !!supplementStacks.length && <><Text style={styles.sectionLabel}>SUPPLEMENT STACKS</Text>{supplementStacks.map((stack) => <Pressable key={stack.id} accessibilityRole="button" onPress={() => setStackEditing(stack)} style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{stack.name}</Text><Text style={styles.meta}>{stack.members.length} dose slots{stackNeedsReview(stack, supplements) ? ' · Needs review' : ''}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}</>}
      <Text style={styles.sectionLabel}>{filter === 'archived' ? 'ARCHIVED' : 'ACTIVE'} ITEMS · {regimen.length}</Text>
      {regimen.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => setEditing(item)} style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item.name}</Text><Text style={styles.meta}>{item.strength ? `${item.strength} · ` : ''}{scheduleLabel(item.schedule)}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}
      {!regimen.length && <Text style={styles.empty}>No supplements in this view yet.</Text>}
    </>}
    {tab === 'history' && <><Text style={styles.sectionTitle}>Dose history</Text><Text style={styles.body}>Taken and skipped supplements. Remove a mistaken entry without changing the regimen.</Text>{history.length ? <HistoryPages items={history} pageSize={20}>{(page) => page.map((event) => <HistoryRow key={event.id} event={event} item={supplements.find((entry) => entry.id === event.medicationId)} onRemove={() => Alert.alert('Remove this log?', 'This removes only this supplement dose record.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => deleteSupplementLog(event.id) }])} />)}</HistoryPages> : <Text style={styles.empty}>No supplement doses logged yet.</Text>}</>}
  </KeyboardSafeScrollView>
  {editing !== undefined && <SupplementEditor key={editing?.id ?? 'new'} item={editing} onClose={() => setEditing(undefined)} onSave={(draft) => { saveSupplement(draft, Crypto.randomUUID()); setEditing(undefined); }} onArchive={(id, archived) => { archiveSupplement(id, archived); setEditing(undefined); }} />}
  {stackEditing !== undefined && <StackEditor key={stackEditing?.id ?? 'new'} stack={stackEditing} stacks={supplementStacks} supplements={supplements} onClose={() => setStackEditing(undefined)} onSave={(value) => { const problem = saveSupplementStack(value); if (problem) Alert.alert('Check stack', problem); else setStackEditing(undefined); }} onDelete={(id) => { deleteSupplementStack(id); setStackEditing(undefined); }} />}
  </SafeAreaView>;
}

function HistoryRow({ event, item, onRemove }: { event: MedicationEvent; item?: Medication; onRemove: () => void }) {
  return <View style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item?.name ?? 'Removed supplement'} · {event.outcome === 'taken' ? 'Taken' : event.outcome === 'skipped' ? 'Skipped' : 'Snoozed'}</Text><Text style={styles.meta}>{new Date(event.occurredAt).toLocaleString()}{event.scheduledFor ? ` · Scheduled ${formatMedicationTime(event.scheduledFor.slice(11))}` : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove dose log" onPress={onRemove} style={styles.removeButton}><Text style={styles.meta}>Remove</Text></Pressable></View>;
}

function SupplementEditor({ item, onClose, onSave, onArchive }: { item: Medication | null; onClose: () => void; onSave: (draft: SupplementDraft) => void; onArchive: (id: string, archived: boolean) => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [serving, setServing] = useState(item?.strength ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [type, setType] = useState<'daily' | 'weekly' | 'interval' | 'as_needed'>(item?.schedule.type ?? 'daily');
  const [times, setTimes] = useState<TimeDraft[]>(item?.schedule.times.length ? item.schedule.times.map(splitMedicationTime) : [{ hour: '9', minute: '00', period: 'AM' }]);
  const [weekdays, setWeekdays] = useState(item?.schedule.weekdays ?? [2, 3, 4, 5, 6]);
  const [intervalHours, setIntervalHours] = useState(String(item?.schedule.intervalHours ?? 8));
  const [error, setError] = useState('');
  const updateTime = (index: number, update: Partial<TimeDraft>) => setTimes((current) => current.map((time, position) => position === index ? { ...time, ...update } : time));
  const save = () => {
    const normalized = type === 'daily' || type === 'weekly' ? times.map(({ hour, minute, period }) => parse12HourTime(hour, minute, period) ?? 'invalid') : [];
    const draft: SupplementDraft = { id: item?.id, name, serving, notes, scheduleType: type, times: normalized, weekdays, intervalHours: Number(intervalHours) };
    const problem = validateSupplementDraft(draft);
    if (problem) { setError(problem); return; }
    onSave(draft);
  };
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.modalContent}>
    <Text style={styles.sectionTitle}>{item ? 'Edit supplement' : 'Add vitamin or supplement'}</Text><Text style={styles.body}>Choose your own schedule. Reclaim does not recommend what or how much to take.</Text>
    <Text style={styles.fieldLabel}>NAME</Text><TextInput accessibilityLabel="Supplement name" value={name} onChangeText={setName} placeholder="e.g. Creatine" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>SERVING LABEL · OPTIONAL</Text><TextInput accessibilityLabel="Serving label" value={serving} onChangeText={setServing} placeholder="e.g. 5 g" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>SCHEDULE</Text><View style={styles.filters}>{([['daily', 'Every day'], ['weekly', 'Selected days'], ['interval', 'Every few hours'], ['as_needed', 'As needed']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: type === value }} onPress={() => setType(value)} style={[styles.filter, type === value && styles.filterSelected]}><Text style={[styles.filterText, type === value && styles.tabTextSelected]}>{label}</Text></Pressable>)}</View>
    {type === 'interval' && <><Text style={styles.fieldLabel}>HOURS BETWEEN SERVINGS</Text><TextInput accessibilityLabel="Hours between servings" value={intervalHours} onChangeText={setIntervalHours} keyboardType="number-pad" style={styles.input} /><Text style={styles.body}>Log each serving when you take it. This does not create a reminder.</Text></>}
    {type === 'weekly' && <><Text style={styles.fieldLabel}>DAYS</Text><View style={styles.filters}>{DAYS.map((day) => <Pressable key={day.id} accessibilityRole="checkbox" accessibilityState={{ checked: weekdays.includes(day.id) }} onPress={() => setWeekdays((current) => current.includes(day.id) ? current.filter((value) => value !== day.id) : [...current, day.id])} style={[styles.weekday, weekdays.includes(day.id) && styles.filterSelected]}><Text style={[styles.filterText, weekdays.includes(day.id) && styles.tabTextSelected]}>{day.label}</Text></Pressable>)}</View></>}
    {(type === 'daily' || type === 'weekly') && <><Text style={styles.fieldLabel}>DOSE TIMES</Text><Text style={styles.body}>Add a separate time for each serving you want to track during the day.</Text>{times.map((time, index) => <View key={index} style={styles.timeRow}><TextInput accessibilityLabel={`Dose ${index + 1} hour`} value={time.hour} onChangeText={(hour) => updateTime(index, { hour })} keyboardType="number-pad" maxLength={2} placeholder="9" placeholderTextColor={colors.textDim} style={[styles.input, styles.timeInput]} /><Text style={styles.timeColon}>:</Text><TextInput accessibilityLabel={`Dose ${index + 1} minute`} value={time.minute} onChangeText={(minute) => updateTime(index, { minute })} keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={colors.textDim} style={[styles.input, styles.timeInput]} /><Pressable accessibilityRole="button" onPress={() => updateTime(index, { period: time.period === 'AM' ? 'PM' : 'AM' })} style={styles.period}><Text style={styles.filterText}>{time.period}</Text></Pressable>{times.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Remove dose time ${index + 1}`} onPress={() => setTimes((current) => current.filter((_, position) => position !== index))} style={styles.removeButton}><Text style={styles.meta}>Remove</Text></Pressable>}</View>)}<Pressable accessibilityRole="button" onPress={() => setTimes((current) => [...current, { hour: '9', minute: '00', period: 'AM' }])} style={styles.secondary}><Text style={styles.secondaryText}>+ Add another time</Text></Pressable></>}
    <Text style={styles.fieldLabel}>PERSONAL NOTES · OPTIONAL</Text><TextInput accessibilityLabel="Supplement notes" value={notes} onChangeText={setNotes} multiline style={[styles.input, styles.notes]} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" onPress={save} style={styles.primary}><Text style={styles.primaryText}>Save supplement</Text></Pressable>
    {!!item && <Pressable accessibilityRole="button" onPress={() => Alert.alert(item.archived ? 'Restore supplement?' : 'Archive supplement?', 'Dose history stays saved.', [{ text: 'Cancel', style: 'cancel' }, { text: item.archived ? 'Restore' : 'Archive', onPress: () => onArchive(item.id, !item.archived) }])} style={styles.secondary}><Text style={styles.secondaryText}>{item.archived ? 'Restore supplement' : 'Archive supplement'}</Text></Pressable>}
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
  </KeyboardSafeScrollView></SafeAreaView></Modal>;
}

function StackEditor({ stack, stacks, supplements, onClose, onSave, onDelete }: { stack: SupplementStack | null; stacks: SupplementStack[]; supplements: Medication[]; onClose: () => void; onSave: (value: SupplementStack) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(stack?.name ?? '');
  const [selected, setSelected] = useState(stack?.members.map(({ medicationId, time }) => stackDoseKey(medicationId, time)) ?? []);
  const options = supplements.filter((item) => !item.archived && (item.schedule.type === 'daily' || item.schedule.type === 'weekly')).flatMap((item) => item.schedule.times.map((time) => ({ item, time, key: stackDoseKey(item.id, time) }))).sort((a, b) => a.time.localeCompare(b.time));
  const unavailable = new Set(stacks.filter((entry) => entry.id !== stack?.id).flatMap((entry) => entry.members.map(({ medicationId, time }) => stackDoseKey(medicationId, time))));
  const stale = selected.filter((key) => !options.some((option) => option.key === key));
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView contentContainerStyle={styles.modalContent}>
    <Text style={styles.sectionTitle}>{stack ? 'Edit supplement stack' : 'Create supplement stack'}</Text><Text style={styles.body}>Group scheduled servings you usually take together. You can still mark each one separately.</Text>
    <Text style={styles.fieldLabel}>STACK NAME</Text><TextInput accessibilityLabel="Stack name" value={name} onChangeText={setName} placeholder="Morning stack" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>SUPPLEMENT DOSE TIMES</Text>{options.map(({ item, time, key }) => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(key), disabled: unavailable.has(key) }} disabled={unavailable.has(key)} onPress={() => setSelected((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} style={[styles.choice, selected.includes(key) && styles.choiceSelected]}><Text style={styles.doseName}>{selected.includes(key) ? '✓' : '○'}  {item.name} · {formatMedicationTime(time)}{unavailable.has(key) ? ' · In another stack' : ''}</Text></Pressable>)}
    {stale.map((key) => <Pressable key={key} accessibilityRole="button" onPress={() => setSelected((current) => current.filter((value) => value !== key))} style={styles.choice}><Text style={styles.meta}>Unavailable dose time · Tap to remove</Text></Pressable>)}
    {!options.length && <Text style={styles.empty}>Add a supplement with a daily or selected-days schedule first.</Text>}
    <Pressable accessibilityRole="button" onPress={() => onSave({ id: stack?.id ?? Crypto.randomUUID(), name, members: selected.map((key) => { const [medicationId, time] = key.split('\u0000'); return { medicationId, time }; }) })} style={styles.primary}><Text style={styles.primaryText}>Save stack</Text></Pressable>
    {!!stack && <Pressable accessibilityRole="button" onPress={() => Alert.alert(`Delete ${stack.name}?`, 'This removes the stack, not its supplement items or dose history.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete stack', style: 'destructive', onPress: () => onDelete(stack.id) }])} style={styles.secondary}><Text style={styles.secondaryText}>Delete stack</Text></Pressable>}
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
  </ScrollView></SafeAreaView></Modal>;
}

const accent = colors.healthNav;
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 70 }, modalContent: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 70 },
  eyebrow: { color: accent, fontSize: 21, fontWeight: '900', letterSpacing: 1, marginTop: 26 }, subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 8, marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 7, marginBottom: 20 }, tab: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 13, borderWidth: 1, borderColor: colors.border }, tabSelected: { backgroundColor: accent, borderColor: accent }, tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' }, tabTextSelected: { color: colors.background },
  progress: { backgroundColor: colors.surface, borderColor: accent, borderWidth: 1, borderRadius: 18, padding: 17, marginBottom: 22 }, progressTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 6 }, body: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5 }, percent: { color: colors.text, fontSize: 26, fontWeight: '900' }, track: { height: 9, backgroundColor: colors.surfaceRaised, borderRadius: 8, overflow: 'hidden', marginTop: 18 }, fill: { height: 9, backgroundColor: accent }, stats: { flexDirection: 'row', gap: 6, marginTop: 17 }, stat: { flex: 1, textAlign: 'center', color: colors.text, backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 11, fontSize: 11, fontWeight: '800' },
  dayPart: { marginBottom: 16 }, partHead: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }, partIcon: { width: 38, height: 38, borderRadius: 9 }, afternoonIcon: { width: 38, color: accent, fontSize: 24, textAlign: 'center' }, partName: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '900' }, partCount: { color: colors.textMuted, fontSize: 12, fontWeight: '800' }, partBody: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  doseRow: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderBottomWidth: 1, borderBottomColor: colors.border }, itemIcon: { width: 44, height: 44, borderRadius: 9 }, flex: { flex: 1 }, doseName: { color: colors.text, fontSize: 15, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 }, actions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, takeButton: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderColor: accent, borderWidth: 1, borderRadius: 10 }, takeText: { color: accent, fontSize: 13, fontWeight: '900' }, skipButton: { minHeight: 44, minWidth: 55, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderColor: colors.border, borderWidth: 1, borderRadius: 10 }, skipText: { color: colors.text, fontSize: 12, fontWeight: '800' }, status: { fontSize: 12, fontWeight: '900' }, taken: { color: accent }, skipped: { color: colors.textMuted },
  stackCard: { paddingTop: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border }, stackTitle: { color: accent, fontSize: 14, fontWeight: '900' }, empty: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginVertical: 20 }, footnote: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 15 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 17, marginBottom: 5 }, filter: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }, filterSelected: { backgroundColor: accent, borderColor: accent }, filterText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' }, primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: accent, borderRadius: 13, marginTop: 15, paddingHorizontal: 12 }, primaryText: { color: colors.background, fontWeight: '900', fontSize: 14 }, secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 13, marginTop: 10, paddingHorizontal: 12 }, secondaryText: { color: colors.text, fontWeight: '800', fontSize: 13 }, sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 24, marginBottom: 10 }, regimenRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 7 }, chevron: { color: accent, fontSize: 24 },
  undo: { flexDirection: 'row', alignItems: 'center', borderColor: accent, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 16 }, undoButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, linkText: { color: accent, fontWeight: '900' }, removeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '900', marginTop: 19, marginBottom: 7 }, input: { minHeight: 50, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 }, notes: { minHeight: 85, textAlignVertical: 'top', paddingTop: 12 }, timeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 }, timeInput: { width: 54, textAlign: 'center' }, timeColon: { color: colors.text, fontSize: 20, fontWeight: '800' }, period: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 12, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }, weekday: { minHeight: 44, minWidth: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 10, borderWidth: 1, borderColor: colors.border }, error: { color: colors.danger, marginTop: 12 }, choice: { minHeight: 52, justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8 }, choiceSelected: { borderColor: accent },
});
