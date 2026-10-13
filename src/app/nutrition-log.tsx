import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { NutritionMealConfirmation } from '@/components/nutrition-meal-confirmation';
import { formatClockTime, localClockTime, parseClockTime } from '@/lib/clock-time';
import { requireNutritionMeal } from '@/lib/nutrition-meal-selection';
import { extractServingWeightGrams, macroCalories, NutritionLogBatch, nutritionId, parseExplicitNutritionSummaries, prepareNutritionLogBatch, scaleNutrients, servingsForWeight } from '@/lib/nutrition';
import { parseNutritionLabel, parseNutritionText } from '@/lib/nutrition-ai';
import { clearPendingCaptureTarget, setPendingCaptureTarget } from '@/lib/pending-capture';
import { NutritionEntry, NutritionSource, SavedFood, SavedMealItem } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

type Mode = 'manual' | 'text' | 'label';
type Draft = {
  key: string; foodId?: string; name: string; brand: string; servingLabel: string; servings: string;
  amountMode: 'servings' | 'weight'; servingWeightGrams: string; weightAmount: string; weightUnit: 'g' | 'oz';
  carbs: string; protein: string; fat: string; fiber: string; statedCalories: string; note: string;
  source: NutritionSource; confidence?: 'high' | 'medium' | 'low'; assumptions: string[]; saveToLibrary: boolean;
};

