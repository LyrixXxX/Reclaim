import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_ROUTE_PHOTOS } from '@/lib/route-photo-names';
import { deleteRoutePhotos, routePhotoUri, saveRoutePhotos } from '@/lib/route-photos';
import { colors, font } from '@/theme';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };

/** A route's photos. Leave out onChange to only view them. */
export function RoutePhotos({ routeId, photos = [], onChange }: { routeId: string; photos?: readonly string[]; onChange?: (photos: string[]) => void }) {
  const insets = useSafeAreaInsets();
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = photos.flatMap((name) => { const uri = routePhotoUri(name); return uri ? [{ name, uri }] : []; });
  const missing = photos.length - available.length;
  const open = available.find((photo) => photo.name === viewing);
  const room = MAX_ROUTE_PHOTOS - photos.length;
  const add = async (camera: boolean) => {
    if (busy || !onChange) return;
    setBusy(true);
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) { Alert.alert('Camera', 'Allow the camera to take a photo here, or choose one from your gallery.'); return; }
      const result = camera ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync({ ...PICKER_OPTIONS, allowsMultipleSelection: true, selectionLimit: room });
      if (result.canceled) return;
      const saved = saveRoutePhotos(routeId, result.assets.slice(0, room));
      if (saved.length < Math.min(result.assets.length, room)) Alert.alert('Photos', 'Some photos couldn’t be added.');
      if (saved.length) onChange([...photos, ...saved]);
    } catch {
      Alert.alert('Photos', 'Couldn’t add photos. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const remove = (name: string) => Alert.alert('Remove this photo?', 'It’s removed from this route. Your gallery copy isn’t touched.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => { deleteRoutePhotos([name]); setViewing(null); onChange?.(photos.filter((item) => item !== name)); } },
  ]);
  if (!onChange && !available.length) return null;
  return <View style={styles.section}>
    {onChange && <Text style={styles.label}>Photos</Text>}
    {available.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {available.map((photo, index) => <Pressable key={photo.name} accessibilityRole="imagebutton" accessibilityLabel={`Open photo ${index + 1} of ${available.length}`} onPress={() => setViewing(photo.name)}>
        <Image source={{ uri: photo.uri }} style={styles.thumb} accessible={false} />
      </Pressable>)}
    </ScrollView>}
    {onChange && room > 0 && <View style={styles.actions}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void add(false)} style={[styles.action, busy && styles.busy]}><Text style={styles.actionText}>Add photos</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void add(true)} style={[styles.action, busy && styles.busy]}><Text style={styles.actionText}>Take photo</Text></Pressable>
    </View>}
    {onChange && <Text style={styles.note}>{room > 0 ? 'Photos stay on this phone and aren’t included in backups.' : `That’s the limit of ${MAX_ROUTE_PHOTOS} photos for one route.`}</Text>}
    {missing > 0 && <Text style={styles.note}>{missing === 1 ? '1 photo isn’t on this phone.' : `${missing} photos aren’t on this phone.`}</Text>}
    <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
      <View style={[styles.viewer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {open && <Image source={{ uri: open.uri }} resizeMode="contain" style={styles.full} accessibilityLabel="Route photo" />}
        <View style={styles.viewerActions}>
          {onChange && open && <Pressable accessibilityRole="button" onPress={() => remove(open.name)} style={styles.viewerButton}><Text style={styles.removeText}>Remove</Text></Pressable>}
          <Pressable accessibilityRole="button" onPress={() => setViewing(null)} style={styles.viewerButton}><Text style={styles.actionText}>Close</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 10 },
  label: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular },
  strip: { gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
  busy: { opacity: 0.6 },
  actionText: { color: colors.text, fontSize: 14, fontFamily: font.semibold },
  note: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 17 },
  viewer: { flex: 1, backgroundColor: '#000', paddingHorizontal: 12, gap: 12 },
  full: { flex: 1, width: '100%' },
  viewerActions: { flexDirection: 'row', gap: 10 },
  viewerButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceRaised },
  removeText: { color: colors.danger, fontSize: 14, fontFamily: font.semibold },
});
