import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { HOME_GOAL_COLORS } from '@/lib/home-goal-colors';
import { calculateMacroSplit, carbsForTarget, FitnessGoal, macroTargetRatio, weightPounds } from '@/lib/macro-targets';
import { nutrientDefinition } from '@/lib/nutrient-catalog';
import { goalForDate, hasMacroTargets, macroCalories, nutritionCalorieTarget } from '@/lib/nutrition';
import { feetInchesFromCm, heightCmFromFeetInches } from '@/lib/weight-tdee';
import { NutrientSelection } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function NutritionSettingsScreen() {
  const params = useLocalSearchParams<{ date?: string; reviewWeight?: string; reviewUnit?: 'lb' | 'kg' }>();
  const { nutritionGoals = [], nutrientSelections = [], weightEntries = [], weightTdeeProfile, saveNutritionGoal, deleteNutritionGoal, saveNutrientSelection } = useTrackers();
  const latestWeight = [...weightEntries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const [effectiveDate, setEffectiveDate] = useState(params.date ?? today());
  const current = goalForDate(nutritionGoals, effectiveDate);
  const fiberSelection = nutrientSelections.find((selection) => selection.nutrientId === 'fiber');
  const savedFiberGoal = fiberSelection ? fiberSelection.state === 'goal' ? (fiberSelection.legacyFiberGoal ? current?.fiberGrams : fiberSelection.goalAmount) : undefined : current?.fiberGrams;
  const [carbs, setCarbs] = useState(current ? String(current.carbsGrams) : ''); const [protein, setProtein] = useState(current ? String(current.proteinGrams) : ''); const [fat, setFat] = useState(current ? String(current.fatGrams) : '');
  const [calories, setCalories] = useState(current ? String(nutritionCalorieTarget(current)) : '');
  const [mode, setMode] = useState<'calories-only' | 'manual' | 'calculated'>(current ? hasMacroTargets(current) ? current.macroMethod === 'calculated' ? 'calculated' : 'manual' : 'calories-only' : 'calories-only');
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal | ''>(current?.fitnessGoal ?? '');
  const [calculatorOpen, setCalculatorOpen] = useState(Boolean(params.reviewWeight));
  const [weight, setWeight] = useState(() => {
    const sourceWeight = params.reviewWeight ? Number(params.reviewWeight) : latestWeight?.weight;
    const sourceUnit = params.reviewWeight ? params.reviewUnit ?? 'lb' : latestWeight?.unit ?? 'lb';
    return sourceWeight && Number.isFinite(sourceWeight) ? String(Math.round(weightPounds(sourceWeight, sourceUnit) * 10) / 10) : '';
  });
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('lb');
  const savedHeightCm = weightTdeeProfile?.heightCm ?? current?.calculation?.heightCm;
  const savedHeightUs = savedHeightCm ? feetInchesFromCm(savedHeightCm) : undefined;
  const [heightUnit, setHeightUnit] = useState<'us' | 'cm'>('us');
  const [heightFeet, setHeightFeet] = useState(savedHeightUs ? String(savedHeightUs.feet) : '');
  const [heightInches, setHeightInches] = useState(savedHeightUs ? String(savedHeightUs.inches) : '');
  const [height, setHeight] = useState(savedHeightCm ? String(savedHeightCm) : '');
  const [calculation, setCalculation] = useState(current?.macroMethod === 'calculated' ? current.calculation : undefined);
  const goalNutrients = { carbsGrams: Number(carbs) || 0, proteinGrams: Number(protein) || 0, fatGrams: Number(fat) || 0, fiberGrams: current?.fiberGrams ?? 0 };
  const ratio = mode === 'calories-only' ? null : macroTargetRatio(carbs, protein, fat);
  const calorieTarget = Number(calories);
  const difference = ratio && Number.isFinite(calorieTarget) ? macroCalories(goalNutrients) - calorieTarget : 0;
  const updateCalculated = (nextProtein: string, nextFat: string) => {
    if (!/^\d+(?:\.\d+)?$/.test(nextProtein) || !/^\d+(?:\.\d+)?$/.test(nextFat)) { setCarbs(''); return; }
    try { setCarbs(String(carbsForTarget(calorieTarget, Number(nextProtein), Number(nextFat)))); } catch { setCarbs(''); }
  };
  const calculate = () => { try {
    if (!fitnessGoal) throw new Error('Choose Fat Loss, Muscle Gain, or Maintenance first.');
    const actualWeight = Number(weight);
    if (!weight.trim() || !Number.isFinite(actualWeight) || actualWeight <= 0) throw new Error('Enter a valid current weight.');
    const heightCm = heightUnit === 'us'
      ? heightFeet.trim() && heightInches.trim() ? heightCmFromFeetInches(Number(heightFeet), Number(heightInches)) : null
      : height.trim() ? Number(height) : null;
    if (heightCm === null || !Number.isFinite(heightCm)) throw new Error(heightUnit === 'us' ? 'Enter a valid height in feet and inches (0–11 inches).' : 'Enter a valid height in centimeters.');
    const weightLb = weightPounds(actualWeight, weightUnit);
    const split = calculateMacroSplit({ calorieTarget, weightLb, heightCm, goal: fitnessGoal });
    setProtein(String(split.proteinGrams)); setFat(String(split.fatGrams)); setCarbs(String(split.carbsGrams));
    setCalculation({ sourceWeightLb: weightLb, referenceWeightLb: split.referenceWeightLb, heightCm });
    setMode('calculated'); setCalculatorOpen(false);
    Alert.alert('Starting split ready', `Protein uses ${split.referenceWeightLb} lb as the height-capped reference weight. Review and edit before saving; nothing has been saved yet.`);
  } catch (error) { Alert.alert('Cannot calculate this split', message(error)); } };
  const toggleWeightUnit = () => {
    const nextUnit = weightUnit === 'lb' ? 'kg' : 'lb';
    if (weight.trim() && Number.isFinite(Number(weight)) && Number(weight) > 0) {
      setWeight(String(Math.round((nextUnit === 'kg' ? Number(weight) / 2.2046226218 : Number(weight) * 2.2046226218) * 10) / 10));
    }
    setWeightUnit(nextUnit);
  };
  const toggleHeightUnit = () => {
    if (heightUnit === 'us') {
      const converted = heightFeet.trim() && heightInches.trim() ? heightCmFromFeetInches(Number(heightFeet), Number(heightInches)) : null;
      setHeight(converted === null ? '' : String(converted));
      setHeightUnit('cm');
    } else {
      const centimeters = Number(height);
      if (height.trim() && Number.isFinite(centimeters) && centimeters > 0) {
        const converted = feetInchesFromCm(centimeters);
        setHeightFeet(String(converted.feet)); setHeightInches(String(converted.inches));
      } else { setHeightFeet(''); setHeightInches(''); }
      setHeightUnit('us');
    }
  };
  const saveGoal = () => { try {
    if (!calories.trim() || !Number.isInteger(calorieTarget) || calorieTarget < 1 || calorieTarget > 10000) throw new Error('Enter a calorie target from 1 to 10,000 kcal.');
    if (mode !== 'calories-only' && !ratio) throw new Error('Enter valid protein, carb, and fat grams (0–1,000), with at least one above zero.');
    if (mode === 'calculated' && (!calculation || !fitnessGoal)) throw new Error('Preview the calculated split before saving it.');
    const nutrients = mode === 'calories-only' ? { carbsGrams: 0, proteinGrams: 0, fatGrams: 0, fiberGrams: current?.fiberGrams ?? 0 } : { carbsGrams: parseAmount(carbs, 'carbohydrate'), proteinGrams: parseAmount(protein, 'protein'), fatGrams: parseAmount(fat, 'fat'), fiberGrams: current?.fiberGrams ?? 0 };
    saveNutritionGoal({ effectiveDate, ...nutrients, calorieTarget, macroTargetsEnabled: mode !== 'calories-only', fitnessGoal: fitnessGoal || undefined, macroMethod: mode === 'calculated' ? 'calculated' : 'manual', calculation: mode === 'calculated' ? calculation : undefined });
    Alert.alert('Targets saved', `Daily calorie target: ${calorieTarget.toLocaleString()} kcal.`);
  } catch (error) { Alert.alert('Check targets', message(error)); } };

  return <SafeAreaView style={styles.safe} edges={['bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>NUTRITION SETUP</Text><Text style={styles.title}>Macros</Text><Text style={styles.help}>Enter a calorie target you chose. Reclaim tracks it; it does not determine the right target for you. Macro targets are optional and dated changes preserve earlier goals.</Text>
    <Text style={styles.label}>DAILY CALORIE TARGET · KCAL</Text><TextInput accessibilityLabel="Daily calorie target" value={calories} onChangeText={(value) => { setCalories(value); if (mode === 'calculated') { setMode('manual'); setCalculation(undefined); } }} keyboardType="number-pad" placeholder="Your daily calorie target" placeholderTextColor={colors.textDim} style={styles.input} />
    <Text style={styles.label}>FITNESS GOAL · OPTIONAL UNLESS CALCULATING</Text><View style={macroStyles.goalChoices}>{([['fat-loss', 'Fat Loss'], ['muscle-gain', 'Muscle Gain'], ['maintenance', 'Maintenance']] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: fitnessGoal === id }} onPress={() => { setFitnessGoal(id); if (mode === 'calculated') { setMode('manual'); setCalculation(undefined); } }} style={[macroStyles.goalChoice, fitnessGoal === id && macroStyles.goalChoiceSelected]}><Text style={macroStyles.goalChoiceText}>{label}</Text></Pressable>)}</View>
    <Text style={styles.label}>MACRO TARGETS</Text><View style={macroStyles.goalChoices}>{([['calories-only', 'Calories only'], ['manual', 'Advanced']] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: mode === id }} onPress={() => { setMode(id); setCalculation(undefined); }} style={[macroStyles.goalChoice, mode === id && macroStyles.goalChoiceSelected]}><Text style={macroStyles.goalChoiceText}>{label}</Text></Pressable>)}</View>
    {mode !== 'calories-only' && <><View style={styles.three}><NumberField label="PROTEIN · G" value={protein} onChange={(value) => { setProtein(value); if (mode === 'calculated') updateCalculated(value, fat); }} /><NumberField label="CARBS · G" value={carbs} onChange={setCarbs} editable={mode !== 'calculated'} /><NumberField label="FAT · G" value={fat} onChange={(value) => { setFat(value); if (mode === 'calculated') updateCalculated(protein, value); }} /></View>{mode === 'calculated' && <Text style={styles.help}>Carbs fill the calories left after protein and fat. Change calories or goal, then recalculate for a new split.</Text>}</>}
    <Pressable accessibilityRole="button" onPress={() => setCalculatorOpen((open) => !open)} style={styles.aiButton}><Text style={styles.aiButtonText}>{calculatorOpen ? 'Hide optional calculator' : 'Calculate an optional starting split'}</Text></Pressable>
    {calculatorOpen && <View style={macroStyles.calculatorCard}>
      <Text style={styles.rowTitle}>Optional starting split</Text>
      <Text style={styles.help}>Uses weight and a height-capped reference weight for protein. This is an editable planning shortcut, not a personal nutrition prescription or guaranteed safety threshold.</Text>
      <Text style={styles.label}>CURRENT WEIGHT</Text>
      <View style={styles.addRow}><TextInput accessibilityLabel="Weight for macro calculation" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={[styles.input, styles.flex]} /><Pressable accessibilityRole="button" accessibilityLabel={`Change weight unit from ${weightUnit}`} onPress={toggleWeightUnit} style={macroStyles.unitButton}><Text style={macroStyles.goalChoiceText}>{weightUnit}</Text></Pressable></View>
      <Text style={styles.help}>{latestWeight ? `Prefilled from your ${latestWeight.date} weigh-in in Weight. You can adjust it for this preview without changing that weigh-in.` : 'No saved weigh-in yet. Enter your current weight to preview a split; this will not create a Weight record.'}</Text>
      <View style={macroStyles.heightHeading}><Text style={styles.label}>HEIGHT · {heightUnit === 'us' ? 'FEET & INCHES' : 'CM'}</Text><Pressable accessibilityRole="button" accessibilityLabel={heightUnit === 'us' ? 'Use centimeters for height' : 'Use feet and inches for height'} onPress={toggleHeightUnit} style={macroStyles.heightUnitButton}><Text style={macroStyles.heightUnitText}>{heightUnit === 'us' ? 'Use cm' : 'Use ft & in'}</Text></Pressable></View>
      {heightUnit === 'us'
        ? <View style={macroStyles.heightInputs}><View style={styles.flex}><TextInput accessibilityLabel="Height feet" value={heightFeet} onChangeText={setHeightFeet} keyboardType="number-pad" placeholder="Feet" placeholderTextColor={colors.textDim} style={styles.input} /></View><View style={styles.flex}><TextInput accessibilityLabel="Height inches" value={heightInches} onChangeText={setHeightInches} keyboardType="decimal-pad" placeholder="Inches" placeholderTextColor={colors.textDim} style={styles.input} /></View></View>
        : <TextInput accessibilityLabel="Height centimeters" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="e.g. 178" placeholderTextColor={colors.textDim} style={styles.input} />}
      <Pressable onPress={calculate} style={styles.primary}><Text style={styles.primaryText}>Preview starting split</Text></Pressable>
    </View>}
    <View style={styles.calorieCard}><Text style={styles.calorieLabel}>YOUR CALORIE TARGET</Text><Text style={styles.calorieValue}>{calories.trim() && Number.isFinite(calorieTarget) ? calorieTarget.toLocaleString() : '—'} <Text style={styles.calorieUnit}>kcal</Text></Text>{mode !== 'calories-only' && <><Text style={styles.formula}>Macro grams total {ratio ? macroCalories(goalNutrients).toLocaleString() : '—'} kcal · protein × 4 + carbs × 4 + fat × 9</Text>{ratio && <Text style={styles.help}>{difference === 0 ? 'Macro calories match your target.' : `${Math.abs(difference).toLocaleString()} kcal ${difference > 0 ? 'above' : 'below'} your calorie target${mode === 'calculated' ? ' from whole-gram rounding' : ''}.`}</Text>}<MacroRatioChart ratio={ratio} grams={goalNutrients} /></>}</View>
    <Text style={styles.label}>EFFECTIVE DATE</Text><TextInput value={effectiveDate} onChangeText={setEffectiveDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} />
    <Pressable onPress={saveGoal} style={styles.primary}><Text style={styles.primaryText}>Save targets from {effectiveDate}</Text></Pressable>
    <Text style={styles.section}>Goal history</Text><View style={styles.card}>{[...nutritionGoals].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((goal) => <View key={goal.id} style={styles.row}><View style={styles.flex}><Text style={styles.rowTitle}>{goal.effectiveDate} · {nutritionCalorieTarget(goal)} kcal</Text><Text style={styles.rowMeta}>{hasMacroTargets(goal) ? `${goal.carbsGrams}C · ${goal.proteinGrams}P · ${goal.fatGrams}F` : 'Calories only'}{goal.fitnessGoal ? ` · ${goal.fitnessGoal.replace('-', ' ')}` : ''}</Text></View><Pressable onPress={() => Alert.alert('Delete goal profile?', 'Days before the next profile will no longer have a goal comparison. Food logs are not affected.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteNutritionGoal(goal.id, true) }])}><Text style={styles.delete}>Delete</Text></Pressable></View>)}{!nutritionGoals.length && <Text style={styles.empty}>No goal profiles yet.</Text>}</View>
    <Text style={styles.section}>Additional food targets</Text><Text style={styles.help}>Choose which details appear on Nutrition. Hiding a detail keeps its target and logged values. Leave a target blank to show its recorded amount without a progress bar. Missing food-label values remain unknown. Supplement doses do not affect these totals.</Text>
    {(['fiber', 'cholesterol', 'sodium', 'saturated_fat'] as const).map((id, index) => <AdditionalTarget key={id} id={id} selection={nutrientSelections.find((item) => item.nutrientId === id)} initialGoal={id === 'fiber' ? savedFiberGoal : undefined} order={index} onSave={saveNutrientSelection} />)}
  </KeyboardSafeScrollView></SafeAreaView>;
}

function NumberField({ label, value, onChange, editable = true }: { label: string; value: string; onChange: (value: string) => void; editable?: boolean }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} editable={editable} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textDim} style={styles.input} /></View>; }
function MacroRatioChart({ ratio, grams }: { ratio: ReturnType<typeof macroTargetRatio>; grams: { proteinGrams: number; carbsGrams: number; fatGrams: number } }) {
  if (!ratio) return <Text style={styles.ratioEmpty}>Enter all three macros with a calorie total above zero to preview their ratio.</Text>;
  const parts = [
    { label: 'Protein', percent: ratio.protein, calories: grams.proteinGrams * 4, color: '#A987F4' },
    { label: 'Carbs', percent: ratio.carbs, calories: grams.carbsGrams * 4, color: '#41B8E8' },
    { label: 'Fat', percent: ratio.fat, calories: grams.fatGrams * 9, color: '#F2A64A' },
  ];
  const circumference = 2 * Math.PI * 45;
  let offset = 0;
  return <View style={styles.ratioWrap}><View style={styles.ratioRing}><Svg width={120} height={120} viewBox="0 0 120 120" accessibilityLabel={`Calorie ratio: protein ${ratio.protein}%, carbs ${ratio.carbs}%, fat ${ratio.fat}%`}><Circle cx={60} cy={60} r={45} fill="none" stroke={colors.border} strokeWidth={14} />{parts.map((part) => { const start = offset; offset += part.calories / ratio.calories * circumference; return <Circle key={part.label} cx={60} cy={60} r={45} fill="none" stroke={part.color} strokeWidth={14} strokeDasharray={`${part.calories / ratio.calories * circumference} ${circumference}`} strokeDashoffset={-start} rotation={-90} origin="60, 60" />; })}</Svg><Text style={styles.ratioCenter}>100%</Text></View><View style={styles.ratioLegend}>{parts.map((part) => <View key={part.label} style={styles.ratioRow}><View style={[styles.ratioDot, { backgroundColor: part.color }]} /><Text style={styles.ratioName}>{part.label}</Text><Text style={styles.ratioPercent}>{part.percent}%</Text></View>)}</View></View>;
}
const detailColors: Record<string, string> = { fiber: HOME_GOAL_COLORS[0], cholesterol: HOME_GOAL_COLORS[4], sodium: HOME_GOAL_COLORS[6], saturated_fat: HOME_GOAL_COLORS[5] };
function AdditionalTarget({ id, selection, initialGoal, order, onSave }: { id: 'fiber' | 'cholesterol' | 'sodium' | 'saturated_fat'; selection?: NutrientSelection; initialGoal?: number; order: number; onSave: (selection: NutrientSelection) => void }) {
  const definition = nutrientDefinition(id)!;
  const [amount, setAmount] = useState(initialGoal ? String(initialGoal) : selection?.state === 'goal' && selection.goalAmount ? String(selection.goalAmount) : '');
  const color = selection?.color && HOME_GOAL_COLORS.some((option) => option === selection.color) ? selection.color : detailColors[id];
  const save = (nextColor = color) => {
    const value = amount.trim() ? Number(amount) : undefined;
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) return Alert.alert(`Check ${definition.name} target`, 'Enter a number above zero, or leave the target blank.');
    onSave({ nutrientId: id, state: value === undefined ? 'tracked' : 'goal', goalType: value === undefined ? undefined : id === 'fiber' ? 'minimum' : 'maximum', goalAmount: value, order: selection?.order ?? order, legacyFiberGoal: false, color: nextColor, visible: selection?.visible });
  };
  const saveColor = (nextColor: string) => onSave(selection ? { ...selection, color: nextColor } : { nutrientId: id, state: initialGoal ? 'goal' : 'tracked', goalType: initialGoal ? 'minimum' : undefined, goalAmount: initialGoal, order, color: nextColor });
  const toggleVisible = (visible: boolean) => onSave(selection ? { ...selection, visible } : { nutrientId: id, state: initialGoal ? 'goal' : 'tracked', goalType: initialGoal ? 'minimum' : undefined, goalAmount: initialGoal, order, visible });
  return <View style={targetStyles.detailGoal}><View style={targetStyles.heading}><Text style={styles.rowTitle}>{definition.name} · {definition.unit}</Text><Switch accessibilityLabel={`Show ${definition.name} on Nutrition`} value={selection?.visible !== false} onValueChange={toggleVisible} trackColor={{ false: colors.border, true: colors.nutritionNav }} /></View><View style={styles.addRow}><TextInput accessibilityLabel={`${definition.name} daily target in ${definition.unit}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="No target" placeholderTextColor={colors.textDim} style={[styles.input, styles.flex]} /><Pressable accessibilityRole="button" accessibilityLabel={`Save ${definition.name} target`} onPress={() => save()} style={styles.add}><Text style={styles.addText}>Save</Text></Pressable></View><View style={targetStyles.colorChoices}>{HOME_GOAL_COLORS.map((option, index) => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`${definition.name} bar color ${index + 1}`} accessibilityState={{ checked: color === option }} onPress={() => saveColor(option)} style={[targetStyles.colorChoice, { backgroundColor: option }, color === option && targetStyles.colorSelected]}><Text style={targetStyles.colorCheck}>{color === option ? '✓' : ''}</Text></Pressable>)}</View></View>;
}
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
function parseAmount(value: string, label: string) { if (!value.trim()) throw new Error(`Enter a ${label} target.`); const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Enter a valid ${label} target.`); return parsed; }
const message = (error: unknown) => error instanceof Error ? error.message : 'Nothing was changed.';
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: 18 }, eyebrow: { color: colors.nutritionNav, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 32, fontWeight: '700', marginTop: 8 }, help: { color: colors.textMuted, fontSize: 11, lineHeight: 18, marginTop: 8 }, aiButton: { backgroundColor: colors.nutritionNav, borderRadius: 14, minHeight: 58, justifyContent: 'center', alignItems: 'center', marginTop: 18, paddingHorizontal: 16 }, aiButtonText: { color: colors.background, fontSize: 16, fontWeight: '700', textAlign: 'center' }, label: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: .8, marginTop: 14, marginBottom: 5 }, input: { minHeight: 47, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10, color: colors.text }, three: { flexDirection: 'row', gap: 6 }, field: { flex: 1, minWidth: 0 }, calorieCard: { backgroundColor: '#211B31', borderRadius: 16, padding: 16, marginTop: 18 }, calorieLabel: { color: colors.nutritionNav, fontSize: 11, fontWeight: '700' }, calorieValue: { color: colors.text, fontSize: 32, fontWeight: '700', marginTop: 5 }, calorieUnit: { color: colors.textMuted, fontSize: 14 }, formula: { color: colors.textDim, fontSize: 11, marginTop: 3 }, ratioWrap: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 }, ratioRing: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }, ratioCenter: { position: 'absolute', color: colors.text, fontWeight: '700', fontSize: 22 }, ratioLegend: { flex: 1, gap: 9 }, ratioRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, ratioDot: { width: 9, height: 9, borderRadius: 5 }, ratioName: { color: colors.textMuted, fontSize: 12, flex: 1 }, ratioPercent: { color: colors.text, fontSize: 13, fontWeight: '600' }, ratioEmpty: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 14 }, primary: { backgroundColor: colors.nutritionNav, borderRadius: 14, alignItems: 'center', paddingVertical: 15, marginTop: 14 }, primaryText: { color: colors.background, fontSize: 11, fontWeight: '700' }, section: { color: colors.text, fontSize: 19, fontWeight: '700', marginTop: 26, marginBottom: 9 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }, row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderBottomColor: colors.border, borderBottomWidth: 1 }, flex: { flex: 1 }, rowTitle: { color: colors.text, fontSize: 12, fontWeight: '700' }, rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 4 }, delete: { color: colors.danger, fontSize: 11, fontWeight: '600', padding: 7 }, empty: { color: colors.textMuted, fontSize: 11, padding: 16 }, addRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 10, marginBottom: 10 }, add: { minWidth: 70, minHeight: 47, borderRadius: 13, backgroundColor: colors.nutritionNav, alignItems: 'center', justifyContent: 'center' }, addText: { color: colors.background, fontSize: 11, fontWeight: '700' } });

const macroStyles = StyleSheet.create({
  goalChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 5 },
  goalChoice: { minHeight: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  goalChoiceSelected: { backgroundColor: '#2A2140', borderColor: colors.nutritionNav },
  goalChoiceText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  calculatorCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12 },
  unitButton: { minWidth: 58, minHeight: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderColor: colors.nutritionNav, borderWidth: 1 },
  heightHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heightUnitButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderColor: colors.nutritionNav, borderWidth: 1 },
  heightUnitText: { color: colors.nutritionNav, fontSize: 11, fontWeight: '600' },
  heightInputs: { flexDirection: 'row', gap: 8 },
});

const targetStyles = StyleSheet.create({
  detailGoal: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  colorChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  colorChoice: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  colorSelected: { borderColor: colors.text }, colorCheck: { color: colors.background, fontSize: 19, fontWeight: '700' },
});
