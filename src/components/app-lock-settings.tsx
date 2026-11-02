import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { PIN_MAX_LENGTH, pinValidationMessage } from '@/lib/app-lock';
import { useAppLock } from '@/state/app-lock-context';
import { colors, layout, spacing } from '@/theme';

type PinMode = 'setup' | 'change' | 'disable';

export function AppLockSettings() {
  const {
    biometricAvailable,
    biometricEnabled,
    biometricLabel,
    enabled,
    lockNow,
    setBiometricEnabled,
  } = useAppLock();
  const [mode, setMode] = useState<PinMode>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const toggleBiometrics = async (value: boolean) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const result = await setBiometricEnabled(value);
    if (!result.ok) setMessage(result.message);
    setBusy(false);
  };

  return <>
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>App lock</Text>
          <Text style={styles.status}>{enabled ? 'Protected' : 'Not enabled'}</Text>
        </View>
        <View style={[styles.statusDot, enabled && styles.statusDotOn]} />
      </View>
      <Text style={styles.copy}>{enabled
        ? 'Reclaim locks whenever you leave the app. Your PIN always remains available if biometrics do not work.'
        : 'Require a local PIN before someone can open your trackers and health records.'}</Text>

      {!enabled ? <Pressable style={styles.primary} onPress={() => setMode('setup')}><Text style={styles.primaryText}>Set up app lock</Text></Pressable> : <>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>{biometricLabel}</Text>
            <Text style={styles.settingText}>{biometricAvailable ? 'Unlock with the biometrics enrolled on this phone.' : 'No enrolled face or fingerprint was detected.'}</Text>
          </View>
          <Switch
            disabled={!biometricAvailable || busy}
            onValueChange={(value) => { void toggleBiometrics(value); }}
            thumbColor={biometricEnabled ? colors.settingsNav : colors.textDim}
            trackColor={{ false: colors.border, true: '#5A4421' }}
            value={biometricEnabled}
          />
        </View>
        {!!message && <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text>}
        <View style={styles.buttonRow}>
          <Pressable style={styles.secondary} onPress={() => setMode('change')}><Text style={styles.secondaryText}>Change PIN</Text></Pressable>
          <Pressable style={styles.secondary} onPress={lockNow}><Text style={styles.secondaryText}>Lock now</Text></Pressable>
        </View>
        <Pressable style={styles.disableButton} onPress={() => setMode('disable')}><Text style={styles.disableText}>Turn off app lock</Text></Pressable>
      </>}
      <Text style={styles.privacy}>The PIN verifier stays in secure device storage and is never included in backups. App lock adds privacy but does not replace your phone’s own screen lock.</Text>
    </View>
    <PinModal mode={mode} biometricAvailable={biometricAvailable} biometricLabel={biometricLabel} onClose={() => setMode(undefined)} />
  </>;
}

function PinModal({ mode, biometricAvailable, biometricLabel, onClose }: { mode?: PinMode; biometricAvailable: boolean; biometricLabel: string; onClose: () => void }) {
  const { changePin, disableAppLock, enableAppLock } = useAppLock();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [useBiometrics, setUseBiometrics] = useState(biometricAvailable);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const resetAndClose = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setUseBiometrics(biometricAvailable);
    setMessage('');
    setBusy(false);
    onClose();
  };

  const submit = async () => {
    if (!mode || busy) return;
    setMessage('');
    if (mode !== 'disable') {
      const validation = pinValidationMessage(newPin);
      if (validation) { setMessage(validation); return; }
      if (newPin !== confirmPin) { setMessage('The new PIN entries do not match.'); return; }
    }
    setBusy(true);
    const result = mode === 'setup'
      ? await enableAppLock(newPin, useBiometrics)
      : mode === 'change'
        ? await changePin(currentPin, newPin)
        : await disableAppLock(currentPin);
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    resetAndClose();
  };

  const title = mode === 'setup' ? 'Set up app lock' : mode === 'change' ? 'Change PIN' : 'Turn off app lock';
  const button = mode === 'setup' ? 'Protect Reclaim' : mode === 'change' ? 'Save new PIN' : 'Turn off app lock';

  return <Modal animationType="slide" onRequestClose={resetAndClose} presentationStyle="pageSheet" visible={Boolean(mode)}>
    <SafeAreaView style={styles.modalSafe}>
      <KeyboardSafeScrollView contentContainerStyle={styles.modalContent}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={resetAndClose}><Text style={styles.cancel}>Cancel</Text></Pressable></View>
        <Text style={styles.modalCopy}>{mode === 'disable'
          ? 'Enter your current PIN. Your Reclaim data will remain unchanged; only the app lock will be removed.'
          : 'Choose a 4–8 digit PIN that you can remember. Reclaim cannot recover a forgotten PIN.'}</Text>

        {mode !== 'setup' && <PinField autoFocus label="Current PIN" value={currentPin} onChange={setCurrentPin} />}
        {mode !== 'disable' && <>
          <PinField autoFocus={mode === 'setup'} label="New PIN" value={newPin} onChange={setNewPin} />
          <PinField label="Confirm new PIN" value={confirmPin} onChange={setConfirmPin} onSubmit={() => { void submit(); }} />
        </>}

        {mode === 'setup' && <View style={styles.biometricChoice}>
          <View style={styles.settingCopy}><Text style={styles.settingTitle}>Use {biometricLabel.toLowerCase()}</Text><Text style={styles.settingText}>{biometricAvailable ? 'The phone will ask you to confirm before this is enabled.' : 'No enrolled biometrics were detected. You can enable them later.'}</Text></View>
          <Switch disabled={!biometricAvailable} onValueChange={setUseBiometrics} thumbColor={useBiometrics ? colors.settingsNav : colors.textDim} trackColor={{ false: colors.border, true: '#5A4421' }} value={useBiometrics && biometricAvailable} />
        </View>}

        {!!message && <Text accessibilityLiveRegion="polite" style={styles.modalError}>{message}</Text>}
        <Pressable disabled={busy} onPress={() => { void submit(); }} style={[styles.modalSave, mode === 'disable' && styles.modalDanger, busy && styles.disabled]}><Text style={[styles.modalSaveText, mode === 'disable' && styles.modalDangerText]}>{busy ? 'Working…' : button}</Text></Pressable>
      </KeyboardSafeScrollView>
    </SafeAreaView>
  </Modal>;
}

