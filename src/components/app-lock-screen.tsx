import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef, useState } from 'react';
import { AppState, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { canApplyUnlockResult, canStartBiometricUnlock, PIN_MAX_LENGTH, type AppLockLifecycleState } from '@/lib/app-lock';
import { useAppLock } from '@/state/app-lock-context';
import { colors, layout, spacing, font } from '@/theme';
import { BrandedLoading } from '@/components/branded-loading';

export function AppLockScreen({ loading = false }: { loading?: boolean }) {
  const { biometricAvailable, biometricEnabled, biometricLabel, unlockWithBiometrics, unlockWithPin } = useAppLock();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [appState, setAppState] = useState<AppLockLifecycleState>(AppState.currentState === 'active' ? 'active' : 'unknown');
  const biometricAttempted = useRef(false);
  const biometricAttempt = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState === 'active' ? 'active' : nextState === 'background' ? 'background' : 'inactive');
      if (nextState !== 'background') return;
      biometricAttempt.current += 1;
      biometricAttempted.current = false;
      setBusy(false);
      setMessage('');
      void LocalAuthentication.cancelAuthenticate().catch(() => undefined);
    });
    return () => {
      mounted.current = false;
      biometricAttempt.current += 1;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!canStartBiometricUnlock({ appState, available: biometricAvailable, attempted: biometricAttempted.current, enabled: biometricEnabled, loading })) return;
    biometricAttempted.current = true;
    const attempt = biometricAttempt.current + 1;
    biometricAttempt.current = attempt;
    setBusy(true);
    unlockWithBiometrics()
      .then((result) => {
        if (!mounted.current || !canApplyUnlockResult(attempt, biometricAttempt.current, AppState.currentState === 'active' ? 'active' : 'unknown')) return;
        if (!result.ok && !result.message.includes('canceled')) setMessage(result.message);
      })
      .finally(() => {
        if (mounted.current && attempt === biometricAttempt.current) setBusy(false);
      });
  }, [appState, biometricAvailable, biometricEnabled, loading, unlockWithBiometrics]);

  const submitPin = async () => {
    if (busy || !pin) return;
    setBusy(true);
    setMessage('');
    const result = await unlockWithPin(pin);
    if (!result.ok) {
      setMessage(result.message);
      setPin('');
    }
    setBusy(false);
  };

  const submitBiometrics = async () => {
    if (busy) return;
    const attempt = biometricAttempt.current + 1;
    biometricAttempt.current = attempt;
    setBusy(true);
    setMessage('');
    const result = await unlockWithBiometrics();
    if (!mounted.current || !canApplyUnlockResult(attempt, biometricAttempt.current, AppState.currentState === 'active' ? 'active' : 'unknown')) return;
    if (!result.ok && !result.message.includes('canceled')) setMessage(result.message);
    setBusy(false);
  };

  if (loading) return <View style={styles.overlay} accessibilityViewIsModal><BrandedLoading /></View>;

  return <View style={styles.overlay} accessibilityViewIsModal>
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brand}><Image source={require('../../assets/images/reclaim-icon.png')} style={styles.mark} resizeMode="contain" accessible={false} /><Text style={styles.wordmark}>RECLAIM</Text></View>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>PRIVATE · ON DEVICE</Text>
          <Text style={styles.title}>Reclaim is locked</Text>
          <Text style={styles.copy}>Enter your PIN or use {biometricLabel.toLowerCase()} to continue.</Text>
          <TextInput
            accessibilityLabel="Reclaim PIN"
            autoComplete="off"
            autoFocus={!biometricEnabled}
            editable={!busy}
            keyboardType="number-pad"
            maxLength={PIN_MAX_LENGTH}
            onChangeText={(value) => setPin(value.replace(/\D/g, ''))}
            onSubmitEditing={() => { void submitPin(); }}
            placeholder="PIN"
            placeholderTextColor={colors.textDim}
            returnKeyType="done"
            secureTextEntry
            style={styles.input}
            value={pin}
          />
          {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
          <Pressable disabled={busy || !pin} onPress={() => { void submitPin(); }} style={({ pressed }) => [styles.primary, (busy || !pin) && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{busy ? 'Checking…' : 'Unlock with PIN'}</Text>
          </Pressable>
          {biometricEnabled && biometricAvailable && <Pressable disabled={busy} onPress={() => { void submitBiometrics(); }} style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Use {biometricLabel}</Text>
          </Pressable>}
        </View>
        <Text style={styles.footer}>Your tracker and health history stays on this device.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 1000, backgroundColor: colors.background },
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 34 },
  mark: { width: 48, height: 48, borderRadius: 12 },
  wordmark: { color: colors.text, fontSize: 18, fontFamily: font.bold, letterSpacing: 4 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg },
  eyebrow: { color: colors.accent, fontSize: 11, fontFamily: font.bold, letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 28, fontFamily: font.bold, marginTop: 10 },
  copy: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 19, marginTop: 8 },
  input: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 14, color: colors.text, fontSize: 20, fontFamily: font.semibold, letterSpacing: 8, marginTop: 22, minHeight: 56, paddingHorizontal: 16, textAlign: 'center' },
  message: { color: colors.danger, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  primary: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 14, marginTop: 16, paddingVertical: 15 },
  primaryText: { color: colors.background, fontSize: 13, fontFamily: font.bold },
  secondary: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 10, paddingVertical: 14 },
  secondaryText: { color: colors.text, fontSize: 12, fontFamily: font.semibold },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  loading: { alignItems: 'center', gap: 14 },
  loadingText: { color: colors.textMuted, fontSize: 12 , fontFamily: font.regular},
  footer: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, lineHeight: 15, marginTop: 22, textAlign: 'center' },
});
