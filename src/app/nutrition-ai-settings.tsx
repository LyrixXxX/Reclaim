import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { clearNutritionAiConfig, loadNutritionAiConfig, saveNutritionAiConfig, testNutritionAiConnection } from '@/lib/nutrition-ai';
import { colors, layout, spacing } from '@/theme';

export default function NutritionAiSettingsScreen() {
  const [endpoint, setEndpoint] = useState(process.env.EXPO_PUBLIC_NUTRITION_AI_URL ?? '');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadNutritionAiConfig().then((config) => { if (config) { setEndpoint(config.endpoint); setToken(config.accessToken); setConnected(true); } }).catch(() => undefined); }, []);

  const saveAndTest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const config = await saveNutritionAiConfig(endpoint, token);
      const status = await testNutritionAiConnection(config);
      setConnected(true);
      Alert.alert('Private AI connected', `Secure relay ready${status.model ? ` · ${status.model}` : ''}.`);
    } catch (error) {
      setConnected(false);
      Alert.alert('Could not connect', message(error));
    } finally { setBusy(false); }
  };

  const disconnect = () => Alert.alert('Disconnect Private AI?', 'Manual nutrition and laboratory tracking and all saved history will remain available. Only the relay address and access token will be removed.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Disconnect', style: 'destructive', onPress: () => { void clearNutritionAiConfig().then(() => { setConnected(false); setToken(''); }); } },
  ]);

  return <SafeAreaView style={styles.safe} edges={['bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>PRIVATE CONNECTION</Text><Text style={styles.title}>Private AI</Text>
    <View style={[styles.status, connected && styles.statusConnected]}><Text style={[styles.statusText, connected && styles.statusTextConnected]}>{connected ? 'CONNECTED' : 'NOT CONNECTED'}</Text></View>
    <Text style={styles.help}>Your saved nutrition and laboratory records remain local on this device. Only content you explicitly submit for AI analysis is transmitted through your relay to OpenAI: meal descriptions, cropped nutrition-label images, or OCR text from a selected lab report. Reclaim’s relay stores none of this content and requests non-persisted OpenAI responses. OpenAI platform processing remains subject to your API account’s data policy.</Text>
    <Text style={styles.label}>RELAY ADDRESS</Text><TextInput value={endpoint} onChangeText={setEndpoint} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…workers.dev" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.label}>PERSONAL ACCESS TOKEN</Text><TextInput value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Paste access token" placeholderTextColor={colors.textDim} style={styles.input} />
    <Pressable disabled={busy} onPress={() => { void saveAndTest(); }} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Connecting…' : 'Save and test connection'}</Text></Pressable>
    {connected && <Pressable onPress={disconnect} style={styles.disconnect}><Text style={styles.disconnectText}>Disconnect Private AI</Text></Pressable>}
    <View style={styles.note}><Text style={styles.noteTitle}>Manual tracking always works</Text><Text style={styles.noteText}>If the relay is unavailable or you are offline, enter foods and laboratory results manually. AI results are editable drafts and are never saved without your confirmation.</Text></View>
  </KeyboardSafeScrollView></SafeAreaView>;
}

const message = (error: unknown) => error instanceof Error ? error.message : 'The secure relay could not be reached.';
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: 18 },
  eyebrow: { color: colors.nutritionNav, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 32, fontWeight: '900', marginTop: 8 },
  status: { alignSelf: 'flex-start', backgroundColor: colors.surfaceRaised, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 14 }, statusConnected: { backgroundColor: '#26203A' }, statusText: { color: colors.textDim, fontSize: 9, fontWeight: '900' }, statusTextConnected: { color: colors.nutritionNav },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 16 }, label: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 18, marginBottom: 6 },
  input: { minHeight: 48, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, color: colors.text }, primary: { backgroundColor: colors.nutritionNav, borderRadius: 15, alignItems: 'center', paddingVertical: 15, marginTop: 20 }, primaryText: { color: colors.background, fontSize: 12, fontWeight: '900' }, disabled: { opacity: .55 },
  disconnect: { alignItems: 'center', paddingVertical: 14, marginTop: 12 }, disconnectText: { color: colors.danger, fontSize: 11, fontWeight: '800' }, note: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 18 }, noteTitle: { color: colors.text, fontWeight: '900', fontSize: 12 }, noteText: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginTop: 5 },
});
