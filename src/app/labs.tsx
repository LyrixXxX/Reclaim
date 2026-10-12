import { HistoryPages } from '@/components/history-pages';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { LabChart } from '@/components/lab-chart';
import { formatClockTime, parseClockTime } from '@/lib/clock-time';
import { parseLabHistoryWithAi } from '@/lib/lab-ai';
import { LabResultInput, LabScanDraftInput, LabTrackerInput, labInputsForTracker, labTrackerSeries, parseLabHistoryText, validateLabResult, validateLabTracker } from '@/lib/labs';
import { clearPendingCaptureTarget, setPendingCaptureTarget } from '@/lib/pending-capture';
import { LabResult, LabTracker } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

type ScanDraft = LabScanDraftInput & { key: string };

export default function LabsScreen() {
  const params = useLocalSearchParams<{ recoveredPhotoUri?: string; recoveredLabTrackerId?: string }>();
  const { labTrackers = [], labResults = [], saveLabTracker, deleteLabTracker, saveLabResult, saveLabResults, deleteLabResult } = useTrackers();
  const [trackerEditor, setTrackerEditor] = useState<LabTracker | null | undefined>();
  const [manualEditor, setManualEditor] = useState<{ tracker: LabTracker; result?: LabResult }>();
  const [scanTracker, setScanTracker] = useState<LabTracker>();
  const [expandedId, setExpandedId] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});

  const recoveredTracker = params.recoveredPhotoUri ? labTrackers.find((item) => item.id === params.recoveredLabTrackerId) ?? labTrackers[0] : undefined;
  const activeScanTracker = scanTracker ?? recoveredTracker;
  const closeScan = () => { setScanTracker(undefined); if (params.recoveredPhotoUri) router.replace('/labs'); };

  return <KeyboardSafeScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>PRIVATE · ON DEVICE</Text>
    <Text style={styles.subtitle}>Track each lab’s measured values and review its result history.</Text>
    <Pressable onPress={() => setTrackerEditor(null)} style={styles.add}><Text style={styles.addText}>+ Add Lab Tracker</Text></Pressable>

    {labTrackers.map((tracker) => {
      const results = labResults.filter((item) => item.labTrackerId === tracker.id);
      const series = labTrackerSeries(labResults, tracker.id);
      const latest = results[0];
      const expanded = expandedId === tracker.id;
      const showHistory = Boolean(historyOpen[tracker.id]);
      return <View key={tracker.id} style={styles.trackerCard}>
        <Pressable onPress={() => setExpandedId(expanded ? undefined : tracker.id)} style={styles.trackerHead}>
          <View style={styles.flex}><Text style={styles.trackerName}>{tracker.name}</Text><Text style={styles.trackerSummary}>{latest ? `${latest.value} ${latest.unit} · ${formatDate(latest.panelDate)}` : 'No results yet'} · {results.length} result{results.length === 1 ? '' : 's'}</Text></View>
          <Text style={styles.chevron}>{expanded ? '−' : '+'}</Text>
        </Pressable>
        {expanded && <View style={styles.trackerBody}>
          {tracker.notes && <Text style={styles.notes}>{tracker.notes}</Text>}
          <View style={styles.graph}><Text style={styles.graphTitle}>{tracker.name} trend</Text><Text style={styles.graphHelp}>Measured values only{tracker.defaultUnit ? ` · ${tracker.defaultUnit}` : ''}</Text><LabChart results={series} /></View>
          <View style={styles.actionRow}><Pressable onPress={() => setScanTracker(tracker)} style={styles.primary}><Text style={styles.primaryText}>Take or Choose Photo</Text></Pressable><Pressable onPress={() => setManualEditor({ tracker })} style={styles.secondary}><Text style={styles.secondaryText}>Add Manually</Text></Pressable></View>
          <Pressable onPress={() => setHistoryOpen((current) => ({ ...current, [tracker.id]: !showHistory }))} style={styles.historyToggle}><Text style={styles.historyToggleText}>{showHistory ? 'Hide' : 'Show'} result history ({results.length})</Text><Text style={styles.historyChevron}>{showHistory ? '−' : '+'}</Text></Pressable>
          {showHistory && <View style={styles.history}><HistoryPages key={tracker.id} items={results}>{(page) => page.map((result) => <View key={result.id} style={styles.resultRow}><Pressable onPress={() => setManualEditor({ tracker, result })} style={styles.resultMain}><Text style={styles.resultDate}>{formatDate(result.panelDate)}{result.resultTime ? ` · ${formatTime(result.resultTime)}` : ''}{result.sourceTimezone ? ` ${result.sourceTimezone}` : ''}</Text><Text style={styles.resultValue}>{result.value} <Text style={styles.resultUnit}>{result.unit}</Text></Text>{result.referenceRange && <Text style={styles.resultMeta}>Reference range: {result.referenceRange}</Text>}{result.note && <Text style={styles.resultMeta}>{result.note}</Text>}</Pressable><Pressable onPress={() => confirmDeleteResult(result, deleteLabResult)}><Text style={styles.delete}>Delete</Text></Pressable></View>)}</HistoryPages>{!results.length && <Text style={styles.emptyInline}>No results have been saved for this lab.</Text>}</View>}
          <View style={styles.trackerLinks}><Pressable onPress={() => setTrackerEditor(tracker)}><Text style={styles.editLink}>Edit tracker</Text></Pressable><Pressable onPress={() => confirmDeleteTracker(tracker, results.length, deleteLabTracker, () => setExpandedId(undefined))}><Text style={styles.deleteLink}>Delete tracker</Text></Pressable></View>
        </View>}
      </View>;
    })}
    {!labTrackers.length && <Text style={styles.empty}>Add a lab tracker such as Glucose Lvl, A1C, Total Testosterone, LH, or FSH.</Text>}

    {trackerEditor !== undefined && <LabTrackerModal tracker={trackerEditor} onClose={() => setTrackerEditor(undefined)} onSave={(input) => { const tracker = saveLabTracker(input); setExpandedId(tracker.id); setTrackerEditor(undefined); }} />}
    {manualEditor && <ManualResultModal tracker={manualEditor.tracker} result={manualEditor.result} onClose={() => setManualEditor(undefined)} onSave={(input) => { saveLabResult(input); setManualEditor(undefined); }} />}
    {activeScanTracker && <ScanLabModal key={`${activeScanTracker.id}-${params.recoveredPhotoUri ?? 'new'}`} tracker={activeScanTracker} existingResults={labResults.filter((item) => item.labTrackerId === activeScanTracker.id)} initialPhotoUri={params.recoveredPhotoUri} onClose={closeScan} onSave={(inputs) => { const summary = saveLabResults(inputs); setExpandedId(activeScanTracker.id); setHistoryOpen((current) => ({ ...current, [activeScanTracker.id]: true })); closeScan(); if (summary.duplicates) Alert.alert('Results saved', `${summary.added} new result${summary.added === 1 ? '' : 's'} added. ${summary.duplicates} exact duplicate${summary.duplicates === 1 ? ' was' : 's were'} skipped.`); }} />}
  </KeyboardSafeScrollView>;
}

