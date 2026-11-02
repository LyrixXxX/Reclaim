import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { MainScreenHeader } from '@/components/main-screen-header';
import { LabelCamera, type FramedLabelPhoto } from '@/components/label-camera';
import { HistoryPages } from '@/components/history-pages';
import { useNow } from '@/hooks/use-now';
import { doseDayPart, stackDoseKey, stackMembersForToday, stackNeedsReview, type ScheduledDose } from '@/lib/medication-regimen';
import { formatMedicationTime, parse12HourTime, scheduleLabel, splitMedicationTime, type Meridiem } from '@/lib/medications';
import { localDateKey } from '@/lib/progress';
import { nutrientDefinition, searchNutrients, toCanonicalNutrientAmount } from '@/lib/nutrient-catalog';
import { parseSupplementLabel } from '@/lib/nutrition-ai';
import { perUnitNutrients, type SupplementLabelResult } from '@/lib/supplement-label';
import { searchSupplements, type SupplementChoice } from '@/lib/supplement-catalog';
import { supplementDosesForDate, supplementEventDay, supplementEvents, validateSupplementDraft, visibleSupplements, type SupplementDraft } from '@/lib/supplements';
import { allDayPartDosesCompleted, dayPartCollapsed, dayPartCompletedByRecording, dayPartDoseId } from '@/lib/supplement-daypart';
import type { Medication, MedicationEvent, SupplementStack } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';
import { Chevron } from '@/components/icon';

type Tab = 'today' | 'regimen' | 'history';
type Filter = 'active' | 'as_needed' | 'archived';
type TimeDraft = { hour: string; minute: string; period: Meridiem };
const DAYS = [{ id: 1, label: 'Sun' }, { id: 2, label: 'Mon' }, { id: 3, label: 'Tue' }, { id: 4, label: 'Wed' }, { id: 5, label: 'Thu' }, { id: 6, label: 'Fri' }, { id: 7, label: 'Sat' }];
const PARTS = ['Overnight', 'Morning', 'Afternoon', 'Evening'] as const;
const supplementIcon = require('../../../assets/images/medication-supplement-icon.png');
const morningIcon = require('../../../assets/images/medication-morning-icon.png');
const eveningIcon = require('../../../assets/images/medication-evening-icon.png');

