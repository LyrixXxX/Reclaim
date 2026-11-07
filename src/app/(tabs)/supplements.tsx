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
const UNITS = ['capsule', 'tablet', 'softgel', 'gummy', 'scoop', 'drop'];
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
  const today = localDateKey(new Date(useNow(60_000)));
  const supplements = visibleSupplements(medications);
  const events = supplementEvents(medications, medicationEvents);
  const doses = supplementDosesForDate(medications, medicationEvents, today);
  const taken = doses.filter((dose) => dose.status === 'taken').length;
  const skipped = doses.filter((dose) => dose.status === 'skipped').length;
  const remaining = doses.length - taken - skipped;
  // Skipping is a choice, so skipped ones leave the total, the same as the goal on Home.
  const counted = doses.length - skipped;
  const asNeeded = supplements.filter((item) => !item.archived && (item.schedule.type === 'as_needed' || item.schedule.type === 'interval'));
  const scheduledKeys = new Set(supplementStacks.flatMap((stack) => stackMembersForToday(stack, doses).map((dose) => stackDoseKey(dose.medication.id, dose.time))));
  const shownFilter = filter === 'as_needed' && !asNeeded.length ? 'active' : filter;
  const filters: [Filter, string][] = [['active', 'Active'], ...(asNeeded.length ? [['as_needed', 'No set time'] as [Filter, string]] : []), ['archived', 'Archived']];
  const regimen = supplements.filter((item) => shownFilter === 'archived' ? item.archived
    : !item.archived && (shownFilter === 'active' || item.schedule.type === 'as_needed' || item.schedule.type === 'interval'));
  const history = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const record = (items: { item: Medication; key?: string }[], outcome: 'taken' | 'skipped', label: string) => {
    commitRecord(items, outcome, label, outcome === 'taken' ? items.map(({ item }) => item.defaultUnitsTaken ?? 1) : undefined);
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
    <MainScreenHeader title="Supplements" subtitle="Vitamin and supplement schedules and history." accent={accent} />
    <View style={styles.tabs}>{(['today', 'regimen', 'history'] as const).map((choice) => <Pressable key={choice} accessibilityRole="tab" accessibilityState={{ selected: tab === choice }} onPress={() => setTab(choice)} style={[styles.tab, tab === choice && styles.tabSelected]}><Text style={[styles.tabText, tab === choice && styles.tabTextSelected]}>{choice === 'today' ? 'Today' : choice === 'regimen' ? 'My list' : 'History'}</Text></Pressable>)}</View>
    {undo && <View style={styles.undo}><View style={styles.flex}><Text style={styles.doseName}>Recorded</Text><Text style={styles.meta}>{undo.label}</Text></View><Pressable accessibilityRole="button" onPress={() => { undo.ids.forEach(deleteSupplementLog); setCollapsed({}); setUndo(null); }} style={styles.undoButton}><Text style={styles.linkText}>Undo</Text></Pressable></View>}
    {tab === 'today' && <>
      <View style={styles.progress}><View style={styles.progressTop}><View style={styles.flex}><Text style={styles.sectionTitle}>Today’s progress</Text><Text style={styles.body}>{doses.length && !counted ? 'All skipped today' : `${taken} of ${counted} taken today`}</Text></View><Text style={styles.percent}>{doses.length && !counted ? '—' : `${counted ? Math.round(taken / counted * 100) : 0}%`}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${counted ? taken / counted * 100 : 0}%` }]} /></View><View style={styles.stats}><Text style={styles.stat}>✓ {taken} taken</Text><Text style={styles.stat}>◷ {remaining} remaining</Text><Text style={styles.stat}>× {skipped} skipped</Text></View></View>
      {!doses.length && <Text style={styles.empty}>No supplements scheduled today. Add one in My list.</Text>}
      {PARTS.map((part) => {
        const partDoses = doses.filter((dose) => doseDayPart(dose.time) === part);
        if (!partDoses.length) return null;
        const key = `${today}:${part}`;
        const allComplete = allDayPartDosesCompleted(partDoses);
        const isCollapsed = dayPartCollapsed(partDoses, collapsed[key]);
        const stacks = supplementStacks.map((stack) => ({ stack, members: stackMembersForToday(stack, partDoses) })).filter(({ members }) => members.length);
        const standalone = partDoses.filter((dose) => !scheduledKeys.has(stackDoseKey(dose.medication.id, dose.time)));
        return <View key={part} style={styles.dayPart}><Pressable accessibilityRole="button" accessibilityState={{ expanded: !isCollapsed }} onPress={() => setCollapsed((current) => { const next = { ...current }; const currentCollapsed = dayPartCollapsed(partDoses, current[key]); if (!allComplete && currentCollapsed) delete next[key]; else next[key] = !currentCollapsed; return next; })} style={styles.partHead}>{part === 'Morning' || part === 'Evening' || part === 'Overnight' ? <Image source={part === 'Morning' ? morningIcon : eveningIcon} style={styles.partIcon} /> : <Text style={styles.afternoonIcon}>◉</Text>}<Text style={styles.partName}>{part}</Text><View style={styles.partMeta}><Text style={styles.partCount}>{allComplete ? 'All done' : `${partDoses.filter((dose) => !dose.status).length} to take`}</Text><Chevron direction={isCollapsed ? 'down' : 'up'} size={16} /></View></Pressable>{!isCollapsed && <View style={styles.partBody}>
          {stacks.map(({ stack, members }) => <View key={stack.id} style={styles.stackCard}><Text style={styles.stackTitle}>{stack.name}</Text><Text style={styles.meta}>{members.length} in this stack · {members.filter((dose) => dose.status === 'taken').length} taken</Text><View style={styles.actions}>{members.some((dose) => !dose.status) && <><Pressable accessibilityRole="button" onPress={() => record(members.filter((dose) => !dose.status).map((dose) => ({ item: dose.medication, key: dose.key })), 'taken', stack.name)} style={styles.takeButton}><Text style={styles.takeText}>Take remaining</Text></Pressable><Pressable accessibilityRole="button" onPress={() => record(members.filter((dose) => !dose.status).map((dose) => ({ item: dose.medication, key: dose.key })), 'skipped', stack.name)} style={styles.skipButton}><Text style={styles.skipText}>Skip</Text></Pressable></>}</View>{members.map(doseRow)}</View>)}
          {standalone.map(doseRow)}
        </View>}</View>;
      })}
      {!!asNeeded.length && <View style={styles.dayPart}><Pressable accessibilityRole="button" accessibilityState={{ expanded: asNeededOpen }} onPress={() => setAsNeededOpen(!asNeededOpen)} style={styles.partHead}><Text style={styles.partName}>No set time</Text><View style={styles.partMeta}><Text style={styles.partCount}>{asNeeded.length}</Text><Chevron direction={asNeededOpen ? 'up' : 'down'} size={16} /></View></Pressable>{asNeededOpen && <View style={styles.partBody}>{asNeeded.map((item) => <View key={item.id} style={styles.doseRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item.name}</Text><Text style={styles.meta}>{scheduleLabel(item.schedule)} · {events.filter((event) => event.medicationId === item.id && supplementEventDay(event) === today && event.outcome === 'taken').length} taken today</Text></View><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => record([{ item }], 'taken', item.name)} style={styles.takeButton}><Text style={styles.takeText}>Take</Text></Pressable><Pressable accessibilityRole="button" onPress={() => record([{ item }], 'skipped', item.name)} style={styles.skipButton}><Text style={styles.skipText}>Skip</Text></Pressable></View></View>)}</View>}</View>}
      <Text style={styles.footnote}>This is a personal record, not a supplement recommendation or treatment plan.</Text>
    </>}
    {tab === 'regimen' && <>
      <Text style={styles.sectionTitle}>My supplements</Text><Text style={styles.body}>Set up the vitamins and supplements you choose to use.</Text>
      <View style={styles.filters}>{filters.map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: shownFilter === id }} onPress={() => setFilter(id)} style={[styles.filter, shownFilter === id && styles.filterSelected]}><Text style={[styles.filterText, shownFilter === id && styles.tabTextSelected]}>{label}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.primary}><Text style={styles.primaryText}>+ Add vitamin or supplement</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setStackEditing(null)} style={styles.secondary}><Text style={styles.secondaryText}>+ Create supplement stack</Text></Pressable>
      {shownFilter === 'active' && !!supplementStacks.length && <><Text style={styles.sectionLabel}>SUPPLEMENT STACKS</Text>{supplementStacks.map((stack) => <Pressable key={stack.id} accessibilityRole="button" onPress={() => setStackEditing(stack)} style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{stack.name}</Text><Text style={styles.meta}>{stack.members.length} in this stack{stackNeedsReview(stack, supplements) ? ' · Needs review' : ''}</Text></View><Chevron color={colors.textMuted} /></Pressable>)}</>}
      <Text style={styles.sectionLabel}>{shownFilter === 'archived' ? 'ARCHIVED' : 'ACTIVE'} ITEMS · {regimen.length}</Text>
      {regimen.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => setEditing(item)} style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item.name}</Text><Text style={styles.meta}>{item.strength ? `${item.strength} · ` : ''}{scheduleLabel(item.schedule)}</Text></View><Chevron color={colors.textMuted} /></Pressable>)}
      {!regimen.length && <Text style={styles.empty}>No supplements in this view yet.</Text>}
    </>}
      {tab === 'history' && <><Text style={styles.sectionTitle}>History</Text><Text style={styles.body}>Taken and skipped supplements. Correct a mistaken Take or remove an entry without changing your list.</Text>{history.length ? <HistoryPages items={history} pageSize={20}>{(page) => page.map((event) => <HistoryRow key={event.id} event={event} item={supplements.find((entry) => entry.id === event.medicationId)} onSkip={() => Alert.alert('Change to skipped?', 'This updates this entry in your supplement history. It does not change food totals.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Change to skipped', onPress: () => { markSupplementLogSkipped(event.id); setCollapsed({}); } }])} onRemove={() => Alert.alert('Remove this log?', 'This removes only this entry.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { deleteSupplementLog(event.id); setCollapsed({}); } }])} />)}</HistoryPages> : <Text style={styles.empty}>Nothing logged yet.</Text>}</>}
  </KeyboardSafeScrollView>
  {editing !== undefined && <SupplementEditor key={editing?.id ?? 'new'} item={editing} customNutrients={customNutrients} onClose={() => setEditing(undefined)} onSave={(draft) => { saveSupplement(draft, Crypto.randomUUID()); setEditing(undefined); }} onArchive={(id, archived) => { archiveSupplement(id, archived); setEditing(undefined); }} />}
  {stackEditing !== undefined && <StackEditor key={stackEditing?.id ?? 'new'} stack={stackEditing} stacks={supplementStacks} supplements={supplements} onClose={() => setStackEditing(undefined)} onSave={(value) => { const problem = saveSupplementStack(value); if (problem) Alert.alert('Check stack', problem); else setStackEditing(undefined); }} onDelete={(id) => { deleteSupplementStack(id); setStackEditing(undefined); }} />}
  </SafeAreaView>;
}

function HistoryRow({ event, item, onSkip, onRemove }: { event: MedicationEvent; item?: Medication; onSkip: () => void; onRemove: () => void }) {
  return <View style={styles.regimenRow}><Image source={supplementIcon} style={styles.itemIcon} /><View style={styles.flex}><Text style={styles.doseName}>{item?.name ?? 'Removed supplement'} · {event.outcome === 'taken' ? 'Taken' : event.outcome === 'skipped' ? 'Skipped' : 'Snoozed'}</Text><Text style={styles.meta}>{new Date(event.occurredAt).toLocaleString()}{event.unitsTaken ? ` · ${event.unitsTaken} ${item?.dosageUnit || 'unit'}${event.unitsTaken === 1 ? '' : 's'}` : ''}{event.scheduledFor ? ` · Scheduled ${formatMedicationTime(event.scheduledFor.slice(11))}` : ''}</Text></View>{event.outcome === 'taken' && <Pressable accessibilityRole="button" accessibilityLabel="Change to skipped" onPress={onSkip} style={styles.removeButton}><Text style={styles.meta}>Skip</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Remove this entry" onPress={onRemove} style={styles.removeButton}><Text style={styles.meta}>Remove</Text></Pressable></View>;
}

function SupplementEditor({ item, customNutrients, onClose, onSave, onArchive }: { item: Medication | null; customNutrients: { id: string; name: string; unit: string }[]; onClose: () => void; onSave: (draft: SupplementDraft) => void; onArchive: (id: string, archived: boolean) => void }) {
  const [step, setStep] = useState<'choose' | 'details'>(item ? 'details' : 'choose');
  const [search, setSearch] = useState('');
  const [scan, setScan] = useState<SupplementLabelResult | null>(null);
  const [scanUnits, setScanUnits] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [labelOpen, setLabelOpen] = useState(Boolean(item?.notes || item?.nutrientProfile?.length));
  const [name, setName] = useState(item?.name ?? '');
  const [serving, setServing] = useState(item?.strength ?? '');
  const [dosage, setDosage] = useState(String(item?.dosagePerUnit ?? 1));
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
    setDosage('1');
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
      if (parsed.unitName) setDosageUnit(parsed.unitName);
      setDosage('1'); setLabelOpen(true); setStep('details');
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
    if (name.trim() && !(Number(defaultUnits) > 0)) return setError('Enter how much you take each time.');
    if (name.trim() && !dosageUnit.trim()) return setError('Choose what you take it as, like capsule or scoop.');
    const normalized = type === 'daily' || type === 'weekly' ? times.map(({ hour, minute, period }) => parse12HourTime(hour, minute, period) ?? 'invalid') : [];
    // Picking from the list adds its nutrients with no amount; any still blank are simply not saved.
    const linked = profile.filter((value) => value.amount !== 0);
    const draft: SupplementDraft = { id: item?.id, name, serving, notes, scheduleType: type, times: normalized, weekdays, intervalHours: Number(intervalHours), dosagePerUnit: Number(dosage) || 1, dosageUnit, defaultUnitsTaken: Number(defaultUnits), nutrientProfile: linked };
    const problem = validateSupplementDraft(draft);
    if (problem) { setError(problem); return; }
    try { linked.forEach((value) => toCanonicalNutrientAmount(value.nutrientId, value.amount, value.unit, customNutrients)); } catch (error) { setError(error instanceof Error ? error.message : 'Check nutrient units.'); return; }
    onSave(draft);
  };
  return <><Modal visible={!cameraVisible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.modalContent}>
    <Text style={styles.sectionTitle}>{item ? 'Edit supplement' : 'Add vitamin or supplement'}</Text><Text style={styles.body}>{step === 'choose' ? 'Choose what you take. Reclaim never recommends an amount.' : 'Use the amount you already take. Reclaim never recommends one.'}</Text>
    {step === 'choose' && <>
      <Text style={styles.fieldLabel}>FIND A VITAMIN OR SUPPLEMENT</Text><TextInput accessibilityLabel="Search supplements" value={search} onChangeText={setSearch} placeholder="Search vitamins, minerals, creatine…" placeholderTextColor={colors.textDim} style={styles.input} />
      {searchSupplements(search).slice(0, 16).map((choice) => <Pressable key={choice.id} accessibilityRole="button" onPress={() => choose(choice)} style={[styles.choice, styles.choiceRow]}><Text style={[styles.doseName, styles.flex]}>{choice.name}</Text><Chevron size={18} /></Pressable>)}
      <Pressable accessibilityRole="button" onPress={() => choose()} style={styles.secondary}><Text style={styles.secondaryText}>Other supplement</Text></Pressable>
      <Text style={styles.fieldLabel}>OR SCAN YOUR LABEL WITH AI</Text><Text style={styles.body}>Fit Supplement Facts in the camera guide. Review the framed photo, then tap OK to analyze. Review every result before saving. Gallery photos still offer cropping.</Text>
      <View style={styles.actions}><Pressable accessibilityRole="button" disabled={scanBusy} onPress={() => void scanLabel(true)} style={styles.secondary}><Text style={styles.secondaryText}>Take photo</Text></Pressable><Pressable accessibilityRole="button" disabled={scanBusy} onPress={() => void scanLabel(false)} style={styles.secondary}><Text style={styles.secondaryText}>Choose photo</Text></Pressable></View>
    </>}
    {step === 'details' && <>
    <Text style={styles.fieldLabel}>NAME</Text><TextInput accessibilityLabel="Supplement name" value={name} onChangeText={setName} placeholder="e.g. Creatine" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>HOW MUCH DO YOU TAKE EACH TIME?</Text><TextInput accessibilityLabel="How much you take each time" value={defaultUnits} onChangeText={setDefaultUnits} keyboardType="decimal-pad" style={[styles.input, styles.amountInput]} />
    <View style={styles.filters}>{UNITS.map((unit) => <Pressable key={unit} accessibilityRole="radio" accessibilityState={{ checked: dosageUnit === unit }} onPress={() => setDosageUnit(unit)} style={[styles.filter, dosageUnit === unit && styles.filterSelected]}><Text style={[styles.filterText, dosageUnit === unit && styles.tabTextSelected]}>{unit}</Text></Pressable>)}<Pressable accessibilityRole="radio" accessibilityState={{ checked: !UNITS.includes(dosageUnit) }} onPress={() => { if (UNITS.includes(dosageUnit)) setDosageUnit(''); }} style={[styles.filter, !UNITS.includes(dosageUnit) && styles.filterSelected]}><Text style={[styles.filterText, !UNITS.includes(dosageUnit) && styles.tabTextSelected]}>other</Text></Pressable></View>
    {!UNITS.includes(dosageUnit) && <TextInput accessibilityLabel="What you take it as" value={dosageUnit} onChangeText={setDosageUnit} placeholder="What you take it as, like packet" placeholderTextColor={colors.textDim} style={[styles.input, styles.otherUnit]} />}
    <Text style={styles.fieldLabel}>AMOUNT IN EACH {(dosageUnit.trim() || 'one').toUpperCase()} · OPTIONAL</Text><TextInput accessibilityLabel={`Amount in each ${dosageUnit.trim() || 'one'}, optional`} value={serving} onChangeText={setServing} maxLength={40} placeholder="e.g. 300 mg" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>WHICH DAYS?</Text><View style={styles.filters}>{([['daily', 'Every day'], ['weekly', 'Selected days']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: type === value }} onPress={() => setType(value)} style={[styles.filter, type === value && styles.filterSelected]}><Text style={[styles.filterText, type === value && styles.tabTextSelected]}>{label}</Text></Pressable>)}</View>
    {(type === 'as_needed' || type === 'interval') && <Text style={styles.body}>This one has no set time, and you log it whenever you take it. Choose Every day or Selected days to give it one.</Text>}
    {type === 'weekly' && <><View style={styles.filters}>{DAYS.map((day) => <Pressable key={day.id} accessibilityRole="checkbox" accessibilityState={{ checked: weekdays.includes(day.id) }} onPress={() => setWeekdays((current) => current.includes(day.id) ? current.filter((value) => value !== day.id) : [...current, day.id])} style={[styles.weekday, weekdays.includes(day.id) && styles.filterSelected]}><Text style={[styles.filterText, weekdays.includes(day.id) && styles.tabTextSelected]}>{day.label}</Text></Pressable>)}</View></>}
    {(type === 'daily' || type === 'weekly') && <><Text style={styles.fieldLabel}>WHAT TIME?</Text><Text style={styles.body}>It shows on the Home bell if you haven’t logged it by then.</Text>{times.map((time, index) => <View key={index} style={styles.timeRow}><TextInput accessibilityLabel={`Time ${index + 1} hour`} value={time.hour} onChangeText={(hour) => updateTime(index, { hour })} keyboardType="number-pad" maxLength={2} placeholder="9" placeholderTextColor={colors.textDim} style={[styles.input, styles.timeInput]} /><Text style={styles.timeColon}>:</Text><TextInput accessibilityLabel={`Time ${index + 1} minute`} value={time.minute} onChangeText={(minute) => updateTime(index, { minute })} keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={colors.textDim} style={[styles.input, styles.timeInput]} /><Pressable accessibilityRole="button" onPress={() => updateTime(index, { period: time.period === 'AM' ? 'PM' : 'AM' })} style={styles.period}><Text style={styles.filterText}>{time.period}</Text></Pressable>{times.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Remove time ${index + 1}`} onPress={() => setTimes((current) => current.filter((_, position) => position !== index))} style={styles.removeButton}><Text style={styles.meta}>Remove</Text></Pressable>}</View>)}<Pressable accessibilityRole="button" onPress={() => setTimes((current) => [...current, { hour: '9', minute: '00', period: 'AM' }])} style={styles.secondary}><Text style={styles.secondaryText}>+ Add another time</Text></Pressable></>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: labelOpen }} onPress={() => setLabelOpen(!labelOpen)} style={styles.secondary}><Text style={styles.secondaryText}>{labelOpen ? 'Hide label details' : 'Add label details (optional)'}</Text></Pressable>
    {labelOpen && <>
    {scan && <View style={styles.progress}><Text style={styles.doseName}>Scanned label · review amounts</Text><Text style={styles.body}>{scan.servingLabel ?? 'Serving size unclear'} · {scan.nutrients.length} readable nutrients</Text>{scan.warnings.map((warning, index) => <Text key={index} style={styles.body}>• {warning}</Text>)}<Text style={styles.fieldLabel}>UNITS IN THE PRINTED SERVING</Text><TextInput accessibilityLabel="Units in printed serving" value={scanUnits} onChangeText={setScanUnits} keyboardType="number-pad" style={styles.input} /><Text style={styles.body}>The scanned amounts are per printed serving. Confirm this count to convert them to one {dosageUnit || 'unit'}.</Text><Pressable accessibilityRole="button" onPress={applyScan} style={styles.secondary}><Text style={styles.secondaryText}>Use reviewed label amounts</Text></Pressable></View>}
    <View style={styles.actions}><Pressable accessibilityRole="button" disabled={scanBusy} onPress={() => void scanLabel(true)} style={styles.secondary}><Text style={styles.secondaryText}>Scan label</Text></Pressable><Pressable accessibilityRole="button" disabled={scanBusy} onPress={() => void scanLabel(false)} style={styles.secondary}><Text style={styles.secondaryText}>Choose photo</Text></Pressable></View>
    <Text style={styles.fieldLabel}>NUTRIENTS ON THE LABEL · OPTIONAL</Text><Text style={styles.body}>Enter amounts printed for one {dosageUnit || 'unit'}. Any left blank aren’t saved. These label details stay with this supplement and do not change food totals.</Text><TextInput value={nutrientQuery} onChangeText={setNutrientQuery} placeholder="Add another nutrient" placeholderTextColor={colors.textDim} style={styles.input} />{searchNutrients(nutrientQuery, customNutrients).filter(({ item: value }) => !profile.some((entry) => entry.nutrientId === value.id) && !['calories', 'protein', 'carbs', 'fat'].includes(value.id)).slice(0, nutrientQuery ? 5 : 0).map(({ item: value, uncertain }) => <Pressable key={value.id} style={styles.choice} onPress={() => { const add = () => { setProfile((current) => [...current, { nutrientId: value.id, amount: 0, unit: value.unit }]); setNutrientQuery(''); }; if (uncertain) Alert.alert('Confirm nutrient', `Did you mean ${value.name}?`, [{ text: 'Cancel' }, { text: 'Yes', onPress: add }]); else add(); }}><Text style={styles.doseName}>+ {value.name}</Text></Pressable>)}{profile.map((value, index) => <View key={`${value.nutrientId}-${index}`}><Text style={styles.fieldLabel}>{nutrientDefinition(value.nutrientId, customNutrients)?.name ?? value.nutrientId} PER {(dosageUnit || 'unit').toUpperCase()}</Text><View style={styles.timeRow}><TextInput accessibilityLabel={`${nutrientDefinition(value.nutrientId, customNutrients)?.name ?? value.nutrientId} per unit`} value={value.amount ? String(value.amount) : ''} onChangeText={(text) => setProfile((current) => current.map((entry, position) => position === index ? { ...entry, amount: Number(text) } : entry))} keyboardType="decimal-pad" style={[styles.input, styles.flex]} /><TextInput value={value.unit} onChangeText={(text) => setProfile((current) => current.map((entry, position) => position === index ? { ...entry, unit: text } : entry))} style={[styles.input, styles.timeInput]} /><Pressable accessibilityRole="button" onPress={() => setProfile((current) => current.filter((_, position) => position !== index))}><Text style={styles.meta}>Remove</Text></Pressable></View></View>)}
    <Text style={styles.fieldLabel}>PERSONAL NOTES</Text><TextInput accessibilityLabel="Supplement notes" value={notes} onChangeText={setNotes} multiline style={[styles.input, styles.notes]} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" onPress={save} style={styles.primary}><Text style={styles.primaryText}>Save supplement</Text></Pressable>
    </>}
    {step === 'details' && !item && <Pressable accessibilityRole="button" onPress={() => { setError(''); setStep('choose'); }} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>}
    {!!item && <Pressable accessibilityRole="button" onPress={() => Alert.alert(item.archived ? 'Restore supplement?' : 'Archive supplement?', 'Its history stays saved.', [{ text: 'Cancel', style: 'cancel' }, { text: item.archived ? 'Restore' : 'Archive', onPress: () => onArchive(item.id, !item.archived) }])} style={styles.secondary}><Text style={styles.secondaryText}>{item.archived ? 'Restore supplement' : 'Archive supplement'}</Text></Pressable>}
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
    <Text style={styles.sectionTitle}>{stack ? 'Edit supplement stack' : 'Create supplement stack'}</Text><Text style={styles.body}>Group the supplements you usually take together. You can still mark each one separately.</Text>
    <Text style={styles.fieldLabel}>STACK NAME</Text><TextInput accessibilityLabel="Stack name" value={name} onChangeText={setName} placeholder="Morning stack" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.fieldLabel}>SUPPLEMENTS AND TIMES</Text>{options.map(({ item, time, key }) => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(key), disabled: unavailable.has(key) }} disabled={unavailable.has(key)} onPress={() => setSelected((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} style={[styles.choice, selected.includes(key) && styles.choiceSelected]}><Text style={styles.doseName}>{selected.includes(key) ? '✓' : '○'}  {item.name} · {formatMedicationTime(time)}{unavailable.has(key) ? ' · In another stack' : ''}</Text></Pressable>)}
    {stale.map((key) => <Pressable key={key} accessibilityRole="button" onPress={() => setSelected((current) => current.filter((value) => value !== key))} style={styles.choice}><Text style={styles.meta}>No longer scheduled · Tap to remove</Text></Pressable>)}
    {!options.length && <Text style={styles.empty}>Add a supplement with a daily or selected-days schedule first.</Text>}
    <Pressable accessibilityRole="button" onPress={() => onSave({ id: stack?.id ?? Crypto.randomUUID(), name, members: selected.map((key) => { const [medicationId, time] = key.split('\u0000'); return { medicationId, time }; }) })} style={styles.primary}><Text style={styles.primaryText}>Save stack</Text></Pressable>
    {!!stack && <Pressable accessibilityRole="button" onPress={() => Alert.alert(`Delete ${stack.name}?`, 'This removes the stack, not its supplements or their history.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete stack', style: 'destructive', onPress: () => onDelete(stack.id) }])} style={styles.secondary}><Text style={styles.secondaryText}>Delete stack</Text></Pressable>}
    <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
  </ScrollView></SafeAreaView></Modal>;
}

