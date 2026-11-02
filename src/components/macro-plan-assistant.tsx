import { useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from './keyboard-safe-scroll-view';
import { createLocalMacroPlan, LOSS_PACE, macroPlannerSafetyConfirmed, MacroPlan, MacroPlanAnswers, previewMacroCalculation, validateMacroAnswers, validateMacroPlan, withEstimationBasis } from '@/lib/macro-plan';
import { macroCalories } from '@/lib/nutrition';
import { colors, layout, spacing } from '@/theme';

type Props = { visible: boolean; onClose: () => void; onUse: (plan: MacroPlan) => void; savedWeight?: { value: number; unit: 'lb' | 'kg' } };
const initial: MacroPlanAnswers = { age: '', height: '', heightUnit: 'ft-in', heightFeet: '', heightInches: '', weight: '', weightUnit: 'lb', activity: '', goal: '', estimationBasis: '', trainingFocus: 'general', calorieSource: 'estimated', ownCalories: '', lossPace: 'moderate', lossPriority: 'balanced', pregnantOrBreastfeeding: false, medicalDietaryNeeds: false, eligibleConfirmed: false };

export function MacroPlanAssistant({ visible, onClose, onUse, savedWeight }: Props) {
  const [answers, setAnswers] = useState<MacroPlanAnswers>(initial);
  const [stage, setStage] = useState<'acknowledgment' | 'questions' | 'review'>('acknowledgment');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [plan, setPlan] = useState<MacroPlan | null>(null);
  const [fields, setFields] = useState({ carbs: '', protein: '', fat: '' });
  const [error, setError] = useState('');
  const update = (patch: Partial<MacroPlanAnswers>) => { setAnswers((previous) => ({ ...previous, ...patch })); setError(''); };
  const close = () => { setAnswers(initial); setAcknowledged(false); setAdvancedOpen(false); setCalculationOpen(false); setStage('acknowledgment'); setPlan(null); setFields({ carbs: '', protein: '', fat: '' }); setError(''); onClose(); };
  const generate = () => {
    try {
      if (!acknowledged) throw new Error('Acknowledge the educational-use notice before creating a plan.');
      validateMacroAnswers(answers);
      setError('');
      const next = createLocalMacroPlan(answers);
      setPlan(next);
      setFields({ carbs: String(next.carbsGrams), protein: String(next.proteinGrams), fat: String(next.fatGrams) });
      setCalculationOpen(false);
      Keyboard.dismiss();
      setStage('review');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create a plan. Manual targets remain available.'); }
  };
  const usePlan = () => {
    try {
      const numbers = Object.fromEntries(Object.entries(fields).map(([key, value]) => {
        const number = Number(value);
        if (!value.trim() || !Number.isFinite(number) || number < 0 || number > 1000) throw new Error(`Enter a valid ${key} target.`);
        return [key, number];
      }));
      const next = validateMacroPlan({ carbsGrams: numbers.carbs, proteinGrams: numbers.protein, fatGrams: numbers.fat, fiberGrams: 0, rationale: plan?.rationale, calculation: plan?.calculation, estimatedCalories: macroCalories({ carbsGrams: numbers.carbs, proteinGrams: numbers.protein, fatGrams: numbers.fat, fiberGrams: 0 }) }, true);
      onUse(next); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the macro targets.'); }
  };
  const calories = macroCalories({ carbsGrams: Number(fields.carbs) || 0, proteinGrams: Number(fields.protein) || 0, fatGrams: Number(fields.fat) || 0, fiberGrams: 0 });
  let preview: ReturnType<typeof previewMacroCalculation> | null = null;
  let previewError = '';
  try { preview = previewMacroCalculation(validateMacroAnswers(answers)); }
  catch (cause) { previewError = cause instanceof Error ? cause.message : ''; }
  const previewReady = Boolean(answers.age && answers.weight && (answers.heightUnit === 'cm' ? answers.height : answers.heightFeet && answers.heightInches) && answers.activity && answers.goal && answers.trainingFocus && answers.estimationBasis && answers.eligibleConfirmed && (answers.calorieSource === 'estimated' || answers.ownCalories));
  const safetyConfirmed = macroPlannerSafetyConfirmed(answers);
  return <Modal visible={visible} animationType="slide" onRequestClose={close}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><KeyboardSafeScrollView key={stage} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>GUIDED MACRO PLANNER</Text><Text style={styles.title}>{stage === 'acknowledgment' ? 'Before you begin' : stage === 'questions' ? 'Help me set targets' : 'Review suggested targets'}</Text>
    {stage === 'acknowledgment' ? <>
      <Text style={styles.intro}>Answer a few questions to get a starting point for daily nutrition targets.</Text>
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Your plan stays in your hands</Text>
        <Text style={styles.noticeText}>This on-device calculation is an estimate for adults seeking general wellness guidance—not medical advice. You can review and edit every target before saving. Manual entry is always available.</Text>
      </View>
      <Toggle label="I understand these generated targets are educational suggestions, not medical advice" checked={acknowledged} onPress={() => setAcknowledged((previous) => !previous)} />
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !acknowledged }} disabled={!acknowledged} onPress={() => setStage('questions')} style={[styles.primary, !acknowledged && styles.primaryDisabled]}><Text style={[styles.primaryText, !acknowledged && styles.primaryTextDisabled]}>Continue to questionnaire</Text></Pressable>
    </> : stage === 'questions' ? <>
      <Text style={styles.help}>Your answers stay on this device, are used only for this estimate, and are discarded when you leave. The estimate is not medical advice.</Text>
      <Field label="Age (18–100)" value={answers.age} onChange={(age) => update({ age })} />
      <Text style={styles.label}>Height</Text>
      <View style={styles.row}><Pressable accessibilityRole="button" accessibilityState={{ selected: answers.heightUnit === 'ft-in' }} onPress={() => update({ heightUnit: 'ft-in' })} style={[styles.choice, answers.heightUnit === 'ft-in' && styles.selected]}><Text style={styles.choiceText}>Feet + inches</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: answers.heightUnit === 'cm' }} onPress={() => update({ heightUnit: 'cm' })} style={[styles.choice, answers.heightUnit === 'cm' && styles.selected]}><Text style={styles.choiceText}>Centimeters</Text></Pressable></View>
      {answers.heightUnit === 'ft-in' ? <View style={styles.row}><View style={styles.heightField}><Field label="Feet" value={answers.heightFeet} onChange={(heightFeet) => update({ heightFeet })} /></View><View style={styles.heightField}><Field label="Inches (0–11)" value={answers.heightInches} onChange={(heightInches) => update({ heightInches })} /></View></View> : <Field label="Height (cm)" value={answers.height} onChange={(height) => update({ height })} />}
      <Field label={`Current weight (${answers.weightUnit})`} value={answers.weight} onChange={(weight) => update({ weight })} />
      <Choices label="Weight unit" value={answers.weightUnit} options={['lb', 'kg']} onChange={(weightUnit) => update({ weightUnit: weightUnit as 'lb' | 'kg' })} />
      {savedWeight && <Pressable accessibilityRole="button" onPress={() => update({ weight: String(savedWeight.value), weightUnit: savedWeight.unit })} style={styles.secondary}><Text style={styles.secondaryText}>Use my entered weight ({savedWeight.value} {savedWeight.unit})</Text></Pressable>}
      <Choices label="Usual activity" value={answers.activity} options={['low', 'moderate', 'high']} onChange={(activity) => update({ activity: activity as MacroPlanAnswers['activity'] })} />
      <Text style={styles.help}>Low: mostly sitting. Moderate: some regular movement. High: active most of the day. These broad choices make calorie estimates uncertain.</Text>
      <Choices label="Goal" value={answers.goal} options={['maintain', 'lose', 'gain']} onChange={(goal) => update({ goal: goal as MacroPlanAnswers['goal'] })} />
      {answers.goal === 'lose' && <>
        <Text style={styles.label}>How quickly would you like to lose weight?</Text>
        <PaceOption selected={answers.lossPace === 'gentle'} title="Gentle weight loss" detail="About 0.5 lb/week · 250 kcal/day initial deficit" description="A gradual approach that prioritizes sustainability, recovery, and muscle retention." onPress={() => update({ lossPace: 'gentle' })} />
        <PaceOption selected={answers.lossPace === 'moderate'} title="Moderate weight loss · recommended starting point" detail="About 1 lb/week · 500 kcal/day initial deficit" description="A balanced approach to fat loss while supporting exercise performance." onPress={() => update({ lossPace: 'moderate' })} />
        <PaceOption selected={answers.lossPace === 'faster'} title="Faster weight loss" detail="About 1.5 lb/week · 750 kcal/day initial deficit" description="Only when the estimated target leaves enough room for nutrition and recovery." onPress={() => update({ lossPace: 'faster' })} />
        <Text style={styles.help}>These rates use the 3,500-kcal-per-pound rule only as an initial planning shortcut. Actual weight change can differ. Some paces will be unavailable for smaller bodies or lower estimated energy needs.</Text>
      </>}
      <Text style={styles.help}>The Mifflin–St Jeor calorie equation uses biological sex to estimate resting calories. Choose which applies to you; Reclaim will not guess.</Text>
      <Choices label="Biological sex for estimate" value={answers.estimationBasis} options={['female', 'male']} onChange={(basis) => { setAnswers((previous) => withEstimationBasis(previous, basis as 'female' | 'male')); setError(''); }} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedOpen }} onPress={() => setAdvancedOpen((current) => !current)} style={styles.advancedToggle}><Text style={styles.advancedText}>{advancedOpen ? '−' : '+'} Advanced options</Text></Pressable>
      {advancedOpen && <>
      <Choices label="Training focus" value={answers.trainingFocus} options={['general', 'strength']} onChange={(trainingFocus) => update({ trainingFocus: trainingFocus as MacroPlanAnswers['trainingFocus'] })} />
      <Text style={styles.help}>Choose strength if you regularly lift and want the plan to prioritize muscle retention. Protein needs still vary by person.</Text>
      {answers.goal === 'lose' && <><Choices label="What matters most?" value={answers.lossPriority} options={['fat-loss', 'balanced', 'performance']} onChange={(lossPriority) => update({ lossPriority: lossPriority as MacroPlanAnswers['lossPriority'] })} /><Text style={styles.help}>Balanced considers fat loss and muscle retention; performance emphasizes training recovery. Muscle growth during fat loss is not guaranteed.</Text></>}
      <Text style={styles.label}>Daily calorie starting point</Text>
      <View style={styles.row}><Pressable accessibilityRole="button" accessibilityState={{ selected: answers.calorieSource === 'estimated' }} onPress={() => update({ calorieSource: 'estimated' })} style={[styles.choice, answers.calorieSource === 'estimated' && styles.selected]}><Text style={styles.choiceText}>Estimate it</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: answers.calorieSource === 'user' }} onPress={() => update({ calorieSource: 'user' })} style={[styles.choice, answers.calorieSource === 'user' && styles.selected]}><Text style={styles.choiceText}>Use my target</Text></Pressable></View>
      {answers.calorieSource === 'user' ? <><Field label="My daily calories (kcal)" value={answers.ownCalories} onChange={(ownCalories) => update({ ownCalories })} /><Text style={styles.help}>Your entered target takes priority over the selected pace. Reclaim will not assume it is a deficit or maintenance. If you set it at an earlier weight, the same target may no longer produce the same rate of change.</Text></> : <Text style={styles.help}>Reclaim estimates resting needs using Mifflin–St Jeor and your broad activity choice. For weight loss it subtracts your selected initial deficit; for gradual gain it adds 250 kcal. These are starting estimates.</Text>}
      </>}
      {answers.estimationBasis === 'female' && <Toggle label="Pregnant or breastfeeding" checked={answers.pregnantOrBreastfeeding} onPress={() => update({ pregnantOrBreastfeeding: !answers.pregnantOrBreastfeeding })} />}
      <Toggle label="Have medical dietary needs" checked={answers.medicalDietaryNeeds} onPress={() => update({ medicalDietaryNeeds: !answers.medicalDietaryNeeds })} />
      <Text style={styles.help}>{answers.estimationBasis === 'female' ? 'If either applies' : 'If medical dietary needs apply'}, use manual targets and consult a qualified professional instead. No answers are saved as a profile.</Text>
      <Toggle label="I confirm this adult general-wellness planner is suitable for me" checked={answers.eligibleConfirmed} onPress={() => update({ eligibleConfirmed: !answers.eligibleConfirmed })} />
      {preview ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>Starting estimate</Text><Text style={styles.noticeText}>Estimated maintenance: {preview.maintenanceCalories.toLocaleString()} kcal/day. {answers.goal === 'lose' && answers.calorieSource === 'estimated' ? `Selected initial deficit: ${LOSS_PACE[answers.lossPace].deficit} kcal/day. ` : ''}Target: {preview.targetCalories.toLocaleString()} kcal/day.</Text><Text style={styles.noticeText}>Protein: about {preview.proteinTargetGrams} g · fat: about {Math.round(preview.targetCalories * 0.3 / 9)} g · carbs: about {Math.round((preview.targetCalories - preview.proteinTargetGrams * 4 - Math.round(preview.targetCalories * 0.3 / 9) * 9) / 4)} g. Review and edit these values before saving.</Text></View> : previewReady && previewError ? <Text accessibilityRole="alert" style={styles.error}>{previewError}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !safetyConfirmed }} disabled={!safetyConfirmed} onPress={generate} style={[styles.primary, !safetyConfirmed && styles.primaryDisabled]}><Text style={[styles.primaryText, !safetyConfirmed && styles.primaryTextDisabled]}>Calculate starting targets</Text></Pressable>
    </> : <>
      <Text style={styles.help}>On-device starting estimates for general wellness. Edit anything before using this as a draft; nothing has been saved yet.</Text>
      <View style={styles.card}><Text style={styles.cardTitle}>{calories.toLocaleString()} kcal from entered macros</Text><Text style={styles.help}>Calculated as carbs × 4 + protein × 4 + fat × 9.</Text></View>
      {(['carbs', 'protein', 'fat'] as const).map((key) => <Field key={key} label={`${key} (g)`} value={fields[key]} onChange={(value) => setFields((previous) => ({ ...previous, [key]: value }))} />)}
      <Text style={styles.help}>Fiber is separate from macro targets. You can set an optional fiber goal below Macros after using this draft.</Text>
      {plan?.calculation && <View style={styles.noticeCard}><Pressable accessibilityRole="button" accessibilityLabel="How this starting point was made" accessibilityState={{ expanded: calculationOpen }} onPress={() => setCalculationOpen((open) => !open)} style={styles.calculationHeader}><Text style={[styles.noticeTitle, styles.calculationTitle]}>How this starting point was made</Text><Text style={styles.calculationChevron}>{calculationOpen ? '⌃' : '⌄'}</Text></Pressable>{calculationOpen && <><Text style={styles.noticeText}>Mifflin–St Jeor resting estimate: {plan.calculation.restingCalories.toLocaleString()} kcal. With your {answers.activity} activity choice (× {plan.calculation.activityFactor}), estimated maintenance is {plan.calculation.maintenanceCalories.toLocaleString()} kcal.</Text><Text style={styles.noticeText}>{plan.calculation.calorieSource === 'user' ? `Your entered calorie target: ${plan.calculation.targetCalories.toLocaleString()} kcal. Reclaim has not verified whether this is a deficit. A target set at an earlier weight may no longer produce the same rate of change.` : `Estimated ${answers.goal} starting target: ${plan.calculation.targetCalories.toLocaleString()} kcal (${plan.calculation.goalAdjustment >= 0 ? '+' : ''}${plan.calculation.goalAdjustment} from estimated maintenance).`}</Text><Text style={styles.noticeText}>Protein starting point: {plan.calculation.proteinTargetGrams} g ({plan.calculation.proteinReferenceKg} kg reference weight × {plan.calculation.proteinFactor} g/kg) for your {plan.calculation.trainingFocus} training focus. The reference weight is capped at higher body weights so protein does not scale indefinitely with body fat. This is a planning heuristic, not a measured muscle requirement.</Text><Text style={styles.noticeText}>{plan.rationale}</Text></>}</View>}
      <Pressable accessibilityRole="button" onPress={usePlan} style={styles.primary}><Text style={styles.primaryText}>Use these as an editable draft</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setStage('questions')} style={styles.secondary}><Text style={styles.secondaryText}>Change answers</Text></Pressable>
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}><Text style={styles.secondaryText}>Cancel · use manual targets</Text></Pressable>
  </KeyboardSafeScrollView></SafeAreaView></Modal>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} keyboardType="decimal-pad" value={value} onChangeText={onChange} placeholder="Enter a number" placeholderTextColor={colors.textDim} style={styles.input} /></View>; }