export default function NutritionLogScreen() {
  const params = useLocalSearchParams<{ mode?: Mode; date?: string; id?: string; foodId?: string; mealId?: string; recoveredPhotoUri?: string; captureOnOpen?: string }>();
  const { nutritionEntries = [], nutritionMealGroups = [], savedFoods = [], savedMeals = [], saveNutritionLogBatch, deleteNutritionEntry } = useTrackers();
  const entry = nutritionEntries.find((item) => item.id === params.id); const savedFood = savedFoods.find((item) => item.id === params.foodId); const savedMeal = savedMeals.find((item) => item.id === params.mealId);
  const activeGroups = useMemo(() => nutritionMealGroups.filter((group) => !group.archived || entry?.mealGroupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder), [nutritionMealGroups, entry?.mealGroupId]);
  const [mode, setMode] = useState<Mode>(entry || savedFood || savedMeal ? 'manual' : params.recoveredPhotoUri ? 'label' : params.mode ?? 'manual');
  const [eventDate, setEventDate] = useState(entry?.eventDate ?? params.date ?? today()); const [time, setTime] = useState(entry?.eatenAt ? formatClockTime(entry.eatenAt) : localClockTime());
  const [mealGroupId, setMealGroupId] = useState<string>();
  const [confirmMeal, setConfirmMeal] = useState(false);
  const [description, setDescription] = useState(''); const [drafts, setDrafts] = useState<Draft[]>(() => entry ? [fromEntry(entry)] : savedFood ? [fromFood(savedFood)] : savedMeal ? savedMeal.items.map(fromSavedMealItem) : mode === 'manual' ? [blankDraft()] : []);
  const [status, setStatus] = useState(params.recoveredPhotoUri ? 'Recovering and reading the cropped label…' : ''); const [busy, setBusy] = useState(Boolean(params.recoveredPhotoUri)); const [photoUri, setPhotoUri] = useState<string | undefined>(params.recoveredPhotoUri); const [warnings, setWarnings] = useState<string[]>([]); const recoveryHandled = useRef(false);
  const savedMealInstanceId = useRef(entry?.savedMealInstanceId ?? (savedMeal ? nutritionId('meal-log') : undefined)).current;
  const cameraOpened = useRef(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const uri = params.recoveredPhotoUri;
    if (!uri || recoveryHandled.current) return;
    recoveryHandled.current = true;
    let active = true;
    const recover = async () => {
      try {
        const file = new File(uri);
        const parsed = await parseNutritionLabel(await file.base64(), file.type || 'image/jpeg');
        if (!active) return;
        setDrafts(parsed.items.map((item) => fromAi(item, 'ai_label')));
        setWarnings(parsed.warnings);
        setStatus('Recovered the camera result. Compare every value with the photo before saving.');
      } catch (error) {
        if (active) setStatus(message(error));
      } finally {
        if (active) setBusy(false);
      }
    };
    void recover();
    return () => { active = false; };
  }, [params.recoveredPhotoUri]);

  const update = (key: string, field: keyof Draft, value: string | boolean) => setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, [field]: value } : draft));
  const chooseMode = (next: Mode) => { if (savedMeal || busy || saving.current) return; setMode(next); setStatus(''); setWarnings([]); if (next === 'manual' && !drafts.length) setDrafts([blankDraft()]); };
  const analyzeText = async () => {
    setBusy(true);
    setWarnings([]);
    try {
      const suppliedSummaries = parseExplicitNutritionSummaries(description);
      if (suppliedSummaries) {
        setDrafts(suppliedSummaries.map((item) => fromAi(item, 'ai_text')));
        setStatus(`Found ${suppliedSummaries.length} editable food${suppliedSummaries.length === 1 ? '' : 's'} using your supplied totals. Review before saving.`);
        return;
      }
      setStatus('Estimating separate foods…');
      const result = await parseNutritionText(description);
      setDrafts(result.items.map((item) => fromAi(item, 'ai_text')));
      setWarnings(result.warnings);
      setStatus(`Found ${result.items.length} editable food${result.items.length === 1 ? '' : 's'}. Review every serving and value before saving.`);
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  };

  const processPhoto = async (camera: boolean) => {
    try {
      if (camera) { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) return setStatus('Camera permission is needed to photograph a nutrition label.'); await setPendingCaptureTarget('nutrition'); }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: .68, base64: true };
      let result: ImagePicker.ImagePickerResult;
      try {
        result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      } finally {
        if (camera) await clearPendingCaptureTarget();
      }
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0]; setPhotoUri(asset.uri); setBusy(true); setStatus('Reading the cropped nutrition label with AI…');
      const parsed = await parseNutritionLabel(asset.base64 ?? await new File(asset.uri).base64(), asset.mimeType ?? 'image/jpeg');
      setDrafts(parsed.items.map((item) => fromAi(item, 'ai_label'))); setWarnings(parsed.warnings); setStatus(`Found ${parsed.items.length} label item${parsed.items.length === 1 ? '' : 's'}. Compare every value with the photo before saving.`);
    } catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (params.captureOnOpen !== 'camera' || params.mode !== 'label' || params.recoveredPhotoUri || entry || savedFood || savedMeal || cameraOpened.current) return;
    cameraOpened.current = true;
    void processPhoto(true);
  }, [params.captureOnOpen, params.mode, params.recoveredPhotoUri, entry, savedFood, savedMeal]);

  const save = async (confirmed = false) => {
    if (busy || saving.current) return;
    if (!drafts.length) return Alert.alert('No foods to save', 'Add a food or analyze a meal first.');
    saving.current = true;
    setBusy(true);
    const createdPhotos: string[] = [];
    let committed = false;
    try {
      const eatenAt = time.trim() ? parseClockTime(time) : undefined;
      if (time.trim() && !eatenAt) throw new Error('Enter a time like 9:30 AM or 6:15 PM, or leave it blank.');
      // Validate the whole draft before opening the picker; no records or photos
      // are saved until the user explicitly chooses a meal and confirms.
      const group = confirmed ? requireNutritionMeal(activeGroups, mealGroupId) : { id: 'pending-meal', name: 'Pending meal selection' };
      const batch: NutritionLogBatch = { entries: [], foods: [] };
      const photosToCopy: { foodId: string; uri: string }[] = [];
      for (const draft of drafts) {
        const parsed = parseDraft(draft);
        const foodId = draft.saveToLibrary ? draft.foodId ?? nutritionId('food') : draft.foodId;
        if (draft.saveToLibrary) {
          batch.foods.push({ id: foodId, name: parsed.name, brand: parsed.brand, servingLabel: parsed.servingLabel, servingWeightGrams: parsed.servingWeightGrams, nutrients: parsed.nutrients, statedCalories: parsed.statedCalories, source: draft.source });
          if (photoUri && draft.source === 'ai_label') photosToCopy.push({ foodId: foodId!, uri: photoUri });
        }
        batch.entries.push({ id: entry?.id ?? nutritionId('entry'), eventDate, eatenAt, mealGroupId: group.id, mealLabel: group.name, foodId, ...parsed, source: entry?.source ?? (savedMeal ? 'saved_meal' : foodId && !draft.saveToLibrary ? 'saved_food' : draft.source), savedMealId: entry?.savedMealId ?? savedMeal?.id, savedMealName: entry?.savedMealName ?? savedMeal?.name, savedMealInstanceId });
      }
      // Dates, amounts, every component, and optional library foods must all be valid.
      prepareNutritionLogBatch(batch);
      if (!confirmed) {
        Keyboard.dismiss();
        setMealGroupId(undefined);
        setConfirmMeal(true);
        return;
      }
      for (const photo of photosToCopy) {
        const uri = await preservePhoto(photo.uri, photo.foodId);
        createdPhotos.push(uri);
        batch.foods.find((food) => food.id === photo.foodId)!.labelPhotoUri = uri;
      }
      if (!mounted.current) return;
      saveNutritionLogBatch(batch);
      committed = true;
      setConfirmMeal(false);
      router.replace('/nutrition');
    } catch (error) {
      if (mounted.current) Alert.alert('Check food details', message(error));
    } finally {
      if (!committed) {
        // Only these new copies belong to this failed save; existing photos stay intact.
        for (const uri of createdPhotos) { try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* A leftover copy does not create a food entry. */ } }
        saving.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  };

  const remove = () => Alert.alert('Delete food entry?', 'This removes this item from the selected day. A reusable saved food, if present, is not deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { deleteNutritionEntry(entry!.id, true); router.replace('/nutrition'); } }]);

  return <SafeAreaView style={styles.safe} edges={['bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>{entry ? 'EDIT FOOD ENTRY' : savedMeal ? 'LOG SAVED MEAL' : 'LOG FOOD'}</Text><Text style={styles.title}>{entry ? entry.name : savedMeal?.name ?? (mode === 'text' ? 'Describe a meal' : mode === 'label' ? 'Scan a nutrition label' : 'Manual food entry')}</Text>
    {!entry && !savedMeal && <View style={styles.modeRow}><ModeButton label="Manual" active={mode === 'manual'} onPress={() => chooseMode('manual')} /><ModeButton label="Describe" active={mode === 'text'} onPress={() => chooseMode('text')} /><ModeButton label="Label" active={mode === 'label'} onPress={() => chooseMode('label')} /></View>}
    <Text style={styles.label}>DATE</Text><TextInput value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.label}>TIME · OPTIONAL</Text><TextInput value={time} onChangeText={setTime} autoCapitalize="characters" placeholder="9:30 AM" placeholderTextColor={colors.textDim} style={styles.input} />
    {mode === 'text' && !entry && <View style={styles.aiPanel}><Text style={styles.aiTitle}>What did you eat?</Text><Text style={styles.aiHelp}>Complete summaries with calories, protein, carbs, fat, and fiber are read on your device exactly as entered. Descriptions needing estimates are sent only when you tap Analyze Meal. Saved nutrition records remain local.</Text><TextInput value={description} onChangeText={setDescription} multiline placeholder="Example: Pulled pork wrap — 678 cal | 72g protein | 34g carbs | 37g fat | 22g fiber" placeholderTextColor={colors.textDim} style={[styles.input, styles.description]} /><Pressable disabled={busy} onPress={() => { void analyzeText(); }} style={[styles.analyze, busy && styles.disabled]}><Text style={styles.analyzeText}>{busy ? 'Analyzing…' : 'Analyze Meal'}</Text></Pressable></View>}
    {mode === 'label' && !entry && <View style={styles.aiPanel}><Text style={styles.aiTitle}>Crop closely around Nutrition Facts</Text><Text style={styles.aiHelp}>Only the cropped image you explicitly submit is transmitted through your secure relay to OpenAI. Saved nutrition records remain local; the image is kept locally only if you choose Save to library.</Text><View style={styles.photoActions}><Pressable disabled={busy} onPress={() => { void processPhoto(true); }} style={styles.photoButton}><Text style={styles.photoButtonText}>Take photo</Text></Pressable><Pressable disabled={busy} onPress={() => { void processPhoto(false); }} style={styles.photoButton}><Text style={styles.photoButtonText}>Choose photo</Text></Pressable></View>{photoUri && <Image source={{ uri: photoUri }} resizeMode="contain" style={styles.photo} />}</View>}
    {status ? <Text style={styles.status}>{status}</Text> : null}{warnings.map((warning, index) => <Text key={`${warning}-${index}`} style={styles.warning}>• {warning}</Text>)}
    {drafts.map((draft, index) => <DraftCard key={draft.key} draft={draft} index={index} canRemove={drafts.length > 1} onUpdate={(field, value) => update(draft.key, field, value)} onRemove={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))} />)}
    {mode === 'manual' && !entry && <Pressable onPress={() => setDrafts((current) => [...current, blankDraft()])} style={styles.addAnother}><Text style={styles.addAnotherText}>+ Add another food</Text></Pressable>}
    <Pressable disabled={busy} onPress={() => { void save(); }} style={[styles.save, busy && styles.disabled]}><Text style={styles.saveText}>{entry ? 'Save changes' : `Save ${drafts.length || ''} food${drafts.length === 1 ? '' : 's'}`}</Text></Pressable><Pressable onPress={() => router.back()} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>{entry && <Pressable onPress={remove} style={styles.delete}><Text style={styles.deleteText}>Delete this food entry</Text></Pressable>}
  </KeyboardSafeScrollView>
    <NutritionMealConfirmation visible={confirmMeal} groups={activeGroups} selectedId={mealGroupId} eventDate={eventDate} busy={busy} onSelect={setMealGroupId} onBack={() => { if (!saving.current) setConfirmMeal(false); }} onConfirm={() => { void save(true); }} />
  </SafeAreaView>;
}

