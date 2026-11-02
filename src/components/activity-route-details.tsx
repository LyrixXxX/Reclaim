import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActivityRoute } from '@/models/tracker';
import { colors, spacing, font } from '@/theme';

export function routeDisplayName(route: ActivityRoute) {
  return route.name?.trim() || (route.kind === 'hike' ? 'Hike' : route.kind === 'walk' ? 'Walk' : route.kind === 'run' ? 'Run' : 'Route');
}

export function ActivityRouteDetails({ route, onClose, onSave }: { route: ActivityRoute | null; onClose: () => void; onSave: (route: ActivityRoute) => Promise<void> }) {
  return route ? <RouteDetailsEditor key={route.id} route={route} onClose={onClose} onSave={onSave} /> : null;
}

function RouteDetailsEditor({ route, onClose, onSave }: { route: ActivityRoute; onClose: () => void; onSave: (route: ActivityRoute) => Promise<void> }) {
  const [name, setName] = useState(route.name ?? '');
  const [notes, setNotes] = useState(route.notes ?? '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ ...route, name: name.trim().slice(0, 120) || undefined, notes: notes.trim().slice(0, 2000) || undefined });
      onClose();
    } catch (error) {
      Alert.alert('Route details', error instanceof Error ? error.message : 'Could not save route details. The route itself is still saved.');
    } finally {
      setSaving(false);
    }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.shade}><View style={styles.card}>
      <Text style={styles.title}>Route details</Text>
      <Text style={styles.help}>The route is already saved. Add a name or note if you like.</Text>
      <Text style={styles.label}>Name</Text>
      <TextInput accessibilityLabel="Route name" value={name} onChangeText={setName} maxLength={120} placeholder={route ? routeDisplayName(route) : 'Route'} placeholderTextColor={colors.textDim} style={styles.input} />
      <Text style={styles.label}>Notes</Text>
      <TextInput accessibilityLabel="Route notes" value={notes} onChangeText={setNotes} maxLength={2000} multiline placeholder="Anything you want to remember" placeholderTextColor={colors.textDim} style={[styles.input, styles.notes]} />
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={styles.primary}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save details'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={saving} onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Skip for now</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  shade: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: '#000000AA' },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20 },
  title: { color: colors.text, fontSize: 22, fontFamily: font.semibold },
  help: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 19, marginTop: 8 },
  label: { color: colors.textMuted, fontSize: 12, fontFamily: font.bold, marginTop: 16, marginBottom: 6 },
  input: { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 , fontFamily: font.regular},
  notes: { minHeight: 90, textAlignVertical: 'top' },
  primary: { marginTop: 20, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: colors.activityNav },
  primaryText: { color: colors.background, fontFamily: font.semibold },
  secondary: { marginTop: 8, padding: 12, alignItems: 'center' },
  secondaryText: { color: colors.textMuted, fontFamily: font.bold },
});