const accent = colors.healthNav;
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 70 }, modalContent: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 70 },
  homeLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: 16 }, homeLinkText: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold },
  eyebrow: { color: accent, fontSize: 21, fontFamily: font.bold, letterSpacing: 1, marginTop: 4 }, subtitle: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, marginTop: 8, marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 7, marginBottom: 20 }, tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 13, borderWidth: 1, borderColor: colors.border }, tabSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }, tabText: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold }, tabTextSelected: { color: colors.text },
  progress: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 17, marginBottom: 22 }, progressTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, sectionTitle: { color: colors.text, fontSize: 22, fontFamily: font.bold, marginTop: 6 }, body: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 19, marginTop: 5 }, percent: { color: colors.text, fontSize: 26, fontFamily: font.bold }, track: { height: 9, backgroundColor: colors.surfaceRaised, borderRadius: 8, overflow: 'hidden', marginTop: 18 }, fill: { height: 9, backgroundColor: accent }, stats: { flexDirection: 'row', gap: 6, marginTop: 17 }, stat: { flex: 1, textAlign: 'center', color: colors.text, backgroundColor: colors.surfaceRaised, borderRadius: 10, paddingVertical: 11, fontSize: 11, fontFamily: font.semibold },
  dayPart: { marginBottom: 16 }, partHead: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }, partIcon: { width: 38, height: 38, borderRadius: 9 }, afternoonIcon: { width: 38, color: accent, fontSize: 24, fontFamily: font.regular, textAlign: 'center' }, partName: { flex: 1, color: colors.text, fontSize: 19, fontFamily: font.bold }, partMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 }, choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, partCount: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold }, partBody: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  doseRow: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderBottomWidth: 1, borderBottomColor: colors.border }, itemIcon: { width: 44, height: 44, borderRadius: 9 }, flex: { flex: 1 }, doseName: { color: colors.text, fontSize: 15, fontFamily: font.semibold }, meta: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 3 }, actions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, takeButton: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderColor: accent, borderWidth: 1, borderRadius: 10 }, takeText: { color: accent, fontSize: 13, fontFamily: font.bold }, skipButton: { minHeight: 44, minWidth: 55, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderColor: colors.border, borderWidth: 1, borderRadius: 10 }, skipText: { color: colors.text, fontSize: 12, fontFamily: font.semibold }, status: { fontSize: 12, fontFamily: font.bold }, taken: { color: accent }, skipped: { color: colors.textMuted },
  stackCard: { paddingTop: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border }, stackTitle: { color: accent, fontSize: 14, fontFamily: font.bold }, empty: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 19, marginVertical: 20 }, footnote: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 15 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 17, marginBottom: 5 }, filter: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }, filterSelected: { backgroundColor: accent, borderColor: accent }, filterText: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold }, primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: accent, borderRadius: 13, marginTop: 15, paddingHorizontal: 12 }, primaryText: { color: colors.background, fontFamily: font.bold, fontSize: 14 }, secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 13, marginTop: 10, paddingHorizontal: 12 }, secondaryText: { color: colors.text, fontFamily: font.semibold, fontSize: 13 }, sectionLabel: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, letterSpacing: 1, marginTop: 24, marginBottom: 10 }, regimenRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 7 }, chevron: { color: accent, fontSize: 24 , fontFamily: font.regular},
  undo: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 16 }, undoButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, linkText: { color: accent, fontFamily: font.bold }, removeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, marginTop: 19, marginBottom: 7 }, input: { minHeight: 50, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 , fontFamily: font.regular}, notes: { minHeight: 85, textAlignVertical: 'top', paddingTop: 12 }, timeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 }, timeInput: { width: 54, textAlign: 'center' }, amountInput: { width: 90, textAlign: 'center' }, otherUnit: { marginTop: 8 }, timeColon: { color: colors.text, fontSize: 20, fontFamily: font.semibold }, period: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 12, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }, weekday: { minHeight: 44, minWidth: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 10, borderWidth: 1, borderColor: colors.border }, error: { color: colors.danger, marginTop: 12 }, choice: { minHeight: 52, justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8 }, choiceSelected: { borderColor: accent },
});
