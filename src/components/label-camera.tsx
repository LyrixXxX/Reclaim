import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { frameCrop, labelFrame, type Size } from '@/lib/label-camera-frame';
import { colors } from '@/theme';

export type FramedLabelPhoto = { uri: string; base64: string; mimeType: 'image/jpeg' };

export function LabelCamera({ visible, label, onCancel, onConfirm }: { visible: boolean; label: string; onCancel: () => void; onConfirm: (photo: FramedLabelPhoto) => void }) {
  const camera = useRef<CameraView>(null);
  const requestedOnOpen = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [shape, setShape] = useState<'tall' | 'wide'>('tall');
  const [previewSize, setPreviewSize] = useState<Size>({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [photo, setPhoto] = useState<FramedLabelPhoto | null>(null);
  const [error, setError] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);

  // Reset capture state when the camera closes, during render rather than in an effect.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) { setPhoto(null); setError(''); setReady(false); setWorking(false); }
  }

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain && !requestedOnOpen.current) { requestedOnOpen.current = true; void requestPermission(); }
    if (!visible) requestedOnOpen.current = false;
  }, [visible, permission, requestPermission]);

  const capture = async () => {
    if (!ready || !camera.current || !previewSize.width || working) return;
    setWorking(true); setError('');
    try {
      const result = await camera.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (!result) throw new Error('No photo was captured.');
      const crop = frameCrop(result, previewSize, labelFrame(previewSize, shape));
      const context = ImageManipulator.manipulate(result.uri);
      context.crop(crop);
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
      if (!saved.base64) throw new Error('The captured photo could not be prepared.');
      setPhoto({ uri: saved.uri, base64: saved.base64, mimeType: 'image/jpeg' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not capture the label. Please retry.'); }
    finally { setWorking(false); }
  };

  const frame = previewSize.width && previewSize.height ? labelFrame(previewSize, shape) : null;
  return <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Text style={styles.title}>Scan {label}</Text>
      <Text style={styles.help}>{photo ? 'Review the framed area. Nothing is sent until you tap OK.' : 'Fit the label inside the guide. Choose Tall or Wide to match its shape.'}</Text>
      {!photo && <View style={styles.choices}>
        {(['tall', 'wide'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: shape === value }} onPress={() => setShape(value)} style={[styles.choice, shape === value && styles.selected]}><Text style={styles.buttonText}>{value === 'tall' ? 'Tall' : 'Wide'}</Text></Pressable>)}
      </View>}
      <View style={styles.preview} onLayout={(event) => setPreviewSize(event.nativeEvent.layout)}>
        {photo ? <Image source={{ uri: photo.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} /> : permission?.granted ? <><CameraView ref={camera} facing="back" onCameraReady={() => setReady(true)} style={StyleSheet.absoluteFill} /><View pointerEvents="none" style={StyleSheet.absoluteFill}>{frame && <View style={[styles.frame, { left: frame.x, top: frame.y, width: frame.width, height: frame.height }]} />}</View></> : <View style={styles.permission}><Text style={styles.help}>Camera access is needed to scan a label.</Text><Pressable onPress={() => void requestPermission()} style={styles.choice}><Text style={styles.buttonText}>Allow camera</Text></Pressable></View>}
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        {photo ? <><Pressable accessibilityRole="button" onPress={() => { setPhoto(null); setReady(false); }} style={styles.choice}><Text style={styles.buttonText}>Retake</Text></Pressable><Pressable accessibilityRole="button" accessibilityHint="Send the framed label for analysis" onPress={() => { onConfirm(photo); setPhoto(null); }} style={styles.confirm}><Text style={styles.confirmText}>OK</Text></Pressable></> : <><Pressable accessibilityRole="button" onPress={onCancel} style={styles.choice}><Text style={styles.buttonText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={!ready || working || !permission?.granted} onPress={() => void capture()} style={[styles.confirm, (!ready || working) && styles.disabled]}>{working ? <ActivityIndicator color="#000" /> : <Text style={styles.confirmText}>Take photo</Text>}</Pressable></>}
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 25, fontWeight: '600' },
  help: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  choices: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, alignItems: 'center', padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.surface },
  selected: { borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '700' },
  preview: { flex: 1, overflow: 'hidden', borderRadius: 16, backgroundColor: '#080808' },
  frame: { position: 'absolute', borderWidth: 3, borderColor: '#C8F55B', borderRadius: 12 },
  permission: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
  actions: { flexDirection: 'row', gap: 10 },
  confirm: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 13, backgroundColor: '#C8F55B' },
  confirmText: { color: '#101510', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { color: '#FF8888' },
});
