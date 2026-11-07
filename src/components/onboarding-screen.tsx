import { useState } from 'react';
import { Image, ImageSourcePropType, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrivacyContent } from '@/components/privacy-content';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { PersonalDetailsFields } from '@/components/personal-details';
import { EMPTY_DETAILS, parseDetails } from '@/lib/personal-details';
import { needsPersonalDetails, BUILD_SUGGESTIONS, navigationOrderFromPicks, ONBOARDING_AREAS, OnboardingSetupDraft, parseFirstNutrition, parseFirstStepGoal, parseFirstWeight, QUIT_SUGGESTIONS } from '@/lib/onboarding';
import { localDateKey } from '@/lib/progress';
import { OnboardingArea, OnboardingQuit } from '@/models/tracker';
import { colors, layout, spacing, font } from '@/theme';
import { DateField } from '@/components/date-field';

type Props = {
  selected: OnboardingArea[];
  draft: OnboardingSetupDraft;
  onChange: (update: (previous: OnboardingArea[]) => OnboardingArea[]) => void;
  onDraftChange: (update: OnboardingSetupDraft | ((previous: OnboardingSetupDraft) => OnboardingSetupDraft)) => void;
  onFinish: () => Promise<void>;
};

export function OnboardingScreen({ selected, draft, onChange, onDraftChange, onFinish }: Props) {
  const insets = useSafeAreaInsets();
  type Step = 'welcome' | 'choices' | 'quit' | 'build' | 'weight' | 'nutrition' | 'activity' | 'details' | 'finish';
  const [step, setStep] = useState<Step>(selected.length ? 'choices' : 'welcome');
  const [busy, setBusy] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [error, setError] = useState('');
  const [customQuit, setCustomQuit] = useState('');
  const [[today, yesterday]] = useState(() => { const now = new Date(); return [localDateKey(now), localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))]; });
  const sequence: Step[] = ['welcome', 'choices',
    ...(selected.includes('habits') ? ['build', 'quit'] as const : []),
    ...(selected.includes('weight') ? ['weight'] as const : []),
    ...(selected.includes('nutrition') ? ['nutrition'] as const : []),
    ...(selected.includes('activity') ? ['activity'] as const : []),
    ...(needsPersonalDetails(selected) ? ['details'] as const : []),
    'finish'];
  const position = Math.max(0, sequence.indexOf(step));
  const go = (offset: 1 | -1) => { setError(''); setStep(sequence[Math.min(sequence.length - 1, Math.max(0, position + offset))]); };
  const next = () => go(1);
  const back = () => go(-1);
  const labels: Record<string, string> = { goals: 'Habits', activity: 'Steps', routes: 'Routes', weight: 'Weight', nutrition: 'Nutrition', workouts: 'Workouts', supplements: 'Supplements' };
  const sectionArea: Record<string, OnboardingArea> = { goals: 'habits', activity: 'activity', routes: 'routes', weight: 'weight', nutrition: 'nutrition', workouts: 'workouts', supplements: 'supplements' };
  const tabs = ['Home', ...navigationOrderFromPicks(selected).filter((section) => selected.includes(sectionArea[section])).map((section) => labels[section]), 'Settings'];
  const toggle = (area: OnboardingArea) => {
    if (busy) return;
    onChange((previous) => previous.includes(area) ? previous.filter((item) => item !== area) : [...previous, area]);
  };
  const quits = draft.quits ?? [];
  const builds = draft.builds ?? [];
  const toggleQuit = (pick: Omit<OnboardingQuit, 'id' | 'startDate'>) => onDraftChange((previous) => {
    const list = previous.quits ?? [];
    const found = list.some((item) => item.name.toLowerCase() === pick.name.toLowerCase());
    return { ...previous, quits: found ? list.filter((item) => item.name.toLowerCase() !== pick.name.toLowerCase()) : [...list, { ...pick, id: `quit-${Date.now().toString(36)}-${list.length}`, startDate: today }] };
  });
  const updateQuit = (id: string, patch: Partial<OnboardingQuit>) => onDraftChange((previous) => ({ ...previous, quits: (previous.quits ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const addCustomQuit = () => {
    const name = customQuit.trim();
    if (!name) return;
    if (!quits.some((item) => item.name.toLowerCase() === name.toLowerCase())) toggleQuit({ name, icon: '●', color: colors.habitsNav });
    setCustomQuit('');
  };
  const toggleBuild = (id: NonNullable<OnboardingSetupDraft['builds']>[number]) => onDraftChange((previous) => {
    const list = previous.builds ?? [];
    return { ...previous, builds: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] };
  });
  const continueQuit = () => {
    const bad = quits.find((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.startDate) || Number.isNaN(Date.parse(`${item.startDate}T00:00:00`)) || item.startDate > today);
    if (bad) { setError(`Enter ${bad.name}’s quit date as MM/DD/YYYY, today or earlier.`); return; }
    const badCost = quits.find((item) => item.weeklyCost?.trim() && !/^\d+(?:\.\d{1,2})?$/.test(item.weeklyCost.trim()));
    if (badCost) { setError(`Enter ${badCost.name}’s weekly cost as a dollar amount, like 25 or 12.50.`); return; }
    next();
  };
  const updateWeight = (patch: Partial<NonNullable<OnboardingSetupDraft['weight']>>) => onDraftChange((previous) => ({ ...previous, weight: { value: '', unit: 'lb', ...previous.weight, ...patch, skipped: false } }));
  const updateNutrition = (patch: Partial<NonNullable<OnboardingSetupDraft['nutrition']>>) => onDraftChange((previous) => ({ ...previous, nutrition: { calories: '', carbs: '', protein: '', fat: '', fiber: '', ...previous.nutrition, ...patch, skipped: false } }));
  const updateActivity = (patch: Partial<NonNullable<OnboardingSetupDraft['activity']>>) => onDraftChange((previous) => ({ ...previous, activity: { stepGoal: '', enableStepTracking: false, ...previous.activity, ...patch, skipped: false } }));
  const continueWeight = () => {
    try { parseFirstWeight(draft.weight?.value ?? ''); onDraftChange({ ...draft, weight: { value: draft.weight!.value, unit: draft.weight!.unit, skipped: false } }); next(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your weight.'); }
  };
  const continueNutrition = () => {
    try { parseFirstNutrition({ calories: '', carbs: '', protein: '', fat: '', fiber: '', ...draft.nutrition }); onDraftChange({ ...draft, nutrition: { calories: draft.nutrition!.calories, carbs: draft.nutrition!.carbs, protein: draft.nutrition!.protein, fat: draft.nutrition!.fat, fiber: draft.nutrition!.fiber, skipped: false } }); next(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your targets.'); }
  };
  const continueActivity = () => {
    try { parseFirstStepGoal(draft.activity?.stepGoal ?? ''); onDraftChange({ ...draft, activity: { stepGoal: draft.activity!.stepGoal, enableStepTracking: draft.activity?.enableStepTracking ?? false, skipped: false } }); next(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your step goal.'); }
  };
  const details = draft.details ?? { ...EMPTY_DETAILS };
  const askWeightWithDetails = !selected.includes('weight');
  const continueDetails = () => {
    try {
      parseDetails(details);
      if (askWeightWithDetails && draft.weight?.value.trim()) parseFirstWeight(draft.weight.value);
      onDraftChange((previous) => ({ ...previous, details: { ...details, skipped: false } }));
      next();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your details.'); }
  };
  const skipDetails = () => {
    onDraftChange((previous) => ({ ...previous, details: { ...details, skipped: true }, weight: askWeightWithDetails && previous.weight ? { ...previous.weight, skipped: true } : previous.weight }));
    next();
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
    <KeyboardSafeScrollView key={step} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.brand}>
        <Image source={require('../../assets/images/reclaim-icon.png')} style={styles.icon} />
        <Text style={styles.brandName}>Reclaim</Text>
        {step !== 'welcome' && <Text style={styles.stepCount}>{position} of {sequence.length - 1}</Text>}
      </View>
      {step !== 'welcome' && <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{sequence.slice(1).map((item, index) => <View key={item} style={[styles.progressDot, index < position && styles.progressDotOn]} />)}</View>}
      <Text style={styles.step}>{({ welcome: 'WELCOME', choices: 'YOUR AREAS', quit: 'QUITTING · OPTIONAL', build: 'GOOD HABITS', details: 'YOUR DETAILS · OPTIONAL', weight: 'FIRST WEIGH-IN', nutrition: 'NUTRITION TARGETS', activity: 'DAILY STEPS', finish: 'READY' } as const)[step]}</Text>
      {step === 'welcome' && <>
        <Text style={styles.title}>Your health and habits, in one place.</Text>
        <Text style={styles.body}>Steps, walks and hikes, workouts, food, weight and habits. Pick the ones you care about, and Reclaim shows only those.</Text>
        <View style={styles.values}>
          {[['Built around what you choose', 'Turn sections on or off anytime. Nothing you don’t use takes up space.'], ['See your progress add up', 'Goals, trends and streaks for everything you track.'], ['Private by design', 'Everything stays on this phone. No account, nothing uploaded.']].map(([title, detail]) => <View key={title} style={styles.value}><View style={styles.valueDot} /><View style={{ flex: 1 }}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoText}>{detail}</Text></View></View>)}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setPrivacyOpen(true)}><Text style={styles.help}>Privacy & data →</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setStep('choices')} style={styles.primary}><Text style={styles.primaryText}>Get started</Text></Pressable>
      </>}
      {step === 'choices' && <>
        <Text style={styles.title}>What do you want to track?</Text>
        <Text style={styles.body}>Pick what matters to you. Your tabs follow the order you pick them in, and you can change any of this later in Settings.</Text>
        <View style={{ marginTop: 22 }}>{ONBOARDING_AREAS.map((item) => <Choice key={item.id} {...item} icon={AREA_ICONS[item.id]} order={selected.indexOf(item.id) + 1} checked={selected.includes(item.id)} onPress={() => toggle(item.id)} />)}</View>
        <Text style={styles.help}>Home and Settings are always there.</Text>
        <Pressable accessibilityRole="button" onPress={next} style={styles.primary}><Text style={styles.primaryText}>{selected.length ? 'Continue' : 'Continue without picking'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'quit' && <>
        <Text style={styles.title}>Cutting anything out?</Text>
        <Text style={styles.body}>Optional. If there’s something you want to quit or cut back on, Reclaim counts the days from your quit date. Add what it used to cost and it shows the money you’ve kept, too.</Text>
        <View style={styles.chips}>{QUIT_SUGGESTIONS.map((item) => { const on = quits.some((quit) => quit.name === item.name); return <Pressable key={item.name} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on} onPress={() => toggleQuit(item)} style={[styles.chip, on && { borderColor: item.color, backgroundColor: `${item.color}1F` }]}><Text style={[styles.chipText, on && { color: item.color }]}>{on ? '✓ ' : ''}{item.name}</Text></Pressable>; })}</View>
        <View style={styles.customRow}><TextInput accessibilityLabel="Something else you're quitting" value={customQuit} onChangeText={setCustomQuit} onSubmitEditing={addCustomQuit} placeholder="Something else…" placeholderTextColor={colors.textDim} style={[styles.input, { flex: 1 }]} returnKeyType="done" /><Pressable accessibilityRole="button" onPress={addCustomQuit} style={styles.addButton}><Text style={styles.addText}>Add</Text></Pressable></View>
        {quits.map((quit) => { const preset = quit.startDate === today ? 'today' : quit.startDate === yesterday ? 'yesterday' : 'earlier'; return <View key={quit.id} style={[styles.quitCard, { borderColor: `${quit.color}55` }]}>
          <View style={styles.quitHead}><Text style={[styles.quitName, { color: quit.color }]}>{quit.name}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${quit.name}`} hitSlop={10} onPress={() => toggleQuit(quit)}><Text style={styles.remove}>Remove</Text></Pressable></View>
          <Text style={styles.fieldLabel}>QUIT DATE</Text>
          <View style={[styles.chips, { marginTop: 0 }]}>{(['today', 'yesterday', 'earlier'] as const).map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: preset === option }} onPress={() => updateQuit(quit.id, { startDate: option === 'today' ? today : option === 'yesterday' ? yesterday : preset === 'earlier' ? quit.startDate : '' })} style={[styles.chip, preset === option && styles.chipOn]}><Text style={[styles.chipText, preset === option && styles.chipTextOn]}>{option === 'today' ? 'Today' : option === 'yesterday' ? 'Yesterday' : 'Earlier…'}</Text></Pressable>)}</View>
          {preset === 'earlier' && <DateField accessibilityLabel={`${quit.name} quit date`} value={quit.startDate} onChangeText={(value) => updateQuit(quit.id, { startDate: value })} placeholderTextColor={colors.textDim} style={[styles.input, { marginTop: 10 }]} />}
          <Text style={styles.fieldLabel}>SPENT PER WEEK · OPTIONAL</Text>
          <TextInput accessibilityLabel={`${quit.name} weekly cost in dollars`} value={quit.weeklyCost ?? ''} onChangeText={(value) => updateQuit(quit.id, { weeklyCost: value })} placeholder="$ e.g. 25" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" style={styles.input} />
        </View>; })}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={continueQuit} style={styles.primary}><Text style={styles.primaryText}>{quits.length ? 'Continue' : 'Nothing to quit, continue'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'build' && <>
        <Text style={styles.title}>What do you want to build?</Text>
        <Text style={styles.body}>Pick a few to start. Each begins with a gentle goal you can change anytime.</Text>
        <View style={{ marginTop: 22 }}>{BUILD_SUGGESTIONS.map((item) => <Choice key={item.id} label={item.label} description={item.goal} checked={builds.includes(item.id)} onPress={() => toggleBuild(item.id)} />)}</View>
        <Pressable accessibilityRole="button" onPress={next} style={styles.primary}><Text style={styles.primaryText}>{builds.length ? 'Continue' : 'Skip for now'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'weight' && <>
        <Text style={styles.title}>Start with your current weight.</Text>
        <Text style={styles.body}>This creates your first weigh-in for today. You can edit it later in Weight.</Text>
        <Text style={styles.fieldLabel}>CURRENT WEIGHT</Text>
        <TextInput accessibilityLabel="Current weight" keyboardType="decimal-pad" placeholder="Enter weight" placeholderTextColor={colors.textDim} value={draft.weight?.value ?? ''} onChangeText={(value) => updateWeight({ value })} style={styles.input} />
        <View style={styles.unitRow}>{(['lb', 'kg'] as const).map((unit) => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: (draft.weight?.unit ?? 'lb') === unit }} onPress={() => updateWeight({ unit })} style={[styles.unitButton, (draft.weight?.unit ?? 'lb') === unit && styles.unitSelected]}><Text style={styles.unitText}>{unit}</Text></Pressable>)}</View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={continueWeight} style={styles.primary}><Text style={styles.primaryText}>Save and continue</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { onDraftChange((previous) => ({ ...previous, weight: { value: previous.weight?.value ?? '', unit: previous.weight?.unit ?? 'lb', skipped: true } })); next(); }} style={styles.secondary}><Text style={styles.secondaryText}>Skip for now</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'nutrition' && <>
        <Text style={styles.title}>Set your daily calorie target.</Text>
        <Text style={styles.body}>Enter a calorie target you chose. Protein, carbs, and fat targets are optional; leave all three blank to track calories only. You can use an optional editable split calculator later in Nutrition → Macros. Nothing is saved until you finish setup.</Text>
        <Text style={styles.fieldLabel}>CALORIES · KCAL</Text><TextInput accessibilityLabel="Daily calorie target" keyboardType="number-pad" placeholder="Enter calories" placeholderTextColor={colors.textDim} value={draft.nutrition?.calories ?? ''} onChangeText={(value) => updateNutrition({ calories: value })} style={styles.input} />
        {([['Carbs', 'carbs'], ['Protein', 'protein'], ['Fat', 'fat']] as const).map(([label, key]) => <View key={key}><Text style={styles.fieldLabel}>{label.toUpperCase()} · G</Text><TextInput accessibilityLabel={`${label} target in grams`} keyboardType="decimal-pad" placeholder="Enter grams" placeholderTextColor={colors.textDim} value={draft.nutrition?.[key] ?? ''} onChangeText={(value) => updateNutrition({ [key]: value })} style={styles.input} /></View>)}
        <View style={styles.info}><Text style={styles.infoTitle}>Your calorie target</Text><Text style={styles.infoText}>{draft.nutrition?.calories?.trim() || '—'} kcal · No food has been logged.</Text></View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={continueNutrition} style={styles.primary}><Text style={styles.primaryText}>Save and continue</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { onDraftChange((previous) => ({ ...previous, nutrition: { calories: previous.nutrition?.calories ?? '', carbs: previous.nutrition?.carbs ?? '', protein: previous.nutrition?.protein ?? '', fat: previous.nutrition?.fat ?? '', fiber: previous.nutrition?.fiber ?? '', skipped: true } })); next(); }} style={styles.secondary}><Text style={styles.secondaryText}>Skip for now</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'activity' && <>
        <Text style={styles.title}>Give your steps a goal.</Text>
        <Text style={styles.body}>Choose your own daily step goal. It will appear on Home even before your phone has counted steps.</Text>
        <Text style={styles.fieldLabel}>DAILY STEP GOAL</Text>
        <TextInput accessibilityLabel="Daily step goal" keyboardType="number-pad" placeholder="Enter steps" placeholderTextColor={colors.textDim} value={draft.activity?.stepGoal ?? ''} onChangeText={(stepGoal) => updateActivity({ stepGoal })} style={styles.input} />
        {Platform.OS === 'android' && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.activity?.enableStepTracking ?? false }} accessibilityLabel="Enable phone step tracking" onPress={() => updateActivity({ enableStepTracking: !draft.activity?.enableStepTracking })} style={[styles.choice, draft.activity?.enableStepTracking && styles.choiceSelected]}><View style={styles.choiceBody}><Text style={styles.choiceTitle}>Count steps on this phone</Text><Text style={styles.choiceDescription}>Optional. When you finish setup, Android will ask for physical-activity access and may ask to show the step-counting notification. You can turn tracking off later in Settings.</Text></View><View style={[styles.check, draft.activity?.enableStepTracking && styles.checkSelected]}><Text style={styles.checkMark}>{draft.activity?.enableStepTracking ? '✓' : ''}</Text></View></Pressable>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={continueActivity} style={styles.primary}><Text style={styles.primaryText}>Save goal and continue</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { onDraftChange((previous) => ({ ...previous, activity: { stepGoal: previous.activity?.stepGoal ?? '', enableStepTracking: false, skipped: true } })); next(); }} style={styles.secondary}><Text style={styles.secondaryText}>Skip for now</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'details' && <>
        <Text style={styles.title}>A few details for your calorie estimates.</Text>
        <Text style={styles.body}>These stay on this phone. Fill in what you’re comfortable with and leave the rest blank.</Text>
        <PersonalDetailsFields draft={details} onChange={(patch) => { setError(''); onDraftChange((previous) => ({ ...previous, details: { ...details, ...patch, skipped: false } })); }} weight={askWeightWithDetails ? { value: draft.weight?.value ?? '', unit: draft.weight?.unit ?? 'lb' } : undefined} onWeightChange={(patch) => updateWeight(patch)} />
        <Text style={styles.help}>Without your weight, step calories use an average and routes show no calories. Without your height, birth year and formula choice, resting calories (BMR) won’t show. You can add these any time.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={continueDetails} style={styles.primary}><Text style={styles.primaryText}>Save and continue</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={skipDetails} style={styles.secondary}><Text style={styles.secondaryText}>Skip for now</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
      {step === 'finish' && <>
        <Text style={styles.title}>You’re all set.</Text>
        <Text style={styles.body}>Here’s what Reclaim will set up when you open it.</Text>
        <View style={styles.info}>
          {quits.length > 0 && <Text style={styles.summaryLine}>{quits.length === 1 ? `Your ${quits[0].name} timer starts counting` : `${quits.length} quit timers start counting`}</Text>}
          {builds.length > 0 && <Text style={styles.summaryLine}>{builds.length} {builds.length === 1 ? 'good habit' : 'good habits'} ready to log</Text>}
          {selected.includes('weight') && !!draft.weight?.value?.trim() && !draft.weight.skipped && <Text style={styles.summaryLine}>First weigh-in: {draft.weight.value} {draft.weight.unit}</Text>}
          {selected.includes('nutrition') && !!draft.nutrition?.calories?.trim() && !draft.nutrition.skipped && <Text style={styles.summaryLine}>Daily target: {draft.nutrition.calories} kcal</Text>}
          {selected.includes('activity') && !!draft.activity?.stepGoal?.trim() && !draft.activity.skipped && <Text style={styles.summaryLine}>Step goal: {Number(draft.activity.stepGoal).toLocaleString()} a day</Text>}
          <Text style={styles.infoTitle}>Your tabs</Text>
          <Text style={styles.infoText}>{tabs.join('  ·  ')}</Text>
        </View>
        {selected.includes('activity') && draft.activity?.enableStepTracking && !draft.activity.skipped && <Text style={styles.help}>Android will ask for physical-activity access when you open Reclaim. If you decline, your step goal is still saved.</Text>}
        <Text style={styles.help}>Swipe left and right to move between your tabs. Hiding a tab later never deletes its history.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void finish(); }} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Setting up…' : 'Open Reclaim'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={back} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
      </>}
    </KeyboardSafeScrollView>
    <Modal visible={privacyOpen} animationType="slide" onRequestClose={() => setPrivacyOpen(false)}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView><PrivacyContent /></ScrollView><Pressable accessibilityRole="button" onPress={() => setPrivacyOpen(false)} style={styles.privacyClose}><Text style={styles.primaryText}>Close</Text></Pressable></SafeAreaView></Modal>
  </SafeAreaView>;
}

const AREA_ICONS: Partial<Record<OnboardingArea, ImageSourcePropType>> = {
  habits: require('../../assets/images/nav/habits.png'),
  nutrition: require('../../assets/images/nav/nutrition.png'),
  supplements: require('../../assets/images/nav/supplements.png'),
  weight: require('../../assets/images/nav/weight.png'),
  workouts: require('../../assets/images/nav/workouts.png'),
  activity: require('../../assets/images/nav/steps.png'),
  routes: require('../../assets/images/nav/routes.png'),
};

function Choice({ label, description, checked, onPress, icon, order }: { label: string; description: string; checked: boolean; onPress: () => void; icon?: ImageSourcePropType; order?: number }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={`${label}. ${description}`} accessibilityState={{ checked }} aria-checked={checked} onPress={onPress} style={[styles.choice, checked && styles.choiceSelected]}>
    {icon && <Image source={icon} style={styles.choiceIcon} accessible={false} />}
    <View style={styles.choiceBody}><Text style={styles.choiceTitle}>{label}</Text><Text style={styles.choiceDescription}>{description}</Text></View>
    <View style={[styles.check, checked && styles.checkSelected]}><Text style={styles.checkMark}>{checked ? (order && order > 0 ? String(order) : '✓') : ''}</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  stepCount: { marginLeft: 'auto', color: colors.textMuted, fontSize: 12, fontFamily: font.semibold },
  progress: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressDotOn: { backgroundColor: colors.accent },
  values: { gap: 18, marginTop: 28 },
  value: { flexDirection: 'row', gap: 14 },
  valueDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 7 },
  choiceIcon: { width: 40, height: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold },
  chipTextOn: { color: colors.accent },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  addButton: { minWidth: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.accent },
  addText: { color: colors.accent, fontSize: 15, fontFamily: font.bold },
  quitCard: { borderWidth: 1, borderRadius: 18, backgroundColor: colors.surface, padding: 16, marginTop: 16 },
  quitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quitName: { fontSize: 17, fontFamily: font.bold },
  remove: { color: colors.textMuted, fontSize: 13, fontFamily: font.semibold },
  summaryLine: { color: colors.text, fontSize: 15, fontFamily: font.semibold, marginBottom: 12 },
  icon: { width: 36, height: 36, borderRadius: 10 }, brandName: { color: colors.text, fontSize: 20, fontFamily: font.bold },
  step: { color: colors.accent, fontSize: 11, fontFamily: font.bold, letterSpacing: 2 },
  title: { color: colors.text, fontSize: 34, lineHeight: 39, fontFamily: font.bold, marginTop: 12 },
  body: { color: colors.textMuted, fontSize: 15, fontFamily: font.regular, lineHeight: 23, marginTop: 14 },
  info: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 28 },
  infoTitle: { color: colors.text, fontSize: 16, fontFamily: font.semibold }, infoText: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 20, marginTop: 8 },
  group: { color: colors.accent, fontSize: 11, fontFamily: font.semibold, letterSpacing: 1.2, marginTop: 27, marginBottom: 10 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 74, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, marginBottom: 9 },
  choiceSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, choiceBody: { flex: 1 }, choiceTitle: { color: colors.text, fontSize: 15, fontFamily: font.semibold }, choiceDescription: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18, marginTop: 4 },
  check: { width: 25, height: 25, borderRadius: 8, borderWidth: 1, borderColor: colors.textDim, alignItems: 'center', justifyContent: 'center' }, checkSelected: { backgroundColor: colors.accent, borderColor: colors.accent }, checkMark: { color: colors.background, fontSize: 17, fontFamily: font.bold },
  help: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 19, marginTop: 16 }, reviewCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: spacing.lg, marginTop: 24 }, reviewHeading: { marginTop: 20 }, reviewText: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, lineHeight: 23, marginTop: 10 },
  primary: { minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 15, marginTop: 25 }, primaryText: { color: colors.background, fontSize: 15, fontFamily: font.bold }, secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, secondaryText: { color: colors.textMuted, fontSize: 14, fontFamily: font.bold }, error: { color: colors.danger, fontSize: 13, fontFamily: font.regular, lineHeight: 19, marginTop: 18 }, disabled: { opacity: .6 },
  aiButton: { minHeight: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nutritionNav, borderRadius: 15, marginTop: 24, paddingHorizontal: 16 }, aiButtonText: { color: colors.background, fontSize: 16, fontFamily: font.bold, textAlign: 'center' },
  privacyClose: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, margin: spacing.lg, borderRadius: 14 },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontFamily: font.semibold, marginTop: 22, marginBottom: 8 },
  input: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, minHeight: 54, paddingHorizontal: 16, fontSize: 18 , fontFamily: font.regular},
  unitRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  unitButton: { minWidth: 80, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  unitSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  unitText: { color: colors.text, fontFamily: font.semibold },
});