export default function SupplementsScreen() {
  const { medications = [], medicationEvents = [], supplementStacks = [], customNutrients = [], saveSupplement, archiveSupplement,
    logSupplement, deleteSupplementLog, markSupplementLogSkipped, saveSupplementStack, deleteSupplementStack } = useTrackers();
  const [tab, setTab] = useState<Tab>('today');
  const [filter, setFilter] = useState<Filter>('active');
  const [editing, setEditing] = useState<Medication | null | undefined>();
  const [stackEditing, setStackEditing] = useState<SupplementStack | null | undefined>();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [asNeededOpen, setAsNeededOpen] = useState(false);
  const [undo, setUndo] = useState<{ ids: string[]; label: string } | null>(null);
  const [pendingTake, setPendingTake] = useState<{ items: { item: Medication; key?: string }[]; label: string; units: string[] } | null>(null);
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
      setPendingTake({ items, label, units: items.map(({ item }) => String(item.defaultUnitsTaken ?? 1)) });
      return;
    }
    commitRecord(items, outcome, label);
  };
  const commitRecord = (items: { item: Medication; key?: string }[], outcome: 'taken' | 'skipped', label: string, units?: number[]) => {
    if (items.some(({ key }) => key && !key.startsWith(`${localDateKey()}T`))) {
      Alert.alert('The day changed', 'Please review today’s schedule again.'); return;
    }
    const ids = items.map(({ item, key }, index) => {
      const id = Crypto.randomUUID();
      logSupplement(item.id, id, outcome, key, units?.[index]);
      return id;
    });
    const recordedIds = new Set(items.filter((entry): entry is { item: Medication; key: string } => Boolean(entry.key))
      .map(({ item, key }) => dayPartDoseId(item.id, key)));
    setCollapsed((current) => {
      const next = { ...current };
      for (const part of PARTS) {
        const partDoses = doses.filter((dose) => doseDayPart(dose.time) === part);
        if (dayPartCompletedByRecording(partDoses, recordedIds)) next[`${today}:${part}`] = true;
      }
      return next;
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
    <MainScreenHeader title="Supplements" subtitle="Vitamin and supplement schedules, doses, and history." accent={accent} />
    <View style={styles.tabs}>{(['today', 'regimen', 'history'] as const).map((choice) => <Pressable key={choice} accessibilityRole="tab" accessibilityState={{ selected: tab === choice }} onPress={() => setTab(choice)} style={[styles.tab, tab === choice && styles.tabSelected]}><Text style={[styles.tabText, tab === choice && styles.tabTextSelected]}>{choice === 'today' ? 'Today' : choice === 'regimen' ? 'Regimen' : 'History'}</Text></Pressable>)}</View>
    {undo && <View style={styles.undo}><View style={styles.flex}><Text style={styles.doseName}>Recorded</Text><Text style={styles.meta}>{undo.label}</Text></View><Pressable accessibilityRole="button" onPress={() => { undo.ids.forEach(deleteSupplementLog); setCollapsed({}); setUndo(null); }} style={styles.undoButton}><Text style={styles.linkText}>Undo</Text></Pressable></View>}
    {tab === 'today' && <>
      <View style={styles.progress}><View style={styles.progressTop}><View style={styles.flex}><Text style={styles.sectionTitle}>Today’s progress</Text><Text style={styles.body}>{taken} of {doses.length} scheduled doses taken</Text></View><Text style={styles.percent}>{doses.length ? Math.round(taken / doses.length * 100) : 0}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${doses.length ? taken / doses.length * 100 : 0}%` }]} /></View><View style={styles.stats}><Text style={styles.stat}>✓ {taken} taken</Text><Text style={styles.stat}>◷ {remaining} remaining</Text><Text style={styles.stat}>× {skipped} skipped</Text></View></View>
      {!doses.length && <Text style={styles.empty}>No scheduled supplement doses today. Add a schedule in Regimen, or log an as-needed supplement below.</Text>}
      {PARTS.map((part) => {
        const partDoses = doses.filter((dose) => doseDayPart(dose.time) === part);
        if (!partDoses.length) return null;
        const key = `${today}:${part}`;
        const allComplete = allDayPartDosesCompleted(partDoses);
        const isCollapsed = dayPartCollapsed(partDoses, collapsed[key]);
        const stacks = supplementStacks.map((stack) => ({ stack, members: stackMembersForToday(stack, partDoses) })).filter(({ members }) => members.length);
        const standalone = partDoses.filter((dose) => !scheduledKeys.has(stackDoseKey(dose.medication.id, dose.time)));
        return <View key={part} style={styles.dayPart}><Pressable accessibilityRole="button" accessibilityState={{ expanded: !isCollapsed }} onPress={() => setCollapsed((current) => { const next = { ...current }; const currentCollapsed = dayPartCollapsed(partDoses, current[key]); if (!allComplete && currentCollapsed) delete next[key]; else next[key] = !currentCollapsed; return next; })} style={styles.partHead}>{part === 'Morning' || part === 'Evening' || part === 'Overnight' ? <Image source={part === 'Morning' ? morningIcon : eveningIcon} style={styles.partIcon} /> : <Text style={styles.afternoonIcon}>◉</Text>}<Text style={styles.partName}>{part}</Text><View style={styles.partMeta}><Text style={styles.partCount}>{allComplete ? 'All done' : `${partDoses.length} ${partDoses.length === 1 ? 'dose' : 'doses'}`}</Text><Chevron direction={isCollapsed ? 'down' : 'up'} size={16} /></View></Pressable>{!isCollapsed && <View style={styles.partBody}>
          {stacks.map(({ stack, members }) => <View key={stack.id} style={styles.stackCard}><Text style={styles.stackTitle}>{stack.name}</Text><Text style={styles.meta}>{members.length} supplement doses · {members.filter((dose) => dose.status === 'taken').length} taken</Text><View style={styles.actions}>{members.some((dose) => !dose.status) && <><Pressable accessibilityRole="button" onPress={() => record(members.filter((dose) => !dose.status).map((dose) => ({ item: dose.medication, key: dose.key })), 'taken', stack.name)} style={styles.takeButton}><Text style={styles.takeText}>Take remaining</Text></Pressable><Pressable accessibilityRole="button" onPress={() => record(members.filter((dose) => !dose.status).map((dose) => ({ item: dose.medication, key: dose.key })), 'skipped', stack.name)} style={styles.skipButton}><Text style={styles.skipText}>Skip</Text></Pressable></>}</View>{members.map(doseRow)}</View>)}
          {standalone.map(doseRow)}
        </View>}</View>;
      })}
      {!!asNeeded.length && <View style={styles.dayPart}><Pressable accessibilityRole="button" accessibilityState={{ expanded: asNeededOpen }} onPress={() => setAsNeededOpen(!asNeededOpen)} style={styles.partHead}><Text style={styles.partName}>As needed & interval</Text><View style={styles.partMeta}><Text style={styles.partCount}>{asNeeded.length}</Text><Chevron direction={asNeededOpen ? 'up' : 'down'} size={16} /></View></Pressable>{asNeededOpen && <View style={styles.partBody}>{asNeeded.map((item) => <View key={item.id} style={styles.doseRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item.name}</Text><Text style={styles.meta}>{scheduleLabel(item.schedule)} · {events.filter((event) => event.medicationId === item.id && supplementEventDay(event) === today && event.outcome === 'taken').length} taken today</Text></View><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => record([{ item }], 'taken', item.name)} style={styles.takeButton}><Text style={styles.takeText}>Take</Text></Pressable><Pressable accessibilityRole="button" onPress={() => record([{ item }], 'skipped', item.name)} style={styles.skipButton}><Text style={styles.skipText}>Skip</Text></Pressable></View></View>)}</View>}</View>}
      <Text style={styles.footnote}>This is a personal record, not a supplement recommendation or treatment plan.</Text>
    </>}
    {tab === 'regimen' && <>
      <Text style={styles.sectionTitle}>Your regimen</Text><Text style={styles.body}>Set up the vitamins and supplements you choose to use.</Text>
      <View style={styles.filters}>{([['active', 'Active'], ['as_needed', 'As needed'], ['archived', 'Archived']] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: filter === id }} onPress={() => setFilter(id)} style={[styles.filter, filter === id && styles.filterSelected]}><Text style={[styles.filterText, filter === id && styles.tabTextSelected]}>{label}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.primary}><Text style={styles.primaryText}>+ Add vitamin or supplement</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setStackEditing(null)} style={styles.secondary}><Text style={styles.secondaryText}>+ Create supplement stack</Text></Pressable>
      {filter === 'active' && !!supplementStacks.length && <><Text style={styles.sectionLabel}>SUPPLEMENT STACKS</Text>{supplementStacks.map((stack) => <Pressable key={stack.id} accessibilityRole="button" onPress={() => setStackEditing(stack)} style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{stack.name}</Text><Text style={styles.meta}>{stack.members.length} dose slots{stackNeedsReview(stack, supplements) ? ' · Needs review' : ''}</Text></View><Chevron color={colors.textMuted} /></Pressable>)}</>}
      <Text style={styles.sectionLabel}>{filter === 'archived' ? 'ARCHIVED' : 'ACTIVE'} ITEMS · {regimen.length}</Text>
      {regimen.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => setEditing(item)} style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item.name}</Text><Text style={styles.meta}>{item.strength ? `${item.strength} · ` : ''}{scheduleLabel(item.schedule)}</Text></View><Chevron color={colors.textMuted} /></Pressable>)}
      {!regimen.length && <Text style={styles.empty}>No supplements in this view yet.</Text>}
    </>}
      {tab === 'history' && <><Text style={styles.sectionTitle}>Dose history</Text><Text style={styles.body}>Taken and skipped supplements. Correct a mistaken Take or remove an entry without changing the regimen.</Text>{history.length ? <HistoryPages items={history} pageSize={20}>{(page) => page.map((event) => <HistoryRow key={event.id} event={event} item={supplements.find((entry) => entry.id === event.medicationId)} onSkip={() => Alert.alert('Change to skipped?', 'This updates this dose in your supplement history. It does not change food totals.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Change to skipped', onPress: () => { markSupplementLogSkipped(event.id); setCollapsed({}); } }])} onRemove={() => Alert.alert('Remove this log?', 'This removes only this supplement dose record.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { deleteSupplementLog(event.id); setCollapsed({}); } }])} />)}</HistoryPages> : <Text style={styles.empty}>No supplement doses logged yet.</Text>}</>}
  </KeyboardSafeScrollView>
  {editing !== undefined && <SupplementEditor key={editing?.id ?? 'new'} item={editing} customNutrients={customNutrients} onClose={() => setEditing(undefined)} onSave={(draft) => { saveSupplement(draft, Crypto.randomUUID()); setEditing(undefined); }} onArchive={(id, archived) => { archiveSupplement(id, archived); setEditing(undefined); }} />}
  {stackEditing !== undefined && <StackEditor key={stackEditing?.id ?? 'new'} stack={stackEditing} stacks={supplementStacks} supplements={supplements} onClose={() => setStackEditing(undefined)} onSave={(value) => { const problem = saveSupplementStack(value); if (problem) Alert.alert('Check stack', problem); else setStackEditing(undefined); }} onDelete={(id) => { deleteSupplementStack(id); setStackEditing(undefined); }} />}
  <Modal visible={!!pendingTake} transparent animationType="fade" onRequestClose={() => setPendingTake(null)}><View style={styles.confirmScrim}><View style={styles.confirmCard}><Text style={styles.sectionTitle}>Confirm taken</Text><Text style={styles.body}>Enter the number of units you actually took. Nothing is recorded until you confirm.</Text><ScrollView style={styles.confirmItems} keyboardShouldPersistTaps="handled">{pendingTake?.items.map(({ item }, index) => <View key={`${item.id}-${index}`}><Text style={styles.fieldLabel}>{item.name} · UNITS TAKEN</Text><TextInput value={pendingTake.units[index]} onChangeText={(value) => setPendingTake((current) => current ? { ...current, units: current.units.map((old, position) => position === index ? value : old) } : null)} keyboardType="decimal-pad" style={styles.input} /></View>)}</ScrollView><Pressable style={styles.primary} onPress={() => { if (!pendingTake) return; const units = pendingTake.units.map(Number); if (units.some((value) => !Number.isFinite(value) || value <= 0)) return Alert.alert('Check units', 'Enter a positive number for each supplement.'); commitRecord(pendingTake.items, 'taken', pendingTake.label, units); setPendingTake(null); }}><Text style={styles.primaryText}>Confirm taken</Text></Pressable><Pressable style={styles.secondary} onPress={() => setPendingTake(null)}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View></View></Modal>
  </SafeAreaView>;
}

function HistoryRow({ event, item, onSkip, onRemove }: { event: MedicationEvent; item?: Medication; onSkip: () => void; onRemove: () => void }) {
  return <View style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item?.name ?? 'Removed supplement'} · {event.outcome === 'taken' ? 'Taken' : event.outcome === 'skipped' ? 'Skipped' : 'Snoozed'}</Text><Text style={styles.meta}>{new Date(event.occurredAt).toLocaleString()}{event.unitsTaken ? ` · ${event.unitsTaken} unit${event.unitsTaken === 1 ? '' : 's'}` : ''}{event.scheduledFor ? ` · Scheduled ${formatMedicationTime(event.scheduledFor.slice(11))}` : ''}</Text></View>{event.outcome === 'taken' && <Pressable accessibilityRole="button" accessibilityLabel="Change dose to skipped" onPress={onSkip} style={styles.removeButton}><Text style={styles.meta}>Skip</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Remove dose log" onPress={onRemove} style={styles.removeButton}><Text style={styles.meta}>Remove</Text></Pressable></View>;
}

function SupplementEditor({ item, customNutrients, onClose, onSave, onArchive }: { item: Medication | null; customNutrients: { id: string; name: string; unit: string }[]; onClose: () => void; onSave: (draft: SupplementDraft) => void; onArchive: (id: string, archived: boolean) => void }) {
  const [step, setStep] = useState<'choose' | 'details' | 'schedule' | 'review'>(item ? 'details' : 'choose');
  const [search, setSearch] = useState('');
  const [scan, setScan] = useState<SupplementLabelResult | null>(null);
  const [scanUnits, setScanUnits] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(item?.dosagePerUnit && item.dosagePerUnit !== 1));
  const [name, setName] = useState(item?.name ?? '');
  const [serving, setServing] = useState(item?.strength ?? '');
  const [dosage, setDosage] = useState(item?.dosagePerUnit == null ? '' : String(item.dosagePerUnit));
  const [dosageUnit, setDosageUnit] = useState(item?.dosageUnit ?? 'capsule');
  const [defaultUnits, setDefaultUnits] = useState(String(item?.defaultUnitsTaken ?? 1));
  const [profile, setProfile] = useState(item?.nutrientProfile ?? []);
  const [nutrientQuery, setNutrientQuery] = useState('');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [type, setType] = useState<'daily' | 'weekly' | 'interval' | 'as_needed'>(item?.schedule.type ?? 'daily');
  const [times, setTimes] = useState<TimeDraft[]>(item?.schedule.times.length ? item.schedule.times.map(splitMedicationTime) : [{ hour: '9', minute: '00', period: 'AM' }]);
  const [weekdays, setWeekdays] = useState(item?.schedule.weekdays ?? [2, 3, 4, 5, 6]);
  const [intervalHours, setIntervalHours] = useState(String(item?.schedule.intervalHours ?? 8));
  const [error, setError] = useState('');
  const choose = (choice?: SupplementChoice) => {
    setName(choice?.name ?? '');
    setDosage('1'); setDosageUnit('unit');
    setProfile((choice?.nutrientIds ?? []).map((id) => ({ nutrientId: id, amount: 0, unit: nutrientDefinition(id)!.unit })));
    setStep('details'); setError('');
  };
  const scanLabel = async (camera: boolean) => {
    if (scanBusy) return;
    if (camera) { setCameraVisible(true); return; }
    try {
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: .68, base64: true };
      const result = await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await analyzeLabel(asset.base64 ?? await new File(asset.uri).base64(), asset.mimeType ?? 'image/jpeg');
    } catch (cause) { Alert.alert('Could not scan label', cause instanceof Error ? cause.message : 'Try again or enter the label manually.'); }
  };
  const analyzeLabel = async (base64: string, mimeType: string) => {
    setScanBusy(true);
    try {
      const parsed = await parseSupplementLabel(base64, mimeType);
      setScan(parsed); setScanUnits(parsed.servingUnits ? String(parsed.servingUnits) : '');
      if (parsed.name && !name.trim()) setName(parsed.name);
      if (parsed.servingLabel) setServing(parsed.servingLabel);
      if (parsed.unitName) setDosageUnit(parsed.unitName);
      setDosage('1'); setStep('details');
    } catch (cause) { Alert.alert('Could not scan label', cause instanceof Error ? cause.message : 'Try again or enter the label manually.'); }
    finally { setScanBusy(false); }
  };
  const applyScan = () => {
    if (!scan) return;
    const servingUnits = Number(scanUnits);
    if (!Number.isInteger(servingUnits) || servingUnits < 1 || servingUnits > 100) return setError('Enter the number of capsules, tablets, scoops, or units in the printed serving before linking values.');
    try { setProfile(perUnitNutrients({ ...scan, servingUnits })); setError(''); }
    catch { setError('One scanned unit could not be converted safely. Enter that label amount manually instead.'); }
  };
  const updateTime = (index: number, update: Partial<TimeDraft>) => setTimes((current) => current.map((time, position) => position === index ? { ...time, ...update } : time));
  const save = () => {
    const normalized = type === 'daily' || type === 'weekly' ? times.map(({ hour, minute, period }) => parse12HourTime(hour, minute, period) ?? 'invalid') : [];
    const draft: SupplementDraft = { id: item?.id, name, serving, notes, scheduleType: type, times: normalized, weekdays, intervalHours: Number(intervalHours), dosagePerUnit: dosage.trim() ? Number(dosage) : undefined, dosageUnit, defaultUnitsTaken: Number(defaultUnits), nutrientProfile: profile };
    const problem = validateSupplementDraft(draft);
    if (problem) { setError(problem); return; }
    try { profile.forEach((value) => toCanonicalNutrientAmount(value.nutrientId, value.amount, value.unit, customNutrients)); } catch (error) { setError(error instanceof Error ? error.message : 'Check nutrient units.'); return; }
    onSave(draft);
  };
  return <><Modal visible={!cameraVisible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.modalContent}>
    <Text style={styles.sectionTitle}>{item ? 'Edit supplement' : 'Add vitamin or supplement'}</Text><Text style={styles.body}>{step === 'choose' ? 'Choose what you take. Reclaim never recommends a dose.' : step === 'details' ? 'Step 1 of 3 · Check the product and its label amounts.' : step === 'schedule' ? 'Step 2 of 3 · Choose when you take it.' : 'Step 3 of 3 · Review before saving.'}</Text>
    {step === 'choose' && <>
      <Text style={styles.fieldLabel}>FIND A VITAMIN OR SUPPLEMENT</Text><TextInput accessibilityLabel="Search supplements" value={search} onChangeText={setSearch} placeholder="Search vitamins, minerals, creatine…" placeholderTextColor={colors.textDim} style={styles.input} />
      {searchSupplements(search).slice(0, 16).map((choice) => <Pressable key={choice.id} accessibilityRole="button" onPress={() => choose(choice)} style={[styles.choice, styles.choiceRow]}><Text style={[styles.doseName, styles.flex]}>{choice.name}</Text><Chevron size={18} /></Pressable>)}
      <Pressable accessibilityRole="button" onPress={() => choose()} style={styles.secondary}><Text style={styles.secondaryText}>Other supplement</Text></Pressable>
      <Text style={styles.fieldLabel}>OR SCAN YOUR LABEL WITH AI</Text><Text style={styles.body}>Fit Supplement Facts in the camera guide. Review the framed photo, then tap OK to analyze. Review every result before saving. Gallery photos still offer cropping.</Text>
      <View style={styles.actions}><Pressable accessibilityRole="button" disabled={scanBusy} onPress={() => void scanLabel(true)} style={styles.secondary}><Text style={styles.secondaryText}>Take photo</Text></Pressable><Pressable accessibilityRole="button" disabled={scanBusy} onPress={() => void scanLabel(false)} style={styles.secondary}><Text style={styles.secondaryText}>Choose photo</Text></Pressable></View>
    </>}
    {step === 'details' && <>
    <Text style={styles.fieldLabel}>NAME</Text><TextInput accessibilityLabel="Supplement name" value={name} onChangeText={setName} placeholder="e.g. Creatine" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.body}>Use the product name on your container. Suggested names never supply a dose or nutrient amount.</Text>
    <Text style={styles.fieldLabel}>TRACKED UNIT</Text><TextInput accessibilityLabel="Supplement unit" value={dosageUnit} onChangeText={setDosageUnit} placeholder="capsule, tablet, scoop…" placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.fieldLabel}>USUAL NUMBER OF UNITS TAKEN</Text><TextInput accessibilityLabel="Default units taken" value={defaultUnits} onChangeText={setDefaultUnits} keyboardType="decimal-pad" style={styles.input} />
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedOpen }} onPress={() => setAdvancedOpen(!advancedOpen)} style={styles.secondary}><Text style={styles.secondaryText}>{advancedOpen ? 'Hide' : 'Show'} advanced product details</Text></Pressable>
    {advancedOpen && <><Text style={styles.fieldLabel}>SERVING LABEL · OPTIONAL</Text><TextInput accessibilityLabel="Serving label" value={serving} onChangeText={setServing} placeholder="e.g. 2 capsules" placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.fieldLabel}>AMOUNT PER TRACKED UNIT</Text><TextInput accessibilityLabel="Amount per unit" value={dosage} onChangeText={setDosage} keyboardType="decimal-pad" placeholder="1" placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.body}>This describes your tracked unit. Nutrient amounts below are separate and must come from the product label.</Text></>}
    {scan && <View style={styles.progress}><Text style={styles.doseName}>Scanned label · review amounts</Text><Text style={styles.body}>{scan.servingLabel ?? 'Serving size unclear'} · {scan.nutrients.length} readable nutrients</Text>{scan.warnings.map((warning, index) => <Text key={index} style={styles.body}>• {warning}</Text>)}<Text style={styles.fieldLabel}>UNITS IN THE PRINTED SERVING</Text><TextInput accessibilityLabel="Units in printed serving" value={scanUnits} onChangeText={setScanUnits} keyboardType="number-pad" style={styles.input} /><Text style={styles.body}>The scanned amounts are per printed serving. Confirm this count to convert them to one {dosageUnit || 'unit'}.</Text><Pressable accessibilityRole="button" onPress={applyScan} style={styles.secondary}><Text style={styles.secondaryText}>Use reviewed label amounts</Text></Pressable></View>}
    <View style={styles.actions}><Pressable accessibilityRole="button" disabled={scanBusy} onPress={() => void scanLabel(true)} style={styles.secondary}><Text style={styles.secondaryText}>Scan label</Text></Pressable><Pressable accessibilityRole="button" disabled={scanBusy} onPress={() => void scanLabel(false)} style={styles.secondary}><Text style={styles.secondaryText}>Choose photo</Text></Pressable></View>
    <Text style={styles.fieldLabel}>NUTRIENTS ON THE LABEL · OPTIONAL</Text><Text style={styles.body}>Enter amounts printed for one {dosageUnit || 'unit'}. Remove a link if the amount is unknown. These label details stay with this supplement and do not change food totals.</Text><TextInput value={nutrientQuery} onChangeText={setNutrientQuery} placeholder="Add another nutrient" placeholderTextColor={colors.textDim} style={styles.input} />{searchNutrients(nutrientQuery, customNutrients).filter(({ item: value }) => !profile.some((entry) => entry.nutrientId === value.id) && !['calories', 'protein', 'carbs', 'fat'].includes(value.id)).slice(0, nutrientQuery ? 5 : 0).map(({ item: value, uncertain }) => <Pressable key={value.id} style={styles.choice} onPress={() => { const add = () => { setProfile((current) => [...current, { nutrientId: value.id, amount: 0, unit: value.unit }]); setNutrientQuery(''); }; if (uncertain) Alert.alert('Confirm nutrient', `Did you mean ${value.name}?`, [{ text: 'Cancel' }, { text: 'Yes', onPress: add }]); else add(); }}><Text style={styles.doseName}>+ {value.name}</Text></Pressable>)}{profile.map((value, index) => <View key={`${value.nutrientId}-${index}`}><Text style={styles.fieldLabel}>{nutrientDefinition(value.nutrientId, customNutrients)?.name ?? value.nutrientId} PER UNIT</Text><View style={styles.timeRow}><TextInput accessibilityLabel={`${nutrientDefinition(value.nutrientId, customNutrients)?.name ?? value.nutrientId} per unit`} value={value.amount ? String(value.amount) : ''} onChangeText={(text) => setProfile((current) => current.map((entry, position) => position === index ? { ...entry, amount: Number(text) } : entry))} keyboardType="decimal-pad" style={[styles.input, styles.flex]} /><TextInput value={value.unit} onChangeText={(text) => setProfile((current) => current.map((entry, position) => position === index ? { ...entry, unit: text } : entry))} style={[styles.input, styles.timeInput]} /><Pressable accessibilityRole="button" onPress={() => setProfile((current) => current.filter((_, position) => position !== index))}><Text style={styles.meta}>Remove</Text></Pressable></View></View>)}
    <Pressable accessibilityRole="button" onPress={() => { if (!name.trim() || !dosage.trim() || Number(dosage) <= 0 || !dosageUnit.trim() || Number(defaultUnits) <= 0 || profile.some((value) => !Number.isFinite(value.amount) || value.amount <= 0)) return setError('Enter the product, units, and any linked nutrient amounts before continuing; remove unknown links.'); setError(''); setStep('schedule'); }} style={styles.primary}><Text style={styles.primaryText}>Continue to schedule</Text></Pressable>
    </>}
    {step === 'schedule' && <>
    <Text style={styles.fieldLabel}>SCHEDULE</Text><View style={styles.filters}>{([['daily', 'Every day'], ['weekly', 'Selected days'], ['interval', 'Every few hours'], ['as_needed', 'As needed']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: type === value }} onPress={() => setType(value)} style={[styles.filter, type === value && styles.filterSelected]}><Text style={[styles.filterText, type === value && styles.tabTextSelected]}>{label}</Text></Pressable>)}</View>
    {type === 'interval' && <><Text style={styles.fieldLabel}>HOURS BETWEEN SERVINGS</Text><TextInput accessibilityLabel="Hours between servings" value={intervalHours} onChangeText={setIntervalHours} keyboardType="number-pad" style={styles.input} /><Text style={styles.body}>Log each serving when you take it. This does not create a reminder.</Text></>}
    {type === 'weekly' && <><Text style={styles.fieldLabel}>DAYS</Text><View style={styles.filters}>{DAYS.map((day) => <Pressable key={day.id} accessibilityRole="checkbox" accessibilityState={{ checked: weekdays.includes(day.id) }} onPress={() => setWeekdays((current) => current.includes(day.id) ? current.filter((value) => value !== day.id) : [...current, day.id])} style={[styles.weekday, weekdays.includes(day.id) && styles.filterSelected]}><Text style={[styles.filterText, weekdays.includes(day.id) && styles.tabTextSelected]}>{day.label}</Text></Pressable>)}</View></>}
    {(type === 'daily' || type === 'weekly') && <><Text style={styles.fieldLabel}>DOSE TIMES</Text><Text style={styles.body}>Add a separate time for each serving you want to track during the day.</Text>{times.map((time, index) => <View key={index} style={styles.timeRow}><TextInput accessibilityLabel={`Dose ${index + 1} hour`} value={time.hour} onChangeText={(hour) => updateTime(index, { hour })} keyboardType="number-pad" maxLength={2} placeholder="9" placeholderTextColor={colors.textDim} style={[styles.input, styles.timeInput]} /><Text style={styles.timeColon}>:</Text><TextInput accessibilityLabel={`Dose ${index + 1} minute`} value={time.minute} onChangeText={(minute) => updateTime(index, { minute })} keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={colors.textDim} style={[styles.input, styles.timeInput]} /><Pressable accessibilityRole="button" onPress={() => updateTime(index, { period: time.period === 'AM' ? 'PM' : 'AM' })} style={styles.period}><Text style={styles.filterText}>{time.period}</Text></Pressable>{times.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Remove dose time ${index + 1}`} onPress={() => setTimes((current) => current.filter((_, position) => position !== index))} style={styles.removeButton}><Text style={styles.meta}>Remove</Text></Pressable>}</View>)}<Pressable accessibilityRole="button" onPress={() => setTimes((current) => [...current, { hour: '9', minute: '00', period: 'AM' }])} style={styles.secondary}><Text style={styles.secondaryText}>+ Add another time</Text></Pressable></>}
    <Text style={styles.fieldLabel}>PERSONAL NOTES · OPTIONAL</Text><TextInput accessibilityLabel="Supplement notes" value={notes} onChangeText={setNotes} multiline style={[styles.input, styles.notes]} />
    <Pressable accessibilityRole="button" onPress={() => { const normalized = type === 'daily' || type === 'weekly' ? times.map(({ hour, minute, period }) => parse12HourTime(hour, minute, period) ?? 'invalid') : []; const problem = validateSupplementDraft({ id: item?.id, name, serving, notes, scheduleType: type, times: normalized, weekdays, intervalHours: Number(intervalHours), dosagePerUnit: Number(dosage), dosageUnit, defaultUnitsTaken: Number(defaultUnits), nutrientProfile: profile }); if (problem) return setError(problem); setError(''); setStep('review'); }} style={styles.primary}><Text style={styles.primaryText}>Review supplement</Text></Pressable>
    </>}
    {step === 'review' && <View style={styles.progress}><Text style={styles.doseName}>{name}</Text><Text style={styles.body}>{defaultUnits} {dosageUnit}{Number(defaultUnits) === 1 ? '' : 's'} · {type === 'daily' || type === 'weekly' ? `${times.length} scheduled time${times.length === 1 ? '' : 's'}` : type === 'interval' ? `Every ${intervalHours} hours` : 'As needed'}</Text><Text style={styles.body}>{profile.length ? profile.map((value) => `${nutrientDefinition(value.nutrientId, customNutrients)?.name ?? value.nutrientId} ${value.amount} ${value.unit} per unit`).join(' · ') : 'No label nutrient amounts'}</Text><Text style={styles.body}>Label details stay with this supplement and do not change food totals.</Text></View>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {step === 'review' && <Pressable accessibilityRole="button" onPress={save} style={styles.primary}><Text style={styles.primaryText}>Confirm & save supplement</Text></Pressable>}
    {step !== 'choose' && <Pressable accessibilityRole="button" onPress={() => { setError(''); setStep(step === 'review' ? 'schedule' : step === 'schedule' ? 'details' : 'choose'); }} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>}
    {!!item && <Pressable accessibilityRole="button" onPress={() => Alert.alert(item.archived ? 'Restore supplement?' : 'Archive supplement?', 'Dose history stays saved.', [{ text: 'Cancel', style: 'cancel' }, { text: item.archived ? 'Restore' : 'Archive', onPress: () => onArchive(item.id, !item.archived) }])} style={styles.secondary}><Text style={styles.secondaryText}>{item.archived ? 'Restore supplement' : 'Archive supplement'}</Text></Pressable>}
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
  </KeyboardSafeScrollView></SafeAreaView></Modal><LabelCamera visible={cameraVisible} label="Supplement Facts" onCancel={() => setCameraVisible(false)} onConfirm={(photo: FramedLabelPhoto) => { setCameraVisible(false); void analyzeLabel(photo.base64, photo.mimeType); }} /></>;
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
  homeLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: 16 }, homeLinkText: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold },
  confirmScrim: { flex: 1, justifyContent: 'center', backgroundColor: '#000B', padding: 22 }, confirmCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18 },
  confirmItems: { maxHeight: 320 },
  eyebrow: { color: accent, fontSize: 21, fontFamily: font.bold, letterSpacing: 1, marginTop: 4 }, subtitle: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, marginTop: 8, marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 7, marginBottom: 20 }, tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 13, borderWidth: 1, borderColor: colors.border }, tabSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }, tabText: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold }, tabTextSelected: { color: colors.text },
  progress: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 17, marginBottom: 22 }, progressTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, sectionTitle: { color: colors.text, fontSize: 22, fontFamily: font.bold, marginTop: 6 }, body: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 19, marginTop: 5 }, percent: { color: colors.text, fontSize: 26, fontFamily: font.bold }, track: { height: 9, backgroundColor: colors.surfaceRaised, borderRadius: 8, overflow: 'hidden', marginTop: 18 }, fill: { height: 9, backgroundColor: accent }, stats: { flexDirection: 'row', gap: 6, marginTop: 17 }, stat: { flex: 1, textAlign: 'center', color: colors.text, backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 11, fontSize: 11, fontFamily: font.semibold },
  dayPart: { marginBottom: 16 }, partHead: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }, partIcon: { width: 38, height: 38, borderRadius: 9 }, afternoonIcon: { width: 38, color: accent, fontSize: 24, fontFamily: font.regular, textAlign: 'center' }, partName: { flex: 1, color: colors.text, fontSize: 19, fontFamily: font.bold }, partMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 }, choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, partCount: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold }, partBody: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  doseRow: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderBottomWidth: 1, borderBottomColor: colors.border }, itemIcon: { width: 44, height: 44, borderRadius: 9 }, flex: { flex: 1 }, doseName: { color: colors.text, fontSize: 15, fontFamily: font.semibold }, meta: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 3 }, actions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, takeButton: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderColor: accent, borderWidth: 1, borderRadius: 10 }, takeText: { color: accent, fontSize: 13, fontFamily: font.bold }, skipButton: { minHeight: 44, minWidth: 55, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderColor: colors.border, borderWidth: 1, borderRadius: 10 }, skipText: { color: colors.text, fontSize: 12, fontFamily: font.semibold }, status: { fontSize: 12, fontFamily: font.bold }, taken: { color: accent }, skipped: { color: colors.textMuted },
  stackCard: { paddingTop: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border }, stackTitle: { color: accent, fontSize: 14, fontFamily: font.bold }, empty: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 19, marginVertical: 20 }, footnote: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 15 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 17, marginBottom: 5 }, filter: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }, filterSelected: { backgroundColor: accent, borderColor: accent }, filterText: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold }, primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: accent, borderRadius: 13, marginTop: 15, paddingHorizontal: 12 }, primaryText: { color: colors.background, fontFamily: font.bold, fontSize: 14 }, secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 13, marginTop: 10, paddingHorizontal: 12 }, secondaryText: { color: colors.text, fontFamily: font.semibold, fontSize: 13 }, sectionLabel: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, letterSpacing: 1, marginTop: 24, marginBottom: 10 }, regimenRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 7 }, chevron: { color: accent, fontSize: 24 , fontFamily: font.regular},
  undo: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 16 }, undoButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, linkText: { color: accent, fontFamily: font.bold }, removeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, marginTop: 19, marginBottom: 7 }, input: { minHeight: 50, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 , fontFamily: font.regular}, notes: { minHeight: 85, textAlignVertical: 'top', paddingTop: 12 }, timeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 }, timeInput: { width: 54, textAlign: 'center' }, timeColon: { color: colors.text, fontSize: 20, fontFamily: font.semibold }, period: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 12, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }, weekday: { minHeight: 44, minWidth: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 10, borderWidth: 1, borderColor: colors.border }, error: { color: colors.danger, marginTop: 12 }, choice: { minHeight: 52, justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8 }, choiceSelected: { borderColor: accent },
});
