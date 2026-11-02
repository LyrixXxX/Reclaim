import { useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrivacyContent } from '@/components/privacy-content';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { ONBOARDING_AREAS, OnboardingSetupDraft, parseFirstNutrition, parseFirstStepGoal, parseFirstWeight } from '@/lib/onboarding';
import { OnboardingArea } from '@/models/tracker';
import { colors, layout, spacing } from '@/theme';

type Props = {
  selected: OnboardingArea[];
  draft: OnboardingSetupDraft;
  onChange: (selected: OnboardingArea[]) => void;
  onDraftChange: (draft: OnboardingSetupDraft) => void;
  onFinish: () => Promise<void>;
};

export function OnboardingScreen({ selected, draft, onChange, onDraftChange, onFinish }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'welcome' | 'choices' | 'review' | 'weight' | 'nutrition' | 'activity' | 'finish'>(selected.length ? 'choices' : 'welcome');
  const [busy, setBusy] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [error, setError] = useState('');
  const tabs = [
    'Home',
    ...(selected.includes('activity') ? ['Steps'] : []),
    ...(selected.includes('routes') ? ['Routes'] : []),
    ...(selected.includes('habits') ? ['Habits'] : []),
    ...(selected.includes('weight') ? ['Weight'] : []),
    ...(selected.includes('nutrition') ? ['Nutrition'] : []),
    ...(selected.includes('workouts') ? ['Workouts'] : []),
    ...(selected.includes('supplements') ? ['Supplements'] : []),
    'Settings',
  ];
  const toggle = (area: OnboardingArea) => {
    if (busy) return;
    onChange(selected.includes(area) ? selected.filter((item) => item !== area) : [...selected, area]);
  };
  const firstSetupStep = () => selected.includes('weight') ? 'weight' : selected.includes('nutrition') ? 'nutrition' : selected.includes('activity') ? 'activity' : 'finish';
  const nextAfterWeight = () => selected.includes('nutrition') ? 'nutrition' : selected.includes('activity') ? 'activity' : 'finish';
  const nextAfterNutrition = () => selected.includes('activity') ? 'activity' : 'finish';
  const updateWeight = (patch: Partial<NonNullable<OnboardingSetupDraft['weight']>>) => onDraftChange({ ...draft, weight: { value: '', unit: 'lb', ...draft.weight, ...patch, skipped: false } });
  const updateNutrition = (patch: Partial<NonNullable<OnboardingSetupDraft['nutrition']>>) => onDraftChange({ ...draft, nutrition: { calories: '', carbs: '', protein: '', fat: '', fiber: '', ...draft.nutrition, ...patch, skipped: false } });
  const updateActivity = (patch: Partial<NonNullable<OnboardingSetupDraft['activity']>>) => onDraftChange({ ...draft, activity: { stepGoal: '', enableStepTracking: false, ...draft.activity, ...patch, skipped: false } });
  const continueWeight = () => {
    try { parseFirstWeight(draft.weight?.value ?? ''); onDraftChange({ ...draft, weight: { value: draft.weight!.value, unit: draft.weight!.unit, skipped: false } }); setError(''); setStep(nextAfterWeight()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your weight.'); }
  };
  const continueNutrition = () => {
    try { parseFirstNutrition({ calories: '', carbs: '', protein: '', fat: '', fiber: '', ...draft.nutrition }); onDraftChange({ ...draft, nutrition: { calories: draft.nutrition!.calories, carbs: draft.nutrition!.carbs, protein: draft.nutrition!.protein, fat: draft.nutrition!.fat, fiber: draft.nutrition!.fiber, skipped: false } }); setError(''); setStep(nextAfterNutrition()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your targets.'); }
  };
  const continueActivity = () => {
    try { parseFirstStepGoal(draft.activity?.stepGoal ?? ''); onDraftChange({ ...draft, activity: { stepGoal: draft.activity!.stepGoal, enableStepTracking: draft.activity?.enableStepTracking ?? false, skipped: false } }); setError(''); setStep('finish'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your step goal.'); }
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
    <KeyboardSafeScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.brand}><Image source={require('../../assets/images/reclaim-icon.png')} style={styles.icon} /><Text style={styles.brandName}>RECLAIM</Text></View>
      <Text style={styles.step}>{step === 'welcome' ? 'WELCOME' : step === 'choices' ? 'YOUR CHOICES' : step === 'review' ? 'YOUR SETUP' : step === 'weight' ? 'FIRST WEIGH-IN' : step === 'nutrition' ? 'NUTRITION TARGETS' : step === 'activity' ? 'DAILY STEPS' : 'READY TO START'}</Text>
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
        {ONBOARDING_AREAS.map((item) => <Choice key={item.id} {...item} checked={selected.includes(item.id)} onPress={() => toggle(item.id)} />)}
        <Text style={styles.help}>Home and Settings are always available.</Text>
        <Pressable accessibilityRole="button" onPress={() => setStep('review')} style={styles.primary}><Text style={styles.primaryText}>Review my setup</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setStep('welcome')} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'review' && <>
        <Text style={styles.title}>Your Reclaim setup</Text>
        <Text style={styles.body}>Home will show quick actions first, followed by your selected areas. You can rearrange Home afterward.</Text>
        <View style={styles.reviewCard}>
          <Text style={styles.infoTitle}>Bottom tabs</Text>
          <Text style={styles.reviewText}>{tabs.join(' · ')}</Text>
        </View>
        <Text style={styles.help}>Your choices only control what appears. You can turn areas on or off later without deleting saved history.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setError(''); setStep(firstSetupStep()); }} style={styles.primary}><Text style={styles.primaryText}>Continue to first steps</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setStep('choices')} style={styles.secondary}><Text style={styles.secondaryText}>Change choices</Text></Pressable>
      </>}
      {step === 'weight' && <>
        <Text style={styles.title}>Start with your current weight.</Text>
        <Text style={styles.body}>This creates your first weigh-in for today. You can edit it later in Weight.</Text>
        <Text style={styles.fieldLabel}>CURRENT WEIGHT</Text>
        <TextInput accessibilityLabel="Current weight" keyboardType="decimal-pad" placeholder="Enter weight" placeholderTextColor={colors.textDim} value={draft.weight?.value ?? ''} onChangeText={(value) => updateWeight({ value })} style={styles.input} />
        <View style={styles.unitRow}>{(['lb', 'kg'] as const).map((unit) => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: (draft.weight?.unit ?? 'lb') === unit }} onPress={() => updateWeight({ unit })} style={[styles.unitButton, (draft.weight?.unit ?? 'lb') === unit && styles.unitSelected]}><Text style={styles.unitText}>{unit}</Text></Pressable>)}</View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={continueWeight} style={styles.primary}><Text style={styles.primaryText}>Save and continue</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { onDraftChange({ ...draft, weight: { value: draft.weight?.value ?? '', unit: draft.weight?.unit ?? 'lb', skipped: true } }); setError(''); setStep(nextAfterWeight()); }} style={styles.secondary}><Text style={styles.secondaryText}>Skip for now</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setError(''); setStep('review'); }} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'nutrition' && <>
        <Text style={styles.title}>Set your daily calorie target.</Text>
        <Text style={styles.body}>Enter a calorie target you chose. Protein, carbs, and fat targets are optional; leave all three blank to track calories only. You can use an optional editable split calculator later in Nutrition → Macros. Nothing is saved until you finish setup.</Text>
        <Text style={styles.fieldLabel}>CALORIES · KCAL</Text><TextInput accessibilityLabel="Daily calorie target" keyboardType="number-pad" placeholder="Enter calories" placeholderTextColor={colors.textDim} value={draft.nutrition?.calories ?? ''} onChangeText={(value) => updateNutrition({ calories: value })} style={styles.input} />
        {([['Carbs', 'carbs'], ['Protein', 'protein'], ['Fat', 'fat']] as const).map(([label, key]) => <View key={key}><Text style={styles.fieldLabel}>{label.toUpperCase()} · G</Text><TextInput accessibilityLabel={`${label} target in grams`} keyboardType="decimal-pad" placeholder="Enter grams" placeholderTextColor={colors.textDim} value={draft.nutrition?.[key] ?? ''} onChangeText={(value) => updateNutrition({ [key]: value })} style={styles.input} /></View>)}
        <View style={styles.info}><Text style={styles.infoTitle}>Your calorie target</Text><Text style={styles.infoText}>{draft.nutrition?.calories?.trim() || '—'} kcal · No food has been logged.</Text></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={continueNutrition} style={styles.primary}><Text style={styles.primaryText}>Save and continue</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { onDraftChange({ ...draft, nutrition: { calories: draft.nutrition?.calories ?? '', carbs: draft.nutrition?.carbs ?? '', protein: draft.nutrition?.protein ?? '', fat: draft.nutrition?.fat ?? '', fiber: draft.nutrition?.fiber ?? '', skipped: true } }); setError(''); setStep(nextAfterNutrition()); }} style={styles.secondary}><Text style={styles.secondaryText}>Skip for now</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setError(''); setStep(selected.includes('weight') ? 'weight' : 'review'); }} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'activity' && <>
        <Text style={styles.title}>Give your steps a goal.</Text>
        <Text style={styles.body}>Choose your own daily step goal. It will appear on Home even before your phone has counted steps.</Text>
        <Text style={styles.fieldLabel}>DAILY STEP GOAL</Text>
        <TextInput accessibilityLabel="Daily step goal" keyboardType="number-pad" placeholder="Enter steps" placeholderTextColor={colors.textDim} value={draft.activity?.stepGoal ?? ''} onChangeText={(stepGoal) => updateActivity({ stepGoal })} style={styles.input} />
        {Platform.OS === 'android' && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.activity?.enableStepTracking ?? false }} accessibilityLabel="Enable phone step tracking" onPress={() => updateActivity({ enableStepTracking: !draft.activity?.enableStepTracking })} style={[styles.choice, draft.activity?.enableStepTracking && styles.choiceSelected]}><View style={styles.choiceBody}><Text style={styles.choiceTitle}>Count steps on this phone</Text><Text style={styles.choiceDescription}>Optional. When you finish setup, Android will ask for physical-activity access and may ask to show the step-counting notification. You can turn tracking off later in Settings.</Text></View><View style={[styles.check, draft.activity?.enableStepTracking && styles.checkSelected]}><Text style={styles.checkMark}>{draft.activity?.enableStepTracking ? '✓' : ''}</Text></View></Pressable>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={continueActivity} style={styles.primary}><Text style={styles.primaryText}>Save goal and continue</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { onDraftChange({ ...draft, activity: { stepGoal: draft.activity?.stepGoal ?? '', enableStepTracking: false, skipped: true } }); setError(''); setStep('finish'); }} style={styles.secondary}><Text style={styles.secondaryText}>Skip for now</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setError(''); setStep(selected.includes('nutrition') ? 'nutrition' : selected.includes('weight') ? 'weight' : 'review'); }} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'finish' && <>
        <Text style={styles.title}>Start with one thing.</Text>
        <Text style={styles.body}>Your tabs are ready. Any weigh-in, nutrition targets, or step goal you entered will be saved when you open Reclaim. Skipped areas stay available to set up later.</Text>
        {selected.includes('activity') && draft.activity?.enableStepTracking && !draft.activity.skipped && <View style={styles.info}><Text style={styles.infoTitle}>Phone step tracking</Text><Text style={styles.infoText}>Android will ask for permission when you open Reclaim. If you decline or this phone cannot count steps, your goal will still be saved.</Text></View>}
        {selected.includes('habits') && <View style={styles.info}><Text style={styles.infoTitle}>Habits: choose what to track</Text><Text style={styles.infoText}>Open Habits to add a good habit or a quitting and tapering tracker. Each one has its own goal and logging controls.</Text></View>}
        <View style={styles.info}><Text style={styles.infoTitle}>You can change this later</Text><Text style={styles.infoText}>Use Settings to show or hide areas. Your saved records are not deleted when a tab is hidden.</Text></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void finish(); }} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving setup…' : 'Open Reclaim'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setStep(selected.includes('activity') ? 'activity' : selected.includes('nutrition') ? 'nutrition' : selected.includes('weight') ? 'weight' : 'review')} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
    </KeyboardSafeScrollView>
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
  aiButton: { minHeight: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nutritionNav, borderRadius: 15, marginTop: 24, paddingHorizontal: 16 }, aiButtonText: { color: colors.background, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  privacyClose: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, margin: spacing.lg, borderRadius: 14 },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 22, marginBottom: 8 },
  input: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, minHeight: 54, paddingHorizontal: 16, fontSize: 18 },
  unitRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  unitButton: { minWidth: 80, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  unitSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  unitText: { color: colors.text, fontWeight: '800' },
});
