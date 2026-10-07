import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { CpapReadingInput, parseCpapRecognition, validateCpapReading } from '@/lib/cpap';
import { recoverPhoto } from '@/lib/cpap-photo';
import { clearPendingCaptureTarget, setPendingCaptureTarget } from '@/lib/pending-capture';
import { CpapReading } from '@/models/tracker';
import { colors, layout, spacing } from '@/theme';

type NumericKey = 'usedMinutes' | 'averagePressure' | 'p95Pressure' | 'ahi' | 'cai' | 'averageLeak' | 'p95Leak' | 'score';

export function CpapReadingModal({ visible, reading, readings, initialPhotoUri, captureOnOpen = false, onClose, onSave }: { visible: boolean; reading?: CpapReading | null; readings: CpapReading[]; initialPhotoUri?: string; captureOnOpen?: boolean; onClose: () => void; onSave: (input: CpapReadingInput) => void }) {
  const [values, setValues] = useState<Record<NumericKey, string>>({ usedMinutes: `${reading?.usedMinutes ?? ''}`, averagePressure: `${reading?.averagePressure ?? ''}`, p95Pressure: `${reading?.p95Pressure ?? ''}`, ahi: `${reading?.ahi ?? ''}`, cai: `${reading?.cai ?? ''}`, averageLeak: `${reading?.averageLeak ?? ''}`, p95Leak: `${reading?.p95Leak ?? ''}`, score: `${reading?.score ?? ''}` });
  const [sleepDate, setSleepDate] = useState(reading?.sleepDate ?? yesterday());
  const [note, setNote] = useState(reading?.note ?? ''); const [photoUri, setPhotoUri] = useState(reading?.photoUri ?? initialPhotoUri); const [status, setStatus] = useState(''); const [error, setError] = useState('');
  const [recognizedText, setRecognizedText] = useState(''); const [showRecognizedText, setShowRecognizedText] = useState(false); const [showPhoto, setShowPhoto] = useState(false);
  const cameraOpened = useRef(false);
  useEffect(() => {
    if (!initialPhotoUri || reading) return;
    let active = true;
    recoverPhoto(initialPhotoUri).then(({ savedUri, parsed, text, status }) => {
      if (!active) return;
      setPhotoUri(savedUri); setRecognizedText(text); setStatus(status);
      setValues((prior) => ({ ...prior, ...Object.fromEntries(Object.entries(parsed).filter(([key]) => key in prior).map(([key, value]) => [key, `${value}`])) }));
    }).catch(() => { if (active) setStatus('The photo was recovered. Automatic text recognition was unavailable, so please review the values manually.'); });
    return () => { active = false; };
  }, [initialPhotoUri, reading]);
  const set = (key: NumericKey, value: string) => setValues((prior) => ({ ...prior, [key]: value }));
  const processPhoto = async (camera: boolean, closeOnCancel = false) => {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return setStatus('Camera permission is needed to take a CPAP screen photo.');
      await setPendingCaptureTarget('cpap');
    }
    const imageOptions: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [4, 3] };
    let result: ImagePicker.ImagePickerResult;
    try { result = camera ? await ImagePicker.launchCameraAsync(imageOptions) : await ImagePicker.launchImageLibraryAsync(imageOptions); }
    finally { if (camera) await clearPendingCaptureTarget(); }
    if (result.canceled || !result.assets[0]) { if (closeOnCancel) onClose(); return; }
    setStatus('Reading the machine screen on this device…');
    let savedUri = result.assets[0].uri;
    try {
      const source = new File(result.assets[0].uri); const destination = new File(Paths.document, `cpap-${Date.now()}.${result.assets[0].fileName?.split('.').pop() ?? 'jpg'}`); await source.copy(destination); savedUri = destination.uri;
    } catch {
      setStatus('The photo is attached, but could not be copied into permanent app storage.');
    }
    setPhotoUri(savedUri);
    try {
      const { recognizeText } = await import('@infinitered/react-native-mlkit-text-recognition');
      const recognized = await recognizeText(savedUri); const parsed = parseCpapRecognition(recognized); setRecognizedText(recognized.text);
      setValues((prior) => ({ ...prior, ...Object.fromEntries(Object.entries(parsed).filter(([key]) => key in prior).map(([key, value]) => [key, `${value}`])) }));
      const coreKeys = ['usedMinutes', 'averagePressure', 'p95Pressure', 'ahi', 'cai', 'averageLeak', 'p95Leak'];
      const count = coreKeys.filter((key) => parsed[key as keyof typeof parsed] !== undefined).length;
      setStatus(`Found ${count} of 7 core values${parsed.score !== undefined ? ' plus the score' : ''}. Please compare every field with the photo before saving.`);
    } catch {
      setStatus('The photo is attached, but automatic text recognition is unavailable in this build. Enter or review the values manually.');
    }
  };
  const save = () => {
    const input: CpapReadingInput = { id: reading?.id, sleepDate, usedMinutes: Number(values.usedMinutes), averagePressure: Number(values.averagePressure), p95Pressure: Number(values.p95Pressure), ahi: Number(values.ahi), cai: Number(values.cai), averageLeak: Number(values.averageLeak), p95Leak: Number(values.p95Leak), score: values.score ? Number(values.score) : undefined, photoUri, note };
    const nextError = validateCpapReading(input); if (nextError) return setError(nextError);
    const duplicate = readings.find((item) => item.sleepDate === input.sleepDate && item.id !== reading?.id);
    const commit = (next: CpapReadingInput) => { onSave(next); onClose(); };
    if (duplicate) return Alert.alert('Reading already saved', `A CPAP reading already exists for ${formatDate(input.sleepDate)}. Replace that reading with these values?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', onPress: () => commit({ ...input, id: duplicate.id }) }]);
    commit(input);
  };
  const openCameraOnce = () => {
    if (!captureOnOpen || reading || initialPhotoUri || cameraOpened.current) return;
    cameraOpened.current = true;
    void processPhoto(true, true).catch(() => setStatus('Camera could not open. Try again or enter the reading manually.'));
  };
  return <Modal visible={visible} transparent animationType="fade" onShow={openCameraOnce} onRequestClose={onClose}><KeyboardSafeScrollView contentContainerStyle={styles.backdrop}><View style={styles.card}>
    <Text style={styles.eyebrow}>{reading ? 'EDIT CPAP NIGHT' : 'ADD CPAP NIGHT'}</Text><Text style={styles.title}>Review machine reading</Text><Text style={styles.help}>After taking or choosing a photo, crop closely around the illuminated results screen. Photos and extraction stay on this device.</Text>
    <View style={styles.photoActions}><Pressable onPress={() => void processPhoto(true).catch(() => setStatus('Camera could not open. Try again or enter the reading manually.'))} style={styles.photoButton}><Text style={styles.photoText}>Take photo</Text></Pressable><Pressable onPress={() => void processPhoto(false).catch(() => setStatus('The photo library could not open. Try again or enter the reading manually.'))} style={styles.photoButton}><Text style={styles.photoText}>Choose photo</Text></Pressable></View>
    {photoUri && <><Pressable accessibilityRole="button" accessibilityLabel="Open CPAP photo full screen" onPress={() => setShowPhoto(true)}><Image source={{ uri: photoUri }} resizeMode="contain" style={styles.preview} /></Pressable><Text style={styles.photoHint}>Tap the photo to inspect it full screen.</Text></>}{status && <Text style={styles.status}>{status}</Text>}
    {recognizedText && <><Pressable onPress={() => setShowRecognizedText((shown) => !shown)}><Text style={styles.debugLink}>{showRecognizedText ? 'Hide recognized text' : 'Show recognized text'}</Text></Pressable>{showRecognizedText && <View style={styles.debugBox}><Text selectable style={styles.debugText}>{recognizedText}</Text></View>}</>}
    <Field label="SLEEP DATE" value={sleepDate} onChange={setSleepDate} placeholder="YYYY-MM-DD" keyboard="default" />
    <View style={styles.grid}><Field label="USED MINUTES" value={values.usedMinutes} onChange={(v) => set('usedMinutes', v)} /><Field label="SCORE · OPTIONAL" value={values.score} onChange={(v) => set('score', v)} /><Field label="AVG PRESSURE" value={values.averagePressure} onChange={(v) => set('averagePressure', v)} /><Field label="P95 PRESSURE" value={values.p95Pressure} onChange={(v) => set('p95Pressure', v)} /><Field label="AHI" value={values.ahi} onChange={(v) => set('ahi', v)} /><Field label="CAI" value={values.cai} onChange={(v) => set('cai', v)} /><Field label="AVG LEAK" value={values.averageLeak} onChange={(v) => set('averageLeak', v)} /><Field label="95% LEAK" value={values.p95Leak} onChange={(v) => set('p95Leak', v)} /></View>
    <Text style={styles.label}>NOTE · OPTIONAL</Text><TextInput value={note} onChangeText={setNote} multiline placeholder="Mask off, travel, congestion…" placeholderTextColor={colors.textDim} style={[styles.input, styles.note]} />{error && <Text style={styles.error}>{error}</Text>}
    <View style={styles.actions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable onPress={save} style={styles.save}><Text style={styles.saveText}>Save night</Text></Pressable></View>
  </View></KeyboardSafeScrollView>{photoUri && <Modal visible={showPhoto} transparent animationType="fade" onRequestClose={() => setShowPhoto(false)}><Pressable onPress={() => setShowPhoto(false)} style={styles.fullPhotoBackdrop}><Image source={{ uri: photoUri }} resizeMode="contain" style={styles.fullPhoto} /><Text style={styles.closePhoto}>Tap anywhere to close</Text></Pressable></Modal>}</Modal>;
}
function Field({ label, value, onChange, placeholder = '0', keyboard = 'decimal-pad' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; keyboard?: 'decimal-pad' | 'default' }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={keyboard} placeholder={placeholder} placeholderTextColor={colors.textDim} style={styles.input} /></View>; }
function yesterday() { const date = new Date(Date.now() - 86_400_000); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
const styles = StyleSheet.create({ backdrop: { flexGrow: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.8)', padding: spacing.lg }, card: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius, padding: spacing.lg }, eyebrow: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }, title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 7 }, help: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 6 }, photoActions: { flexDirection: 'row', gap: 8, marginTop: 16 }, photoButton: { flex: 1, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }, photoText: { color: colors.text, fontSize: 11, fontWeight: '800' }, preview: { width: '100%', aspectRatio: 4 / 3, maxHeight: 300, borderRadius: 14, marginTop: 12, backgroundColor: colors.background }, photoHint: { color: colors.textDim, fontSize: 8, textAlign: 'center', marginTop: 5 }, fullPhotoBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.96)', alignItems: 'center', justifyContent: 'center', padding: 14 }, fullPhoto: { width: '100%', height: '86%' }, closePhoto: { color: colors.textMuted, fontSize: 11, marginTop: 10 }, status: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 8 }, debugLink: { color: colors.caffeine, fontSize: 10, fontWeight: '700', marginTop: 8 }, debugBox: { backgroundColor: colors.background, borderRadius: 10, padding: 10, marginTop: 7 }, debugText: { color: colors.textMuted, fontSize: 9, lineHeight: 13 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, field: { width: '48%', flexGrow: 1 }, label: { color: colors.textDim, fontSize: 8, fontWeight: '800', letterSpacing: .8, marginTop: 13, marginBottom: 5 }, input: { minHeight: 44, color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 11 }, note: { minHeight: 70, paddingTop: 10, textAlignVertical: 'top' }, error: { color: colors.danger, fontSize: 10, marginTop: 10 }, actions: { flexDirection: 'row', gap: 8, marginTop: 18 }, cancel: { flex: 1, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 13 }, cancelText: { color: colors.text, fontSize: 11, fontWeight: '700' }, save: { flex: 1, alignItems: 'center', backgroundColor: colors.accent, borderRadius: 12, padding: 13 }, saveText: { color: colors.background, fontSize: 11, fontWeight: '800' } });
