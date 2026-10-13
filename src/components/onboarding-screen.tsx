import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrivacyContent } from '@/components/privacy-content';
import { ONBOARDING_AREAS } from '@/lib/onboarding';
import { OnboardingArea } from '@/models/tracker';
import { colors, layout, spacing } from '@/theme';

type Props = {
  selected: OnboardingArea[];
  onChange: (selected: OnboardingArea[]) => void;
  onFinish: () => Promise<void>;
};

export function OnboardingScreen({ selected, onChange, onFinish }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'welcome' | 'choices' | 'review' | 'guide'>(selected.length ? 'choices' : 'welcome');
  const [busy, setBusy] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [error, setError] = useState('');
  const healthChoices = ONBOARDING_AREAS.slice(5).filter((item) => selected.includes(item.id));
  const tabs = [
    'Home',
    ...(selected.includes('habits') ? ['Habits'] : []),
    ...(healthChoices.length ? ['Health'] : []),
    ...(selected.includes('cpap') ? ['CPAP'] : []),
    ...(selected.includes('weight') ? ['Weight'] : []),
    ...(selected.includes('nutrition') ? ['Nutrition'] : []),
    ...(selected.includes('activity') ? ['Activity'] : []),
    'Settings',
  ];
  const toggle = (area: OnboardingArea) => {
    if (busy) return;
    onChange(selected.includes(area) ? selected.filter((item) => item !== area) : [...selected, area]);
  };
  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onFinish();
    } catch {
      setError('Your choices could not be saved on this device. Check available storage and try again.');
      setBusy(false);
    }
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]} showsVerticalScrollIndicator={false}>
      <View style={styles.brand}><Image source={require('../../assets/images/reclaim-icon.png')} style={styles.icon} /><Text style={styles.brandName}>RECLAIM</Text></View>
      <Text style={styles.step}>{step === 'welcome' ? 'WELCOME' : step === 'choices' ? 'YOUR CHOICES' : step === 'review' ? 'YOUR SETUP' : 'FIRST STEPS'}</Text>
      {step === 'welcome' && <>
        <Text style={styles.title}>Make Reclaim yours.</Text>
        <Text style={styles.body}>Choose what you want to track. Your selections set up the bottom tabs and Home screen. You can change what appears later in Settings.</Text>
        <View style={styles.info}><Text style={styles.infoTitle}>Your records stay on this device</Text><Text style={styles.infoText}>Nothing is logged or sent anywhere by answering these questions. You can add records after setup.</Text></View>
        <Pressable accessibilityRole="button" onPress={() => setPrivacyOpen(true)}><Text style={styles.help}>Privacy & data →</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setStep('choices')} style={styles.primary}><Text style={styles.primaryText}>Get started</Text></Pressable>
      </>}
      {step === 'choices' && <>
        <Text style={styles.title}>What would you like to track?</Text>
        <Text style={styles.body}>Select any combination, or leave everything off for now.</Text>
        <Text style={styles.group}>EVERYDAY TRACKING</Text>
        {ONBOARDING_AREAS.slice(0, 5).map((item) => <Choice key={item.id} {...item} checked={selected.includes(item.id)} onPress={() => toggle(item.id)} />)}
        <Text style={styles.group}>HEALTH</Text>
        {ONBOARDING_AREAS.slice(5).map((item) => <Choice key={item.id} {...item} checked={selected.includes(item.id)} onPress={() => toggle(item.id)} />)}
        <Text style={styles.help}>Home and Settings are always available. Selecting a Health item adds the Health tab.</Text>
        <Pressable accessibilityRole="button" onPress={() => setStep('review')} style={styles.primary}><Text style={styles.primaryText}>Review my setup</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setStep('welcome')} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'review' && <>
        <Text style={styles.title}>Your Reclaim setup</Text>
        <Text style={styles.body}>Home will show quick actions first, followed by your selected areas. You can rearrange Home afterward.</Text>
        <View style={styles.reviewCard}>
          <Text style={styles.infoTitle}>Bottom tabs</Text>
          <Text style={styles.reviewText}>{tabs.join(' · ')}</Text>
          {healthChoices.length > 0 && <><Text style={[styles.infoTitle, styles.reviewHeading]}>Inside Health</Text><Text style={styles.reviewText}>{healthChoices.map((item) => item.label).join(' · ')}</Text></>}
        </View>
        <Text style={styles.help}>Your choices only control what appears. You can turn areas on or off later without deleting saved history.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setStep('guide')} style={styles.primary}><Text style={styles.primaryText}>Continue to first steps</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setStep('choices')} style={styles.secondary}><Text style={styles.secondaryText}>Change choices</Text></Pressable>
      </>}
      {step === 'guide' && <>
        <Text style={styles.title}>Start with one thing.</Text>
        <Text style={styles.body}>Your tabs are ready. Nothing is logged automatically just because you selected an area; open a tab to set a goal or add your first record.</Text>
        {selected.includes('nutrition') && <View style={styles.info}><Text style={styles.infoTitle}>Nutrition: set your targets first</Text><Text style={styles.infoText}>Open Nutrition → Goals & Meals to enter your own carb, protein, fat, and fiber targets. Your calorie and macro rings appear after targets are set and food is logged. You can still log food before setting goals.</Text></View>}
        {selected.includes('habits') && <View style={styles.info}><Text style={styles.infoTitle}>Habits: choose what to track</Text><Text style={styles.infoText}>Open Habits to add a good habit or a quitting and tapering tracker. Each one has its own goal and logging controls.</Text></View>}
        <View style={styles.info}><Text style={styles.infoTitle}>You can change this later</Text><Text style={styles.infoText}>Use Settings to show or hide areas. Your saved records are not deleted when a tab is hidden.</Text></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void finish(); }} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving setup…' : 'Open Reclaim'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setStep('review')} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
    </ScrollView>
    <Modal visible={privacyOpen} animationType="slide" onRequestClose={() => setPrivacyOpen(false)}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView><PrivacyContent /></ScrollView><Pressable accessibilityRole="button" onPress={() => setPrivacyOpen(false)} style={styles.privacyClose}><Text style={styles.primaryText}>Close</Text></Pressable></SafeAreaView></Modal>
  </SafeAreaView>;
}