function DraftCard({ draft, index, canRemove, onUpdate, onRemove }: { draft: Draft; index: number; canRemove: boolean; onUpdate: (field: keyof Draft, value: string | boolean) => void; onRemove: () => void }) {
  const nutrients = { carbsGrams: Number(draft.carbs) || 0, proteinGrams: Number(draft.protein) || 0, fatGrams: Number(draft.fat) || 0, fiberGrams: Number(draft.fiber) || 0 };
  const multiplier = draftMultiplier(draft);
  const loggedNutrients = scaleNutrients(nutrients, multiplier ?? 0);
  const statedPerServing = Number(draft.statedCalories);
  const printedCalories = draft.statedCalories.trim() && multiplier !== undefined && Number.isFinite(statedPerServing) && statedPerServing >= 0 ? Math.round(statedPerServing * multiplier * 10) / 10 : undefined;
  const loggedCalories = printedCalories ?? macroCalories(loggedNutrients);
  return <View style={styles.draft}><View style={styles.draftHead}><View style={styles.flex}><Text style={styles.draftEyebrow}>FOOD {index + 1}{draft.confidence ? ` · ${draft.confidence.toUpperCase()} CONFIDENCE` : ''}</Text><Text style={styles.draftCalories}>{multiplier === undefined ? macroCalories(nutrients) : loggedCalories} kcal <Text style={styles.perServing}>{multiplier === undefined ? 'per serving' : 'for amount eaten'}</Text></Text></View>{canRemove && <Pressable onPress={onRemove}><Text style={styles.remove}>Remove</Text></Pressable>}</View>
    <Field label="FOOD NAME" value={draft.name} onChange={(value) => onUpdate('name', value)} /><Field label="BRAND · OPTIONAL" value={draft.brand} onChange={(value) => onUpdate('brand', value)} />{draft.source !== 'manual' && <Field label="LABEL SERVING DESCRIPTION" value={draft.servingLabel} onChange={(value) => onUpdate('servingLabel', value)} />}
    <Text style={styles.amountHeading}>HOW MUCH DID YOU EAT?</Text><View style={styles.amountModes}><AmountMode label="Weight" active={draft.amountMode === 'weight'} onPress={() => onUpdate('amountMode', 'weight')} /><AmountMode label="Servings" active={draft.amountMode === 'servings'} onPress={() => onUpdate('amountMode', 'servings')} /></View>
    {draft.amountMode === 'weight' ? <><View style={styles.two}><Field label="ONE SERVING WEIGHS · G" value={draft.servingWeightGrams} onChange={(value) => onUpdate('servingWeightGrams', value)} numeric /><Field label={`WEIGHT EATEN · ${draft.weightUnit.toUpperCase()}`} value={draft.weightAmount} onChange={(value) => onUpdate('weightAmount', value)} numeric /></View><View style={styles.unitRow}><Text style={styles.unitLabel}>Scale unit</Text>{(['g', 'oz'] as const).map((unit) => <Pressable key={unit} onPress={() => onUpdate('weightUnit', unit)} style={[styles.unitButton, draft.weightUnit === unit && styles.unitButtonActive]}><Text style={[styles.unitButtonText, draft.weightUnit === unit && styles.unitButtonTextActive]}>{unit}</Text></Pressable>)}</View></> : <Field label="SERVINGS EATEN" value={draft.servings} onChange={(value) => onUpdate('servings', value)} numeric />}
    {multiplier !== undefined && <View style={styles.calculation}><Text style={styles.calculationTitle}>{draft.amountMode === 'weight' ? weightCalculationText(draft, multiplier) : `${formatAmount(multiplier)} serving${multiplier === 1 ? '' : 's'}`}</Text><Text style={styles.calculationMacros}>{formatAmount(loggedNutrients.carbsGrams)}g carbs · {formatAmount(loggedNutrients.proteinGrams)}g protein · {formatAmount(loggedNutrients.fatGrams)}g fat · {formatAmount(loggedNutrients.fiberGrams)}g fiber</Text>{printedCalories !== undefined && <Text style={styles.calculationReference}>{formatAmount(printedCalories)} printed calories</Text>}</View>}
    <Text style={styles.referenceHeading}>VALUES FOR ONE LABEL SERVING</Text><View style={styles.two}><Field label="CARBS · G" value={draft.carbs} onChange={(value) => onUpdate('carbs', value)} numeric /><Field label="PROTEIN · G" value={draft.protein} onChange={(value) => onUpdate('protein', value)} numeric /></View><View style={styles.two}><Field label="FAT · G" value={draft.fat} onChange={(value) => onUpdate('fat', value)} numeric /><Field label="FIBER · G" value={draft.fiber} onChange={(value) => onUpdate('fiber', value)} numeric /></View><Field label="PRINTED / ESTIMATED CALORIES · PER SERVING" value={draft.statedCalories} onChange={(value) => onUpdate('statedCalories', value)} numeric /><Field label="NOTE · OPTIONAL" value={draft.note} onChange={(value) => onUpdate('note', value)} multiline />
    {draft.assumptions.map((assumption, assumptionIndex) => <Text key={assumptionIndex} style={styles.assumption}>• {assumption}</Text>)}
    {!draft.foodId && <Pressable onPress={() => onUpdate('saveToLibrary', !draft.saveToLibrary)} style={styles.saveFoodRow}><View style={[styles.checkbox, draft.saveToLibrary && styles.checkboxOn]}>{draft.saveToLibrary && <Text style={styles.check}>✓</Text>}</View><View style={styles.flex}><Text style={styles.saveFoodTitle}>Save to food library</Text><Text style={styles.saveFoodHelp}>Ask each time; historical logs remain separate snapshots.</Text></View></Pressable>}
  </View>;
}