function PinField({ autoFocus = false, label, onChange, onSubmit, value }: { autoFocus?: boolean; label: string; onChange: (value: string) => void; onSubmit?: () => void; value: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput
    accessibilityLabel={label}
    autoComplete="off"
    autoFocus={autoFocus}
    keyboardType="number-pad"
    maxLength={PIN_MAX_LENGTH}
    onChangeText={(text) => onChange(text.replace(/\D/g, ''))}
    onSubmitEditing={onSubmit}
    placeholder="4–8 digits"
    placeholderTextColor={colors.textDim}
    returnKeyType={onSubmit ? 'done' : 'next'}
    secureTextEntry
    style={styles.input}
    value={value}
  /></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  status: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 3, textTransform: 'uppercase' },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textDim },
  statusDotOn: { backgroundColor: colors.success },
  copy: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 12 },
  primary: { alignItems: 'center', backgroundColor: colors.settingsNav, borderRadius: 14, marginTop: 16, paddingVertical: 14 },
  primaryText: { color: colors.background, fontSize: 12, fontWeight: '700' },
  settingRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, marginTop: 18, paddingVertical: 14 },
  settingCopy: { flex: 1 },
  settingTitle: { color: colors.text, fontSize: 12, fontWeight: '600' },
  settingText: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  error: { color: colors.danger, fontSize: 11, lineHeight: 15, marginTop: 10 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondary: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, paddingVertical: 12 },
  secondaryText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  disableButton: { alignItems: 'center', marginTop: 12, paddingVertical: 10 },
  disableText: { color: colors.danger, fontSize: 11, fontWeight: '600' },
  privacy: { color: colors.textDim, fontSize: 11, lineHeight: 14, marginTop: 14 },
  modalSafe: { backgroundColor: colors.background, flex: 1 },
  modalContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  modalHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  modalTitle: { color: colors.text, flex: 1, fontSize: 24, fontWeight: '700' },
  cancel: { color: colors.settingsNav, fontSize: 12, fontWeight: '600', paddingVertical: 8 },
  modalCopy: { color: colors.textMuted, fontSize: 11, lineHeight: 18, marginBottom: 20, marginTop: 10 },
  field: { marginTop: 14 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 7, textTransform: 'uppercase' },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.text, fontSize: 18, fontWeight: '600', letterSpacing: 6, minHeight: 54, paddingHorizontal: 16 },
  biometricChoice: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 18, padding: 14 },
  modalError: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 14 },
  modalSave: { alignItems: 'center', backgroundColor: colors.settingsNav, borderRadius: 14, marginTop: 20, paddingVertical: 15 },
  modalSaveText: { color: colors.background, fontSize: 12, fontWeight: '700' },
  modalDanger: { backgroundColor: colors.surfaceRaised, borderColor: colors.danger, borderWidth: 1 },
  modalDangerText: { color: colors.danger },
  disabled: { opacity: 0.55 },
});