function Choice({ label, description, checked, onPress }: { label: string; description: string; checked: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onPress} style={[styles.choice, checked && styles.choiceSelected]}>
    <View style={styles.choiceBody}><Text style={styles.choiceTitle}>{label}</Text><Text style={styles.choiceDescription}>{description}</Text></View>
    <View style={[styles.check, checked && styles.checkSelected]}><Text style={styles.checkMark}>{checked ? '✓' : ''}</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 38 },
  icon: { width: 46, height: 46, borderRadius: 12 }, brandName: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  step: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 34, lineHeight: 39, fontWeight: '900', marginTop: 12 },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 23, marginTop: 14 },
  info: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 28 },
  infoTitle: { color: colors.text, fontSize: 16, fontWeight: '800' }, infoText: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  group: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 27, marginBottom: 10 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 74, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, marginBottom: 9 },
  choiceSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, choiceBody: { flex: 1 }, choiceTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, choiceDescription: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  check: { width: 25, height: 25, borderRadius: 8, borderWidth: 1, borderColor: colors.textDim, alignItems: 'center', justifyContent: 'center' }, checkSelected: { backgroundColor: colors.accent, borderColor: colors.accent }, checkMark: { color: colors.background, fontSize: 17, fontWeight: '900' },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 16 }, reviewCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 24 }, reviewHeading: { marginTop: 20 }, reviewText: { color: colors.textMuted, fontSize: 14, lineHeight: 23, marginTop: 10 },
  primary: { minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 15, marginTop: 25 }, primaryText: { color: colors.background, fontSize: 15, fontWeight: '900' }, secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, secondaryText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' }, error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 18 }, disabled: { opacity: .6 },
  privacyClose: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, margin: spacing.lg, borderRadius: 14 },
});