function LabTrackerModal({ tracker, onClose, onSave }: { tracker: LabTracker | null; onClose: () => void; onSave: (input: LabTrackerInput) => void }) {
  const [name, setName] = useState(tracker?.name ?? ''); const [unit, setUnit] = useState(tracker?.defaultUnit ?? ''); const [notes, setNotes] = useState(tracker?.notes ?? '');
  const save = () => { const input = { id: tracker?.id, name, defaultUnit: unit, notes }; const error = validateLabTracker(input); if (error) return Alert.alert('Check lab tracker', error); onSave(input); };
  return <Modal transparent animationType="fade" onRequestClose={onClose}><KeyboardSafeScrollView contentContainerStyle={styles.backdrop}><View style={styles.modal}><Text style={styles.modalTitle}>{tracker ? 'Edit lab tracker' : 'Add lab tracker'}</Text><Text style={styles.modalHelp}>The name you enter identifies this graph. Photo parsing will only extract result rows for this selected lab.</Text><Field label="LAB NAME" value={name} onChange={setName} placeholder="Glucose Lvl" /><Field label="DEFAULT UNIT · OPTIONAL" value={unit} onChange={setUnit} placeholder="mg/dL" /><Field label="NOTES · OPTIONAL" value={notes} onChange={setNotes} multiline /><ModalActions onClose={onClose} onSave={save} label={tracker ? 'Save changes' : 'Create tracker'} /></View></KeyboardSafeScrollView></Modal>;
}