function Field({ label, value, onChange, numeric, multiline }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; multiline?: boolean }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} placeholderTextColor={colors.textDim} style={[styles.input, multiline && styles.multiline]} /></View>; }
function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.mode, active && styles.modeActive]}><Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text></Pressable>; }
function AmountMode({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.amountMode, active && styles.amountModeActive]}><Text style={[styles.amountModeText, active && styles.amountModeTextActive]}>{label}</Text></Pressable>; }
function blankDraft(): Draft { return { key: nutritionId('draft'), name: '', brand: '', servingLabel: '', servings: '1', amountMode: 'servings', servingWeightGrams: '', weightAmount: '', weightUnit: 'g', carbs: '', protein: '', fat: '', fiber: '', statedCalories: '', note: '', source: 'manual', assumptions: [], saveToLibrary: false }; }
function fromEntry(entry: NutritionEntry): Draft { const servingWeight = entry.servingWeightGrams ?? extractServingWeightGrams(entry.servingLabel); return { key: entry.id, foodId: entry.foodId, name: entry.name, brand: entry.brand ?? '', servingLabel: entry.servingLabel, servings: String(entry.servings), amountMode: entry.amountMode ?? 'servings', servingWeightGrams: servingWeight === undefined ? '' : String(servingWeight), weightAmount: entry.consumedAmount === undefined ? '' : String(entry.consumedAmount), weightUnit: entry.consumedUnit ?? 'g', carbs: String(entry.nutrients.carbsGrams), protein: String(entry.nutrients.proteinGrams), fat: String(entry.nutrients.fatGrams), fiber: String(entry.nutrients.fiberGrams), statedCalories: entry.statedCalories == null ? '' : String(entry.statedCalories), note: entry.note ?? '', source: entry.source, assumptions: [], saveToLibrary: false }; }
function fromFood(food: SavedFood): Draft { const servingWeight = food.servingWeightGrams ?? extractServingWeightGrams(food.servingLabel); return { key: nutritionId('draft'), foodId: food.id, name: food.name, brand: food.brand ?? '', servingLabel: food.servingLabel, servings: '1', amountMode: servingWeight ? 'weight' : 'servings', servingWeightGrams: servingWeight === undefined ? '' : String(servingWeight), weightAmount: '', weightUnit: 'g', carbs: String(food.nutrients.carbsGrams), protein: String(food.nutrients.proteinGrams), fat: String(food.nutrients.fatGrams), fiber: String(food.nutrients.fiberGrams), statedCalories: food.statedCalories == null ? '' : String(food.statedCalories), note: '', source: 'saved_food', assumptions: [], saveToLibrary: false }; }
function fromSavedMealItem(item: SavedMealItem): Draft { return { key: nutritionId('draft'), foodId: item.foodId, name: item.name, brand: item.brand ?? '', servingLabel: item.servingLabel, servings: String(item.servings), amountMode: item.amountMode, servingWeightGrams: item.servingWeightGrams === undefined ? '' : String(item.servingWeightGrams), weightAmount: item.consumedAmount === undefined ? '' : String(item.consumedAmount), weightUnit: item.consumedUnit ?? 'g', carbs: String(item.nutrients.carbsGrams), protein: String(item.nutrients.proteinGrams), fat: String(item.nutrients.fatGrams), fiber: String(item.nutrients.fiberGrams), statedCalories: item.statedCalories == null ? '' : String(item.statedCalories), note: '', source: 'saved_meal', assumptions: [], saveToLibrary: false }; }
function fromAi(item: Awaited<ReturnType<typeof parseNutritionText>>['items'][number], source: NutritionSource): Draft { const servingWeight = item.servingWeightGrams ?? extractServingWeightGrams(item.servingLabel); return { key: nutritionId('draft'), name: item.name, brand: item.brand ?? '', servingLabel: item.servingLabel, servings: '1', amountMode: source === 'ai_label' && servingWeight ? 'weight' : 'servings', servingWeightGrams: servingWeight === undefined ? '' : String(servingWeight), weightAmount: '', weightUnit: 'g', carbs: String(item.nutrients.carbsGrams), protein: String(item.nutrients.proteinGrams), fat: String(item.nutrients.fatGrams), fiber: String(item.nutrients.fiberGrams), statedCalories: item.statedCalories == null ? '' : String(item.statedCalories), note: '', source, confidence: item.confidence, assumptions: item.assumptions, saveToLibrary: false }; }
function parseDraft(draft: Draft) { const nutrients = { carbsGrams: Number(draft.carbs), proteinGrams: Number(draft.protein), fatGrams: Number(draft.fat), fiberGrams: Number(draft.fiber) }; if (!draft.name.trim()) throw new Error('Every food needs a name.'); if (draft.source !== 'manual' && !draft.servingLabel.trim()) throw new Error(`${draft.name || 'Each food'} needs a serving description.`); if (Object.values(nutrients).some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`${draft.name} has an invalid macro value.`); const servingWeightGrams = optionalPositive(draft.servingWeightGrams, `${draft.name} needs a valid label serving weight.`); const consumedAmount = draft.amountMode === 'weight' ? requiredPositive(draft.weightAmount, `${draft.name} needs the weight eaten.`) : undefined; const servings = draft.amountMode === 'weight' ? servingsForWeight(consumedAmount!, draft.weightUnit, servingWeightGrams ?? 0) : requiredPositive(draft.servings, `${draft.name} needs a serving amount greater than zero.`); const statedCalories = draft.statedCalories.trim() ? Number(draft.statedCalories) : undefined; if (statedCalories !== undefined && (!Number.isFinite(statedCalories) || statedCalories < 0)) throw new Error(`${draft.name} has invalid reference calories.`); return { name: draft.name.trim(), brand: draft.brand.trim() || undefined, servingLabel: draft.servingLabel.trim() || '1 serving', servings, amountMode: draft.amountMode, consumedAmount, consumedUnit: draft.amountMode === 'weight' ? draft.weightUnit : undefined, servingWeightGrams, nutrients, statedCalories, note: draft.note.trim() || undefined }; }
function draftMultiplier(draft: Draft) { try { return draft.amountMode === 'weight' ? servingsForWeight(Number(draft.weightAmount), draft.weightUnit, Number(draft.servingWeightGrams)) : requiredPositive(draft.servings, ''); } catch { return undefined; } }
function requiredPositive(value: string, error: string) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(error); return parsed; }
function optionalPositive(value: string, error: string) { if (!value.trim()) return undefined; return requiredPositive(value, error); }
function formatAmount(value: string | number) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) ? `${Math.round(parsed * 100) / 100}` : '—'; }
function weightCalculationText(draft: Draft, multiplier: number) { const amount = Number(draft.weightAmount); const converted = draft.weightUnit === 'oz' ? ` (${formatAmount(amount * 28.349523125)} g)` : ''; return `${formatAmount(amount)} ${draft.weightUnit}${converted} using ${formatAmount(draft.servingWeightGrams)} g per serving = ${formatAmount(multiplier)} servings`; }
async function preservePhoto(uri: string, foodId: string) { const source = new File(uri); const extension = source.extension || '.jpg'; const destination = new File(Paths.document, `nutrition-${foodId}-${nutritionId('photo')}${extension}`); await source.copy(destination); return destination.uri; }
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg }, eyebrow: { color: colors.nutritionNav, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 7 }, modeRow: { flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: 14, padding: 4, marginTop: 14 }, mode: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, modeActive: { backgroundColor: '#2A2140' }, modeText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' }, modeTextActive: { color: colors.nutritionNav }, label: { color: colors.textDim, fontSize: 8, fontWeight: '900', letterSpacing: .7, marginTop: 13, marginBottom: 5 }, input: { minHeight: 46, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12, color: colors.text, paddingHorizontal: 12 }, multiline: { minHeight: 78, paddingTop: 11, textAlignVertical: 'top' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 }, chipActive: { backgroundColor: '#2A2140', borderColor: '#6C5398' }, chipText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' }, chipTextActive: { color: colors.nutritionNav }, aiPanel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 13, marginTop: 15 }, aiTitle: { color: colors.text, fontSize: 14, fontWeight: '900' }, aiHelp: { color: colors.textMuted, fontSize: 9, lineHeight: 15, marginTop: 5 }, description: { minHeight: 112, textAlignVertical: 'top', paddingTop: 11, marginTop: 10 }, analyze: { backgroundColor: colors.nutritionNav, borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: 10 }, analyzeText: { color: colors.background, fontSize: 10, fontWeight: '900' }, photoActions: { flexDirection: 'row', gap: 8, marginTop: 12 }, photoButton: { flex: 1, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', paddingVertical: 12 }, photoButtonText: { color: colors.text, fontSize: 10, fontWeight: '800' }, photo: { width: '100%', aspectRatio: 4 / 3, maxHeight: 320, backgroundColor: colors.background, borderRadius: 12, marginTop: 10 }, status: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginTop: 12 }, warning: { color: colors.settingsNav, fontSize: 9, lineHeight: 14, marginTop: 4 }, setupLink: { color: colors.nutritionNav, fontSize: 11, fontWeight: '900', marginTop: 9 }, draft: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 13, marginTop: 14 }, draftHead: { flexDirection: 'row', alignItems: 'center' }, flex: { flex: 1 }, draftEyebrow: { color: colors.nutritionNav, fontSize: 8, fontWeight: '900', letterSpacing: .7 }, draftCalories: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: 3 }, perServing: { color: colors.textMuted, fontSize: 9, fontWeight: '600' }, remove: { color: colors.danger, fontSize: 9, fontWeight: '800', padding: 5 }, two: { flexDirection: 'row', gap: 8 }, field: { flex: 1 }, amountHeading: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: .5, marginTop: 18 }, amountModes: { flexDirection: 'row', gap: 7, marginTop: 8 }, amountMode: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.surfaceRaised }, amountModeActive: { borderColor: colors.nutritionNav, backgroundColor: '#2A2140' }, amountModeText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' }, amountModeTextActive: { color: colors.nutritionNav }, unitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }, unitLabel: { flex: 1, color: colors.textMuted, fontSize: 9 }, unitButton: { minWidth: 48, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 }, unitButtonActive: { borderColor: colors.nutritionNav, backgroundColor: '#2A2140' }, unitButtonText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' }, unitButtonTextActive: { color: colors.nutritionNav }, calculation: { backgroundColor: '#211B31', borderRadius: 12, padding: 11, marginTop: 11 }, calculationTitle: { color: colors.text, fontSize: 10, fontWeight: '800' }, calculationMacros: { color: colors.nutritionNav, fontSize: 10, lineHeight: 16, marginTop: 4 }, calculationReference: { color: colors.textMuted, fontSize: 9, marginTop: 3 }, referenceHeading: { color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: .7, marginTop: 19 }, assumption: { color: colors.textMuted, fontSize: 9, lineHeight: 14, marginTop: 6 }, saveFoodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 11, marginTop: 12 }, checkbox: { width: 22, height: 22, borderRadius: 6, borderColor: colors.textDim, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, checkboxOn: { backgroundColor: colors.nutritionNav, borderColor: colors.nutritionNav }, check: { color: colors.background, fontWeight: '900' }, saveFoodTitle: { color: colors.text, fontSize: 10, fontWeight: '900' }, saveFoodHelp: { color: colors.textMuted, fontSize: 8, marginTop: 2 }, addAnother: { alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingVertical: 12, marginTop: 10 }, addAnotherText: { color: colors.nutritionNav, fontSize: 10, fontWeight: '800' }, save: { backgroundColor: colors.nutritionNav, borderRadius: 14, alignItems: 'center', paddingVertical: 15, marginTop: 17 }, saveText: { color: colors.background, fontSize: 11, fontWeight: '900' }, cancel: { alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 9 }, cancelText: { color: colors.text, fontSize: 11, fontWeight: '800' }, delete: { alignItems: 'center', paddingVertical: 15, marginTop: 10 }, deleteText: { color: colors.danger, fontSize: 11, fontWeight: '800' }, disabled: { opacity: .5 } });