function PaceOption({ selected, title, detail, description, onPress }: { selected: boolean; title: string; detail: string; description: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.pace, selected && styles.selected]}><Text style={styles.paceTitle}>{title}</Text><Text style={styles.paceDetail}>{detail}</Text><Text style={styles.help}>{description}</Text></Pressable>; }
function Choices({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <View><Text style={styles.label}>{label}</Text><View style={styles.row}>{options.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: option === value }} onPress={() => onChange(option)} style={[styles.choice, option === value && styles.selected]}><Text style={styles.choiceText}>{option}</Text></Pressable>)}</View></View>; }
function Toggle({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) { return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onPress} style={[styles.toggle, checked && styles.toggleChecked]}><View style={[styles.checkbox, checked && styles.checkboxChecked]}><Text style={styles.checkmark}>{checked ? '✓' : ''}</Text></View><Text style={styles.toggleText}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  eyebrow: { color: colors.nutritionNav, fontWeight: '700', fontSize: 11, letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 30, lineHeight: 38, fontWeight: '700', marginTop: 10 },
  intro: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 18 },
  noticeCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 24 },
  noticeTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  calculationHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 },
  calculationTitle: { flex: 1 },
  calculationChevron: { color: colors.nutritionNav, fontSize: 24, marginLeft: 'auto' },
  noticeText: { color: colors.textMuted, fontSize: 14, lineHeight: 22, marginTop: 8 },
  help: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 12 },
  label: { color: colors.textMuted, fontWeight: '600', fontSize: 12, marginTop: 18, marginBottom: 7, textTransform: 'capitalize' },
  input: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, fontSize: 17 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  heightField: { flexGrow: 1, minWidth: 120 },
  choice: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  selected: { borderColor: colors.nutritionNav },
  advancedToggle: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center', paddingHorizontal: 14, marginTop: 18 },
  advancedText: { color: colors.nutritionNav, fontSize: 14, fontWeight: '600' },
  choiceText: { color: colors.text, fontWeight: '700', textTransform: 'capitalize' },
  pace: { padding: 14, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.surface },
  paceTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  paceDetail: { color: colors.nutritionNav, fontSize: 13, fontWeight: '700', marginTop: 4 },
  toggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, minHeight: 72, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 15, padding: 16, marginTop: 20 },
  toggleChecked: { borderColor: colors.nutritionNav },
  checkbox: { width: 25, height: 25, borderRadius: 7, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.nutritionNav, borderColor: colors.nutritionNav },
  checkmark: { color: colors.background, fontSize: 18, lineHeight: 21, fontWeight: '700' },
  toggleText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  primary: { backgroundColor: colors.nutritionNav, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, marginTop: 22, paddingHorizontal: 16 },
  primaryText: { color: colors.background, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  primaryDisabled: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 },
  primaryTextDisabled: { color: colors.textMuted },
  secondary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginTop: 20 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  error: { color: colors.danger, marginTop: 16, lineHeight: 20 },
  disabled: { opacity: .6 },
});