function ManualResultModal({ tracker, result, onClose, onSave }: { tracker: LabTracker; result?: LabResult; onClose: () => void; onSave: (input: LabResultInput) => void }) {
  const [date, setDate] = useState(result?.panelDate ?? today()); const [value, setValue] = useState(result ? String(result.value) : ''); const [unit, setUnit] = useState(result?.unit ?? tracker.defaultUnit ?? ''); const [range, setRange] = useState(result?.referenceRange ?? ''); const [note, setNote] = useState(result?.note ?? '');
  const save = () => { const input: LabResultInput = { id: result?.id, labTrackerId: tracker.id, panelDate: date, resultTime: result?.resultTime, sourceTimezone: result?.sourceTimezone, marker: tracker.name, value: Number(value), unit, referenceRange: range, note, photoUri: result?.photoUri }; const error = validateLabResult(input); if (error) return Alert.alert('Check result', error); onSave(input); };
  return <Modal transparent animationType="fade" onRequestClose={onClose}><KeyboardSafeScrollView contentContainerStyle={styles.backdrop}><View style={styles.modal}><Text style={styles.modalTitle}>{result ? `Edit ${tracker.name} result` : `Add ${tracker.name} result`}</Text><Field label="RESULT DATE" value={date} onChange={setDate} placeholder="YYYY-MM-DD" /><View style={styles.two}><Field label="RESULT" value={value} onChange={setValue} keyboard="decimal-pad" /><Field label="UNIT" value={unit} onChange={setUnit} placeholder="mg/dL" /></View><Field label="REFERENCE RANGE · OPTIONAL" value={range} onChange={setRange} /><Field label="NOTE · OPTIONAL" value={note} onChange={setNote} multiline /><ModalActions onClose={onClose} onSave={save} label={result ? 'Save correction' : 'Save result'} /></View></KeyboardSafeScrollView></Modal>;
}

function ScanLabModal({ tracker, existingResults, initialPhotoUri, onClose, onSave }: { tracker: LabTracker; existingResults: LabResult[]; initialPhotoUri?: string; onClose: () => void; onSave: (inputs: LabResultInput[]) => void }) {
  const [drafts, setDrafts] = useState<ScanDraft[]>([]); const [photoUri, setPhotoUri] = useState<string>(); const [status, setStatus] = useState(`Photograph or choose the ${tracker.name} history. Each row's printed date will be used.`); const [busy, setBusy] = useState(false);
  const analyzeUri = async (sourceUri: string) => {
    setBusy(true); setStatus('Reading report text on this device…');
    let uri = sourceUri;
    try { const source = new File(uri); const destination = new File(Paths.document, `lab-${Date.now()}.jpg`); await source.copy(destination); uri = destination.uri; } catch { /* retain picker URI */ }
    setPhotoUri(uri);
    try {
      const { recognizeText } = await import('@infinitered/react-native-mlkit-text-recognition');
      const recognized = await recognizeText(uri);
      setStatus('Organizing dated result rows with your private AI relay…');
      let parsed: LabScanDraftInput[];
      try { parsed = await parseLabHistoryWithAi(tracker.name, recognized.text); }
      catch (error) {
        parsed = parseLabHistoryText(recognized.text, tracker.defaultUnit);
        if (!parsed.length) throw error;
        setStatus(`AI parsing was unavailable, so Reclaim used on-device extraction. Review every ${tracker.name} row before saving.`);
      }
      setDrafts(parsed.map((item, index) => ({ ...item, key: `${item.panelDate}-${index}` })));
      if (parsed.length) setStatus(`Found ${parsed.length} ${tracker.name} result${parsed.length === 1 ? '' : 's'}. Verify every date and value before saving.`);
      else setStatus(`No ${tracker.name} result rows were found. Try a closer crop or add the result manually.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'The report could not be read. Try again or add the result manually.'); }
    finally { setBusy(false); }
  };
  const choose = async (camera: boolean) => {
    if (camera) { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) return setStatus('Camera permission is needed to photograph the report.'); }
    if (camera) await setPendingCaptureTarget(`labs:${tracker.id}`);
    let result: ImagePicker.ImagePickerResult;
    try { result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true }); }
    finally { if (camera) await clearPendingCaptureTarget(); }
    if (!result.canceled && result.assets[0]) await analyzeUri(result.assets[0].uri);
  };
  useEffect(() => {
    if (!initialPhotoUri) return;
    const timer = setTimeout(() => { void analyzeUri(initialPhotoUri); }, 0);
    return () => clearTimeout(timer);
  }, [initialPhotoUri]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (key: string, field: keyof LabScanDraftInput, value: string) => setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, [field]: value } : draft));
  const save = () => {
    const normalizedDrafts = drafts.map((draft) => ({ ...draft, resultTime: draft.resultTime?.trim() ? parseClockTime(formatClockTime(draft.resultTime)) : undefined }));
    if (drafts.some((draft, index) => draft.resultTime?.trim() && !normalizedDrafts[index].resultTime)) return Alert.alert('Check extracted results', 'Enter a result time like 9:30 AM or 6:15 PM.');
    const inputs = labInputsForTracker(normalizedDrafts, tracker, photoUri); const error = inputs.map(validateLabResult).find(Boolean);
    if (error) return Alert.alert('Check extracted results', error);
    if (!inputs.length) return Alert.alert('No results to save', 'Scan a report and confirm at least one result.');
    const duplicates = inputs.filter((input) => existingResults.some((item) => item.panelDate === input.panelDate && (item.resultTime ?? '') === (input.resultTime ?? '') && item.value === input.value && item.unit.toLocaleLowerCase() === input.unit.toLocaleLowerCase())).length;
    if (duplicates === inputs.length) return Alert.alert('Already saved', 'Every extracted row is already in this lab history.');
    onSave(inputs);
  };
  return <Modal transparent animationType="fade" onRequestClose={onClose}><KeyboardSafeScrollView contentContainerStyle={styles.backdrop}><View style={styles.modal}><Text style={styles.modalTitle}>Scan {tracker.name} history</Text><Text style={styles.modalHelp}>There is no shared collection date. Reclaim reads the date printed beside every result. OCR text is submitted only when you choose a photo; saved records remain on this device.</Text><View style={styles.photoActions}><Pressable disabled={busy} onPress={() => { void choose(true); }} style={styles.photoButton}><Text style={styles.photoText}>Take Photo</Text></Pressable><Pressable disabled={busy} onPress={() => { void choose(false); }} style={styles.photoButton}><Text style={styles.photoText}>Choose Photo</Text></Pressable></View>{photoUri && <Image source={{ uri: photoUri }} resizeMode="contain" style={styles.preview} />}<Text style={styles.status}>{status}</Text>{drafts.map((draft, index) => <View key={draft.key} style={styles.draft}><Text style={styles.draftTitle}>RESULT {index + 1}</Text><View style={styles.two}><Field label="RESULT DATE" value={draft.panelDate} onChange={(value) => update(draft.key, 'panelDate', value)} /><Field label="TIME · OPTIONAL" value={draft.resultTime ? formatClockTime(draft.resultTime) : ''} onChange={(value) => update(draft.key, 'resultTime', value)} placeholder="9:30 AM" /></View><View style={styles.two}><Field label="VALUE" value={draft.value} onChange={(value) => update(draft.key, 'value', value)} keyboard="decimal-pad" /><Field label="UNIT" value={draft.unit} onChange={(value) => update(draft.key, 'unit', value)} /></View><Field label="REFERENCE RANGE · HISTORY ONLY" value={draft.referenceRange} onChange={(value) => update(draft.key, 'referenceRange', value)} /><Pressable onPress={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}><Text style={styles.remove}>Remove extracted row</Text></Pressable></View>)}<ModalActions onClose={onClose} onSave={save} label={`Save ${drafts.length || ''} result${drafts.length === 1 ? '' : 's'}`} /></View></KeyboardSafeScrollView></Modal>;
}

function confirmDeleteResult(result: LabResult, remove: (id: string, confirmed: boolean) => void) { Alert.alert('Delete this result?', `${formatDate(result.panelDate)} · ${result.value} ${result.unit}\n\nThis removes only this saved result.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove(result.id, true) }]); }
function confirmDeleteTracker(tracker: LabTracker, count: number, remove: (id: string, confirmed: boolean) => void, after: () => void) { Alert.alert(`Delete ${tracker.name}?`, `This permanently deletes this lab tracker and ${count} saved result${count === 1 ? '' : 's'}. This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete permanently', style: 'destructive', onPress: () => { remove(tracker.id, true); after(); } }]); }
function Field({ label, value, onChange, placeholder, multiline, keyboard }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; keyboard?: 'decimal-pad' }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textDim} multiline={multiline} keyboardType={keyboard} style={[styles.input, multiline && styles.multiline]} /></View>; }
function ModalActions({ onClose, onSave, label }: { onClose: () => void; onSave: () => void; label: string }) { return <View style={styles.modalActions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable onPress={onSave} style={styles.save}><Text style={styles.saveText}>{label}</Text></Pressable></View>; }
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function formatTime(value: string) { return formatClockTime(value); }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg }, eyebrow: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 }, title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 7 }, subtitle: { color: colors.textMuted, fontSize: 11, lineHeight: 18, marginTop: 6 }, add: { backgroundColor: colors.accent, borderRadius: 14, alignItems: 'center', padding: 14, marginTop: 18, marginBottom: 8 }, addText: { color: colors.background, fontWeight: '900', fontSize: 11 }, trackerCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, overflow: 'hidden', marginTop: 10 }, trackerHead: { minHeight: 74, flexDirection: 'row', alignItems: 'center', padding: 15 }, flex: { flex: 1 }, trackerName: { color: colors.text, fontSize: 17, fontWeight: '900' }, trackerSummary: { color: colors.textMuted, fontSize: 9, marginTop: 5 }, chevron: { color: colors.accent, fontSize: 24 }, trackerBody: { borderTopColor: colors.border, borderTopWidth: 1, padding: 13 }, notes: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginBottom: 10 }, graph: { backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: 12 }, graphTitle: { color: colors.text, fontSize: 13, fontWeight: '900' }, graphHelp: { color: colors.textDim, fontSize: 8, marginTop: 3 }, actionRow: { flexDirection: 'row', gap: 8, marginTop: 11 }, primary: { flex: 1, backgroundColor: colors.accent, borderRadius: 11, alignItems: 'center', paddingVertical: 12 }, primaryText: { color: colors.background, fontSize: 9, fontWeight: '900' }, secondary: { flex: 1, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 11, alignItems: 'center', paddingVertical: 12 }, secondaryText: { color: colors.text, fontSize: 9, fontWeight: '800' }, historyToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 11, padding: 12, marginTop: 11 }, historyToggleText: { flex: 1, color: colors.text, fontSize: 10, fontWeight: '800' }, historyChevron: { color: colors.accent, fontSize: 18 }, history: { marginTop: 5 }, resultRow: { flexDirection: 'row', alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 10 }, resultMain: { flex: 1 }, resultDate: { color: colors.textMuted, fontSize: 9 }, resultValue: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 3 }, resultUnit: { color: colors.textMuted, fontSize: 10 }, resultMeta: { color: colors.textDim, fontSize: 8, marginTop: 3 }, delete: { color: colors.danger, fontSize: 8, fontWeight: '800', padding: 8 }, emptyInline: { color: colors.textMuted, fontSize: 10, paddingVertical: 16 }, trackerLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }, editLink: { color: colors.accent, fontSize: 9, fontWeight: '800', padding: 5 }, deleteLink: { color: colors.danger, fontSize: 9, fontWeight: '800', padding: 5 }, empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 40, lineHeight: 18 }, backdrop: { flexGrow: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.82)', padding: spacing.lg }, modal: { width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg }, modalTitle: { color: colors.text, fontSize: 22, fontWeight: '900' }, modalHelp: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginTop: 5 }, field: { flex: 1 }, fieldLabel: { color: colors.textDim, fontSize: 8, fontWeight: '800', letterSpacing: .7, marginTop: 12, marginBottom: 5 }, input: { minHeight: 44, color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11 }, multiline: { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 }, two: { flexDirection: 'row', gap: 8 }, modalActions: { flexDirection: 'row', gap: 8, marginTop: 18 }, cancel: { flex: 1, alignItems: 'center', padding: 13, backgroundColor: colors.surfaceRaised, borderRadius: 11 }, cancelText: { color: colors.text, fontSize: 10, fontWeight: '800' }, save: { flex: 1, alignItems: 'center', padding: 13, backgroundColor: colors.accent, borderRadius: 11 }, saveText: { color: colors.background, fontSize: 10, fontWeight: '900' }, photoActions: { flexDirection: 'row', gap: 8, marginTop: 14 }, photoButton: { flex: 1, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 11, padding: 12 }, photoText: { color: colors.text, fontSize: 10, fontWeight: '800' }, preview: { width: '100%', aspectRatio: 4 / 3, maxHeight: 300, backgroundColor: colors.background, borderRadius: 12, marginTop: 10 }, status: { color: colors.textMuted, fontSize: 9, lineHeight: 14, marginTop: 9 }, draft: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 13, paddingTop: 5 }, draftTitle: { color: colors.accent, fontSize: 8, fontWeight: '900', letterSpacing: .8, marginTop: 7 }, remove: { color: colors.danger, fontSize: 8, fontWeight: '800', marginTop: 9 },
});
