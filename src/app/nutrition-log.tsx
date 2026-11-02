import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { LabelCamera, type FramedLabelPhoto } from '@/components/label-camera';
import { NutritionMealConfirmation } from '@/components/nutrition-meal-confirmation';
import { FoodNutrientFields, parseFoodExtraNutrients } from '@/components/food-nutrient-fields';
import { SavedAdConfirmation } from '@/components/saved-ad-confirmation';
import { useAds } from '@/state/ads-context';
import { formatClockTime, localClockTime, parseClockTime } from '@/lib/clock-time';
import { requireNutritionMeal } from '@/lib/nutrition-meal-selection';
import { extractServingWeightGrams, macroCalories, NutritionLogBatch, nutritionEntryCalories, nutritionId, parseExplicitNutritionSummaries, prepareNutritionLogBatch, prepareSavedMeal, scaleNutrients, servingsForWeight } from '@/lib/nutrition';
import { parseNutritionLabel, parseNutritionText } from '@/lib/nutrition-ai';
import { NutritionEntry, NutritionSource, SavedFood, SavedMealItem } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';

type Mode = 'manual' | 'text' | 'label';
type Draft = {
  key: string; entryId?: string; foodId?: string; name: string; brand: string; servingLabel: string; servings: string;
  amountMode: 'servings' | 'weight'; servingWeightGrams: string; weightAmount: string; weightUnit: 'g' | 'oz';
  carbs: string; protein: string; fat: string; fiber: string; statedCalories: string; note: string;
  extra: Record<string, string>;
  source: NutritionSource; confidence?: 'high' | 'medium' | 'low'; assumptions: string[]; saveToLibrary: boolean; labelPhotoUri?: string;
};

export default function NutritionLogScreen() {
  const { showCompletionAd } = useAds();
  const [savedConfirmation, setSavedConfirmation] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const params = useLocalSearchParams<{ mode?: Mode; date?: string; id?: string; foodId?: string; mealId?: string; instanceId?: string; recoveredPhotoUri?: string; captureOnOpen?: string }>();
  const { nutritionEntries = [], nutritionMealGroups = [], savedFoods = [], savedMeals = [], customNutrients = [], saveNutritionLogBatch, saveNutritionMealBuilder, replaceNutritionLoggedMeal, deleteNutritionEntry } = useTrackers();
  const entry = nutritionEntries.find((item) => item.id === params.id); const savedFood = savedFoods.find((item) => item.id === params.foodId); const savedMeal = savedMeals.find((item) => item.id === params.mealId);
  const loggedGroup = params.instanceId ? nutritionEntries.filter((item) => item.savedMealInstanceId === params.instanceId) : [];
  const firstGroupedEntry = loggedGroup[0];
  const activeGroups = useMemo(() => nutritionMealGroups.filter((group) => !group.archived || entry?.mealGroupId === group.id || firstGroupedEntry?.mealGroupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder), [nutritionMealGroups, entry?.mealGroupId, firstGroupedEntry?.mealGroupId]);
  const [mode, setMode] = useState<Mode>(entry || savedFood || savedMeal ? 'manual' : params.recoveredPhotoUri ? 'label' : params.mode ?? 'manual');
  const [entryMethod, setEntryMethod] = useState<Mode | null>(entry || savedFood || savedMeal ? null : params.recoveredPhotoUri ? 'label' : params.mode ?? 'manual');
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [eventDate, setEventDate] = useState(entry?.eventDate ?? firstGroupedEntry?.eventDate ?? params.date ?? today()); const [time, setTime] = useState(entry?.eatenAt ? formatClockTime(entry.eatenAt) : firstGroupedEntry?.eatenAt ? formatClockTime(firstGroupedEntry.eatenAt) : localClockTime());
  const [mealGroupId, setMealGroupId] = useState<string | undefined>(firstGroupedEntry?.mealGroupId);
  const [confirmMeal, setConfirmMeal] = useState(false);
  const [description, setDescription] = useState(''); const [drafts, setDrafts] = useState<Draft[]>(() => entry ? [fromEntry(entry)] : loggedGroup.length ? loggedGroup.map(fromEntry) : savedFood ? [fromFood(savedFood)] : savedMeal ? savedMeal.items.map(fromSavedMealItem) : mode === 'manual' ? [blankDraft()] : []);
  const [initialDrafts] = useState(drafts);
  const [editingKey, setEditingKey] = useState<string | undefined>(() => entry || savedFood || mode === 'manual' && !savedMeal ? drafts[0]?.key : undefined);
  const [mealName, setMealName] = useState(firstGroupedEntry?.savedMealName ?? savedMeal?.name ?? '');
  const [quantityKey, setQuantityKey] = useState<string>();
  const [showSaveMeal, setShowSaveMeal] = useState(false);
  const [saveChoice, setSaveChoice] = useState<'log' | 'save-log'>('log');
  const [committed, setCommitted] = useState(false);
  const [status, setStatus] = useState(params.recoveredPhotoUri ? 'Recovering and reading the cropped label…' : ''); const [busy, setBusy] = useState(Boolean(params.recoveredPhotoUri)); const [photoUri, setPhotoUri] = useState<string | undefined>(params.recoveredPhotoUri); const [warnings, setWarnings] = useState<string[]>([]); const recoveryHandled = useRef(false);
  const savedMealInstanceId = useRef(params.instanceId ?? entry?.savedMealInstanceId ?? (savedMeal ? nutritionId('meal-log') : undefined)).current;
  const builderInstanceId = useRef(nutritionId('meal-log')).current;
  const cameraOpened = useRef(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const hasUnsavedChanges = !committed && (JSON.stringify(drafts) !== JSON.stringify(initialDrafts) || Boolean(description.trim()) || Boolean(photoUri) || mealName !== (firstGroupedEntry?.savedMealName ?? savedMeal?.name ?? '') || eventDate !== (entry?.eventDate ?? firstGroupedEntry?.eventDate ?? params.date ?? today()));
  const disablePrevention = usePreventRemove(hasUnsavedChanges, ({ repeat }) => Alert.alert('Discard meal?', 'Your unsaved foods and edits will be lost.', [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: () => { setCommitted(true); repeat(); } },
  ]));

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
        const incoming = parsed.items.map((item) => fromAi(item, 'ai_label', uri));
        setDrafts((current) => [...current.filter((draft) => !isBlankDraft(draft)), ...incoming]);
        setEntryMethod(null); setQuantityKey(incoming.length === 1 ? incoming[0].key : undefined);
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

  const update = (key: string, field: keyof Draft, value: string | boolean | Record<string, string>) => setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, [field]: value } : draft));
  const chooseMode = (next: Mode) => {
    if (entry || busy || saving.current) return;
    setMode(next); setShowMethodPicker(false); setEntryMethod(next === 'manual' ? null : next);
    setStatus(''); setWarnings([]);
    if (next === 'manual') {
      const blank = blankDraft();
      if (!drafts.some(isBlankDraft)) setDrafts((current) => [...current, blank]);
      setEditingKey(drafts.find(isBlankDraft)?.key ?? blank.key);
    } else {
      setDrafts((current) => current.filter((draft) => !isBlankDraft(draft)));
      setEditingKey(undefined);
    }
  };
  const addSavedFood = (food: SavedFood) => {
    const incoming = fromFood(food);
    setDrafts((current) => [...current.filter((draft) => !isBlankDraft(draft)), incoming]);
    setEntryMethod(null); setEditingKey(undefined); setQuantityKey(incoming.key);
    setShowMethodPicker(false); setShowLibraryPicker(false); setLibraryQuery('');
  };
  const addSavedMeal = (meal: typeof savedMeals[number]) => {
    const incoming = meal.items.map(fromSavedMealItem);
    setDrafts((current) => [...current.filter((draft) => !isBlankDraft(draft)), ...incoming]);
    setEntryMethod(null); setEditingKey(undefined);
    setQuantityKey(incoming.length === 1 ? incoming[0].key : undefined);
    setShowMethodPicker(false); setShowLibraryPicker(false); setLibraryQuery('');
  };
  const appendAiFoods = (items: Awaited<ReturnType<typeof parseNutritionText>>['items'], source: NutritionSource, labelPhotoUri?: string) => {
    const incoming = items.map((item) => fromAi(item, source, labelPhotoUri));
    setDrafts((current) => [...current.filter((draft) => !isBlankDraft(draft)), ...incoming]);
    setEntryMethod(null); setShowMethodPicker(false); setEditingKey(undefined); setDescription('');
    setQuantityKey(incoming.length === 1 ? incoming[0].key : undefined);
  };
  const analyzeText = async () => {
    setBusy(true);
    setWarnings([]);
    try {
      const suppliedSummaries = parseExplicitNutritionSummaries(description);
      if (suppliedSummaries) {
        appendAiFoods(suppliedSummaries, 'ai_text');
        setStatus(`Found ${suppliedSummaries.length} editable food${suppliedSummaries.length === 1 ? '' : 's'} using your supplied totals. Review before saving.`);
        return;
      }
      setStatus('Estimating separate foods…');
      const result = await parseNutritionText(description);
      appendAiFoods(result.items, 'ai_text');
      setWarnings(result.warnings);
      setStatus(`Found ${result.items.length} editable food${result.items.length === 1 ? '' : 's'}. Review every serving and value before saving.`);
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  };

  const analyzePhoto = async (asset: FramedLabelPhoto) => {
    try {
      setPhotoUri(asset.uri); setBusy(true); setStatus('Reading the framed nutrition label with AI…');
      const parsed = await parseNutritionLabel(asset.base64, asset.mimeType);
      appendAiFoods(parsed.items, 'ai_label', asset.uri); setWarnings(parsed.warnings); setStatus(`Found ${parsed.items.length} label item${parsed.items.length === 1 ? '' : 's'}. Compare every value with the photo before saving.`);
    } catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const processPhoto = async (camera: boolean) => {
    if (camera) { setCameraVisible(true); return; }
    try {
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: .68, base64: true };
      const result = await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0]; setPhotoUri(asset.uri); setBusy(true); setStatus('Reading the cropped nutrition label with AI…');
      const parsed = await parseNutritionLabel(asset.base64 ?? await new File(asset.uri).base64(), asset.mimeType ?? 'image/jpeg');
      appendAiFoods(parsed.items, 'ai_label', asset.uri); setWarnings(parsed.warnings); setStatus(`Found ${parsed.items.length} label item${parsed.items.length === 1 ? '' : 's'}. Compare every value with the photo before saving.`);
    } catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (params.captureOnOpen !== 'camera' || params.mode !== 'label' || params.recoveredPhotoUri || entry || savedFood || savedMeal || cameraOpened.current) return;
    cameraOpened.current = true;
    void processPhoto(true);
  }, [params.captureOnOpen, params.mode, params.recoveredPhotoUri, entry, savedFood, savedMeal]);

  const save = async (action: 'log' | 'save' | 'save-log' = 'log', confirmed = false) => {
    if (busy || saving.current) return;
    if (!drafts.length) return Alert.alert('No foods to save', 'Add a food or analyze a meal first.');
    saving.current = true;
    setBusy(true);
    const createdPhotos: string[] = [];
    let committed = false;
    try {
      const eatenAt = time.trim() ? parseClockTime(time) : undefined;
      if (time.trim() && !eatenAt) throw new Error('Enter a time like 9:30 AM or 6:15 PM, or leave it blank.');
      if (action !== 'log' && !mealName.trim()) throw new Error('Enter a name to save this meal for later.');
      // Validate the whole draft before opening the picker; no records or photos
      // are saved until the user explicitly chooses a meal and confirms.
      const group = params.instanceId ? requireNutritionMeal(activeGroups, mealGroupId) : confirmed ? requireNutritionMeal(activeGroups, mealGroupId) : { id: 'pending-meal', name: 'Pending meal selection' };
      const newMealId = action === 'log' ? undefined : nutritionId('meal');
      const batch: NutritionLogBatch = { entries: [], foods: [] };
      const photosToCopy: { foodId: string; uri: string }[] = [];
      const mealItems: SavedMealItem[] = [];
      for (const draft of drafts) {
        const parsed = parseDraft(draft);
        const foodId = draft.saveToLibrary ? draft.foodId ?? nutritionId('food') : draft.foodId;
        if (draft.saveToLibrary) {
          batch.foods.push({ id: foodId, name: parsed.name, brand: parsed.brand, servingLabel: parsed.servingLabel, servingWeightGrams: parsed.servingWeightGrams, nutrients: parsed.nutrients, statedCalories: parsed.statedCalories, source: draft.source });
          if (draft.labelPhotoUri && draft.source === 'ai_label') photosToCopy.push({ foodId: foodId!, uri: draft.labelPhotoUri });
        }
        mealItems.push({ id: nutritionId('meal-item'), foodId, name: parsed.name, brand: parsed.brand, servingLabel: parsed.servingLabel, servings: parsed.servings, amountMode: parsed.amountMode, consumedAmount: parsed.consumedAmount, consumedUnit: parsed.consumedUnit, servingWeightGrams: parsed.servingWeightGrams, nutrients: parsed.nutrients, statedCalories: parsed.statedCalories });
        batch.entries.push({ id: draft.entryId ?? entry?.id ?? nutritionId('entry'), eventDate, eatenAt, mealGroupId: group.id, mealLabel: group.name, foodId, ...parsed, source: entry?.source ?? (savedMeal ? 'saved_meal' : foodId && !draft.saveToLibrary ? 'saved_food' : draft.source), savedMealId: newMealId ?? firstGroupedEntry?.savedMealId ?? entry?.savedMealId ?? savedMeal?.id, savedMealName: newMealId ? mealName.trim() : mealName.trim() || group.name, savedMealInstanceId: savedMealInstanceId ?? (drafts.length > 1 || newMealId || mealName.trim() ? builderInstanceId : undefined) });
      }
      // Dates, amounts, every component, and optional library foods must all be valid.
      if (action !== 'save') prepareNutritionLogBatch(batch);
      const reusableMeal = action === 'log' ? undefined : { id: newMealId!, name: mealName.trim(), items: mealItems };
      if (reusableMeal) prepareSavedMeal(reusableMeal, reusableMeal.id);
      if (action !== 'save' && !confirmed && !params.instanceId) {
        Keyboard.dismiss();
        setMealGroupId(undefined);
        setSaveChoice(action);
        setConfirmMeal(true);
        return;
      }
      for (const photo of photosToCopy) {
        const uri = await preservePhoto(photo.uri, photo.foodId);
        createdPhotos.push(uri);
        batch.foods.find((food) => food.id === photo.foodId)!.labelPhotoUri = uri;
      }
      if (!mounted.current) return;
      if (params.instanceId && action === 'log') replaceNutritionLoggedMeal(params.instanceId, batch);
      else if (reusableMeal) saveNutritionMealBuilder(reusableMeal, action === 'save-log' ? batch : undefined, action === 'save' ? batch.foods : undefined);
      else saveNutritionLogBatch(batch);
      committed = true;
      setCommitted(true);
      disablePrevention();
      setConfirmMeal(false);
      if (action === 'save') router.replace({ pathname: '/nutrition-foods', params: { date: eventDate } });
      else if (!entry && eventDate === today()) setTimeout(() => setSavedConfirmation(true), 300);
      else router.replace({ pathname: '/nutrition', params: { date: eventDate } });
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
  const previews = drafts.map((draft) => { try { const parsed = parseDraft(draft); const scaled = scaleNutrients(parsed.nutrients, parsed.servings); return { calories: nutritionEntryCalories(parsed), ...scaled }; } catch { return undefined; } });
  const totals = previews.reduce((sum, item) => item ? { calories: sum.calories + item.calories, carbsGrams: sum.carbsGrams + item.carbsGrams, proteinGrams: sum.proteinGrams + item.proteinGrams, fatGrams: sum.fatGrams + item.fatGrams } : sum, { calories: 0, carbsGrams: 0, proteinGrams: 0, fatGrams: 0 });
  const librarySearch = libraryQuery.trim().toLowerCase();
  const matchingFoods = savedFoods.filter((food) => `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(librarySearch));
  const matchingMeals = savedMeals.filter((meal) => `${meal.name} ${meal.items.map((item) => item.name).join(' ')}`.toLowerCase().includes(librarySearch));

  return <SafeAreaView style={styles.safe} edges={['bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>{entry ? 'EDIT FOOD ENTRY' : 'MEAL BUILDER'}</Text><Text style={styles.title}>{entry ? entry.name : savedMeal?.name ?? 'Build your meal'}</Text>
    {!entry && !drafts.length && !entryMethod && <><Text style={styles.methodPrompt}>Choose how to add your food</Text><View style={styles.modeRow}><ModeButton label="Manual Entry" active={false} onPress={() => chooseMode('manual')} /><ModeButton label="Describe Meal" active={false} onPress={() => chooseMode('text')} /><ModeButton label="Scan Label" active={false} onPress={() => chooseMode('label')} /></View></>}
    <Text style={styles.label}>DATE</Text><TextInput value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.label}>TIME · OPTIONAL</Text><TextInput value={time} onChangeText={setTime} autoCapitalize="characters" placeholder="9:30 AM" placeholderTextColor={colors.textDim} style={styles.input} />
    {entryMethod === 'text' && !entry && <View style={styles.aiPanel}><Text style={styles.aiTitle}>What did you eat?</Text><Text style={styles.aiHelp}>Complete summaries with calories, protein, carbs, fat, and fiber are read on your device exactly as entered. Descriptions needing estimates are sent only when you tap Analyze Meal. Saved nutrition records remain local.</Text><TextInput value={description} onChangeText={setDescription} multiline placeholder="Example: Pulled pork wrap — 678 cal | 72g protein | 34g carbs | 37g fat | 22g fiber" placeholderTextColor={colors.textDim} style={[styles.input, styles.description]} /><Pressable disabled={busy} onPress={() => { void analyzeText(); }} style={[styles.analyze, busy && styles.disabled]}><Text style={styles.analyzeText}>{busy ? 'Analyzing…' : 'Analyze Meal'}</Text></Pressable></View>}
    {entryMethod === 'label' && !entry && <View style={styles.aiPanel}><Text style={styles.aiTitle}>Scan Nutrition Facts</Text><Text style={styles.aiHelp}>Fit the label in the camera guide, then review it before sending. Only the framed image you approve is transmitted through your secure relay to OpenAI. Gallery photos still offer a crop step.</Text><View style={styles.photoActions}><Pressable disabled={busy} onPress={() => { void processPhoto(true); }} style={styles.photoButton}><Text style={styles.photoButtonText}>Take photo</Text></Pressable><Pressable disabled={busy} onPress={() => { void processPhoto(false); }} style={styles.photoButton}><Text style={styles.photoButtonText}>Choose photo</Text></Pressable></View>{photoUri && <Image source={{ uri: photoUri }} resizeMode="contain" style={styles.photo} />}</View>}
    {status ? <Text style={styles.status}>{status}</Text> : null}{warnings.map((warning, index) => <Text key={`${warning}-${index}`} style={styles.warning}>• {warning}</Text>)}
    {!entry && <><Text style={styles.label}>MEAL NAME · OPTIONAL</Text><TextInput accessibilityLabel="Meal name" value={mealName} onChangeText={setMealName} placeholder="e.g. Chicken & Rice Bowl" placeholderTextColor={colors.textDim} style={styles.input} /></>}
    {quantityKey && drafts.find((draft) => draft.key === quantityKey) && <QuantityReview draft={drafts.find((draft) => draft.key === quantityKey)!} onUpdate={(field, value) => update(quantityKey, field, value)} onDetails={() => { setEditingKey(quantityKey); setQuantityKey(undefined); }} onConfirm={() => { try { parseDraft(drafts.find((draft) => draft.key === quantityKey)!); setQuantityKey(undefined); } catch (error) { Alert.alert('Check amount eaten', message(error)); } }} />}
    {!quantityKey && <>
    {!!drafts.length && <View style={styles.builderSummary}><Text style={styles.aiTitle}>Foods in this meal · {drafts.length}</Text>{drafts.map((draft, index) => <View key={draft.key} style={styles.builderItem}><View style={styles.flex}><Text style={styles.builderName}>{draft.name.trim() || `Food ${index + 1} · needs details`}</Text><Text style={styles.builderMeta}>{draft.amountMode === 'weight' ? `${draft.weightAmount || '—'} ${draft.weightUnit}` : `${draft.servings || '—'} serving(s)`} · {draft.servingLabel || '1 serving'}</Text><Text style={styles.builderMeta}>{previews[index] ? `${formatAmount(previews[index]!.calories)} kcal · ${formatAmount(previews[index]!.proteinGrams)}g protein · ${formatAmount(previews[index]!.carbsGrams)}g carbs · ${formatAmount(previews[index]!.fatGrams)}g fat` : 'Complete this food to include it in totals'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${draft.name || `food ${index + 1}`}`} onPress={() => setEditingKey(editingKey === draft.key ? undefined : draft.key)}><Text style={styles.setupLink}>{editingKey === draft.key ? 'Done' : 'Edit'}</Text></Pressable>{!entry && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${draft.name || `food ${index + 1}`}`} onPress={() => { setDrafts((current) => current.filter((item) => item.key !== draft.key)); if (editingKey === draft.key) setEditingKey(undefined); }}><Text style={styles.remove}>Remove</Text></Pressable>}</View>)}<View style={styles.builderTotal}><Text style={styles.builderName}>Combined total · {formatAmount(totals.calories)} kcal</Text><Text style={styles.builderMeta}>{formatAmount(totals.proteinGrams)}g protein · {formatAmount(totals.carbsGrams)}g carbs · {formatAmount(totals.fatGrams)}g fat</Text>{previews.some((item) => !item) && <Text style={styles.warning}>Incomplete foods are not included yet.</Text>}</View></View>}
    {drafts.map((draft, index) => editingKey === draft.key && <DraftCard key={draft.key} draft={draft} index={index} canRemove={false} customNutrients={customNutrients} onUpdate={(field, value) => update(draft.key, field, value)} onRemove={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))} />)}
    {!entry && <Pressable onPress={() => setShowMethodPicker(true)} style={styles.addAnother}><Text style={styles.addAnotherText}>+ Add Another Food</Text></Pressable>}
    <Pressable disabled={busy} onPress={() => { void save('log'); }} style={[styles.save, busy && styles.disabled]}><Text style={styles.saveText}>{entry ? 'Save changes' : 'Log Meal'}</Text></Pressable>
    {!entry && <><Pressable onPress={() => setShowSaveMeal((current) => !current)} style={styles.cancel}><Text style={styles.cancelText}>Save as Meal</Text></Pressable>{showSaveMeal && <View style={styles.aiPanel}><Text style={styles.aiTitle}>Save for future use</Text><TextInput accessibilityLabel="Saved meal name" value={mealName} onChangeText={setMealName} placeholder="Meal name, e.g. Chicken & Rice Bowl" placeholderTextColor={colors.textDim} style={[styles.input, { marginTop: 10 }]} /><Pressable disabled={busy} onPress={() => { void save('save'); }} style={[styles.save, busy && styles.disabled]}><Text style={styles.saveText}>Save Meal</Text></Pressable><Pressable disabled={busy} onPress={() => { void save('save-log'); }} style={[styles.cancel, busy && styles.disabled]}><Text style={styles.cancelText}>Save Meal & Log It Now</Text></Pressable></View>}</>}
    <Pressable onPress={() => router.back()} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>{entry && <Pressable onPress={remove} style={styles.delete}><Text style={styles.deleteText}>Delete this food entry</Text></Pressable>}
    </>}
  </KeyboardSafeScrollView>
    <NutritionMealConfirmation visible={confirmMeal} groups={activeGroups} selectedId={mealGroupId} eventDate={eventDate} busy={busy} onSelect={setMealGroupId} onBack={() => { if (!saving.current) setConfirmMeal(false); }} onConfirm={() => { void save(saveChoice, true); }} />
    <SavedAdConfirmation visible={savedConfirmation} onContinue={() => { setSavedConfirmation(false); void showCompletionAd('meal').finally(() => router.replace('/nutrition')); }} />
    <LabelCamera visible={cameraVisible} label="Nutrition Facts" onCancel={() => setCameraVisible(false)} onConfirm={(photo) => { setCameraVisible(false); void analyzePhoto(photo); }} />
    <Modal visible={showMethodPicker} transparent animationType="fade" onRequestClose={() => { if (showLibraryPicker) setShowLibraryPicker(false); else setShowMethodPicker(false); }}><View style={styles.methodOverlay}><View style={styles.methodPanel}><Text style={styles.methodTitle}>{showLibraryPicker ? 'Food Library' : 'Add another food'}</Text><Text style={styles.methodHelp}>{showLibraryPicker ? 'Choose a saved food or meal to add to this meal.' : 'How would you like to add it?'}</Text>{showLibraryPicker ? <><TextInput value={libraryQuery} onChangeText={setLibraryQuery} placeholder="Search saved foods and meals" placeholderTextColor={colors.textDim} style={[styles.input, styles.librarySearch]} /><ScrollView keyboardShouldPersistTaps="handled" style={styles.libraryList}>{matchingMeals.length > 0 && <Text style={styles.libraryHeading}>SAVED MEALS</Text>}{matchingMeals.map((meal) => <Pressable key={meal.id} accessibilityRole="button" onPress={() => addSavedMeal(meal)} style={styles.methodOption}><Text style={styles.methodOptionText}>{meal.name}</Text><Text style={styles.libraryMeta}>{meal.items.length} foods · {meal.items.map((item) => item.name).join(', ')}</Text></Pressable>)}{matchingFoods.length > 0 && <Text style={styles.libraryHeading}>SAVED FOODS</Text>}{matchingFoods.map((food) => <Pressable key={food.id} accessibilityRole="button" onPress={() => addSavedFood(food)} style={styles.methodOption}><Text style={styles.methodOptionText}>{food.name}</Text><Text style={styles.libraryMeta}>{food.brand ? `${food.brand} · ` : ''}{food.servingLabel}</Text></Pressable>)}{!matchingFoods.length && !matchingMeals.length && <Text style={styles.libraryEmpty}>{savedFoods.length || savedMeals.length ? 'No matches found.' : 'No saved foods or meals yet.'}</Text>}</ScrollView></> : <><Pressable accessibilityRole="button" onPress={() => chooseMode('text')} style={styles.methodOption}><Text style={styles.methodOptionText}>Describe Meal</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { chooseMode('label'); setCameraVisible(true); }} style={styles.methodOption}><Text style={styles.methodOptionText}>Scan Label</Text></Pressable><Pressable accessibilityRole="button" onPress={() => chooseMode('manual')} style={styles.methodOption}><Text style={styles.methodOptionText}>Manual Entry</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setShowLibraryPicker(true)} style={styles.methodOption}><Text style={styles.methodOptionText}>Food Library</Text></Pressable></>}<Pressable accessibilityRole="button" onPress={() => { if (showLibraryPicker) setShowLibraryPicker(false); else setShowMethodPicker(false); }} style={styles.methodCancel}><Text style={styles.methodCancelText}>{showLibraryPicker ? 'Back' : 'Cancel'}</Text></Pressable></View></View></Modal>
  </SafeAreaView>;
}

function QuantityReview({ draft, onUpdate, onDetails, onConfirm }: { draft: Draft; onUpdate: (field: keyof Draft, value: string) => void; onDetails: () => void; onConfirm: () => void }) {
  return <View style={styles.aiPanel}><Text style={styles.aiTitle}>How much did you eat?</Text><Text style={styles.builderName}>{draft.name}</Text><Text style={styles.builderMeta}>Label serving: {draft.servingLabel || '1 serving'}{draft.servingWeightGrams ? ` · ${draft.servingWeightGrams} g` : ''}</Text><View style={styles.amountModes}><AmountMode label="Servings" active={draft.amountMode === 'servings'} onPress={() => onUpdate('amountMode', 'servings')} /><AmountMode label="Weight" active={draft.amountMode === 'weight'} onPress={() => onUpdate('amountMode', 'weight')} /></View>{draft.amountMode === 'servings' ? <Field label="SERVINGS EATEN" value={draft.servings} onChange={(value) => onUpdate('servings', value)} numeric /> : <><Field label="ONE SERVING WEIGHS · G" value={draft.servingWeightGrams} onChange={(value) => onUpdate('servingWeightGrams', value)} numeric /><Field label={`WEIGHT EATEN · ${draft.weightUnit.toUpperCase()}`} value={draft.weightAmount} onChange={(value) => onUpdate('weightAmount', value)} numeric /><View style={styles.unitRow}>{(['g', 'oz'] as const).map((unit) => <Pressable key={unit} onPress={() => onUpdate('weightUnit', unit)} style={[styles.unitButton, draft.weightUnit === unit && styles.unitButtonActive]}><Text style={styles.unitButtonText}>{unit}</Text></Pressable>)}</View></>}<Pressable onPress={onDetails} style={styles.cancel}><Text style={styles.cancelText}>Edit food details</Text></Pressable><Pressable onPress={onConfirm} style={styles.save}><Text style={styles.saveText}>Add to meal</Text></Pressable></View>;
}

function DraftCard({ draft, index, canRemove, customNutrients, onUpdate, onRemove }: { draft: Draft; index: number; canRemove: boolean; customNutrients: { id: string; name: string; unit: string }[]; onUpdate: (field: keyof Draft, value: string | boolean | Record<string, string>) => void; onRemove: () => void }) {
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
    <Text style={styles.referenceHeading}>VALUES FOR ONE LABEL SERVING</Text><View style={styles.two}><Field label="CARBS · G" value={draft.carbs} onChange={(value) => onUpdate('carbs', value)} numeric /><Field label="PROTEIN · G" value={draft.protein} onChange={(value) => onUpdate('protein', value)} numeric /></View><View style={styles.two}><Field label="FAT · G" value={draft.fat} onChange={(value) => onUpdate('fat', value)} numeric /></View><Field label="PRINTED / ESTIMATED CALORIES · PER SERVING" value={draft.statedCalories} onChange={(value) => onUpdate('statedCalories', value)} numeric /><Field label="NOTE · OPTIONAL" value={draft.note} onChange={(value) => onUpdate('note', value)} multiline />
    <FoodNutrientFields values={draft.extra} onChange={(values) => onUpdate('extra', values)} fiber={draft.fiber} onFiberChange={(value) => onUpdate('fiber', value)} />
    {draft.assumptions.map((assumption, assumptionIndex) => <Text key={assumptionIndex} style={styles.assumption}>• {assumption}</Text>)}
    {!draft.foodId && <Pressable onPress={() => onUpdate('saveToLibrary', !draft.saveToLibrary)} style={styles.saveFoodRow}><View style={[styles.checkbox, draft.saveToLibrary && styles.checkboxOn]}>{draft.saveToLibrary && <Text style={styles.check}>✓</Text>}</View><View style={styles.flex}><Text style={styles.saveFoodTitle}>Save to food library</Text><Text style={styles.saveFoodHelp}>Ask each time; historical logs remain separate snapshots.</Text></View></Pressable>}
  </View>;
}

function Field({ label, value, onChange, numeric, multiline }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; multiline?: boolean }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} placeholderTextColor={colors.textDim} style={[styles.input, multiline && styles.multiline]} /></View>; }
function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.mode, active && styles.modeActive]}><Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text></Pressable>; }
function AmountMode({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.amountMode, active && styles.amountModeActive]}><Text style={[styles.amountModeText, active && styles.amountModeTextActive]}>{label}</Text></Pressable>; }
function blankDraft(): Draft { return { key: nutritionId('draft'), name: '', brand: '', servingLabel: '', servings: '1', amountMode: 'servings', servingWeightGrams: '', weightAmount: '', weightUnit: 'g', carbs: '', protein: '', fat: '', fiber: '', extra: {}, statedCalories: '', note: '', source: 'manual', assumptions: [], saveToLibrary: false }; }
function isBlankDraft(draft: Draft) { return draft.source === 'manual' && draft.servings === '1' && draft.amountMode === 'servings' && !draft.saveToLibrary && !draft.name.trim() && !draft.brand.trim() && !draft.servingLabel.trim() && !draft.carbs.trim() && !draft.protein.trim() && !draft.fat.trim() && !draft.fiber.trim() && !draft.statedCalories.trim() && !draft.note.trim() && !draft.weightAmount.trim() && !draft.servingWeightGrams.trim() && !Object.values(draft.extra).some((value) => value.trim()); }
function fromEntry(entry: NutritionEntry): Draft { const servingWeight = entry.servingWeightGrams ?? extractServingWeightGrams(entry.servingLabel); return { key: entry.id, entryId: entry.id, foodId: entry.foodId, name: entry.name, brand: entry.brand ?? '', servingLabel: entry.servingLabel, servings: String(entry.servings), amountMode: entry.amountMode ?? 'servings', servingWeightGrams: servingWeight === undefined ? '' : String(servingWeight), weightAmount: entry.consumedAmount === undefined ? '' : String(entry.consumedAmount), weightUnit: entry.consumedUnit ?? 'g', carbs: String(entry.nutrients.carbsGrams), protein: String(entry.nutrients.proteinGrams), fat: String(entry.nutrients.fatGrams), fiber: String(entry.nutrients.fiberGrams), extra: stringValues(entry.nutrients.extraNutrients), statedCalories: entry.statedCalories == null ? '' : String(entry.statedCalories), note: entry.note ?? '', source: entry.source, assumptions: [], saveToLibrary: false }; }
function fromFood(food: SavedFood): Draft { const servingWeight = food.servingWeightGrams ?? extractServingWeightGrams(food.servingLabel); return { key: nutritionId('draft'), foodId: food.id, name: food.name, brand: food.brand ?? '', servingLabel: food.servingLabel, servings: '1', amountMode: servingWeight ? 'weight' : 'servings', servingWeightGrams: servingWeight === undefined ? '' : String(servingWeight), weightAmount: '', weightUnit: 'g', carbs: String(food.nutrients.carbsGrams), protein: String(food.nutrients.proteinGrams), fat: String(food.nutrients.fatGrams), fiber: String(food.nutrients.fiberGrams), extra: stringValues(food.nutrients.extraNutrients), statedCalories: food.statedCalories == null ? '' : String(food.statedCalories), note: '', source: 'saved_food', assumptions: [], saveToLibrary: false }; }
function fromSavedMealItem(item: SavedMealItem): Draft { return { key: nutritionId('draft'), foodId: item.foodId, name: item.name, brand: item.brand ?? '', servingLabel: item.servingLabel, servings: String(item.servings), amountMode: item.amountMode, servingWeightGrams: item.servingWeightGrams === undefined ? '' : String(item.servingWeightGrams), weightAmount: item.consumedAmount === undefined ? '' : String(item.consumedAmount), weightUnit: item.consumedUnit ?? 'g', carbs: String(item.nutrients.carbsGrams), protein: String(item.nutrients.proteinGrams), fat: String(item.nutrients.fatGrams), fiber: String(item.nutrients.fiberGrams), extra: stringValues(item.nutrients.extraNutrients), statedCalories: item.statedCalories == null ? '' : String(item.statedCalories), note: '', source: 'saved_meal', assumptions: [], saveToLibrary: false }; }
function fromAi(item: Awaited<ReturnType<typeof parseNutritionText>>['items'][number], source: NutritionSource, labelPhotoUri?: string): Draft { const servingWeight = item.servingWeightGrams ?? extractServingWeightGrams(item.servingLabel); return { key: nutritionId('draft'), name: item.name, brand: item.brand ?? '', servingLabel: item.servingLabel, servings: '1', amountMode: 'servings', servingWeightGrams: servingWeight === undefined ? '' : String(servingWeight), weightAmount: '', weightUnit: 'g', carbs: String(item.nutrients.carbsGrams), protein: String(item.nutrients.proteinGrams), fat: String(item.nutrients.fatGrams), fiber: String(item.nutrients.fiberGrams), extra: stringValues(item.nutrients.extraNutrients), statedCalories: item.statedCalories == null ? '' : String(item.statedCalories), note: '', source, confidence: item.confidence, assumptions: item.assumptions, saveToLibrary: false, labelPhotoUri }; }
function parseDraft(draft: Draft) { const nutrients = { carbsGrams: Number(draft.carbs), proteinGrams: Number(draft.protein), fatGrams: Number(draft.fat), fiberGrams: Number(draft.fiber), extraNutrients: { ...parseFoodExtraNutrients(draft.extra), ...(draft.fiber.trim() && (draft.source === 'manual' || Number(draft.fiber) > 0 || draft.extra.fiber !== undefined) ? { fiber: Number(draft.fiber) } : {}) } }; if (!draft.name.trim()) throw new Error('Every food needs a name.'); if (draft.source !== 'manual' && !draft.servingLabel.trim()) throw new Error(`${draft.name || 'Each food'} needs a serving description.`); if ([nutrients.carbsGrams, nutrients.proteinGrams, nutrients.fatGrams, nutrients.fiberGrams].some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`${draft.name} has an invalid macro value.`); const servingWeightGrams = optionalPositive(draft.servingWeightGrams, `${draft.name} needs a valid label serving weight.`); const consumedAmount = draft.amountMode === 'weight' ? requiredPositive(draft.weightAmount, `${draft.name} needs the weight eaten.`) : undefined; const servings = draft.amountMode === 'weight' ? servingsForWeight(consumedAmount!, draft.weightUnit, servingWeightGrams ?? 0) : requiredPositive(draft.servings, `${draft.name} needs a serving amount greater than zero.`); const statedCalories = draft.statedCalories.trim() ? Number(draft.statedCalories) : undefined; if (statedCalories !== undefined && (!Number.isFinite(statedCalories) || statedCalories < 0)) throw new Error(`${draft.name} has invalid reference calories.`); return { name: draft.name.trim(), brand: draft.brand.trim() || undefined, servingLabel: draft.servingLabel.trim() || '1 serving', servings, amountMode: draft.amountMode, consumedAmount, consumedUnit: draft.amountMode === 'weight' ? draft.weightUnit : undefined, servingWeightGrams, nutrients, statedCalories, note: draft.note.trim() || undefined }; }
function stringValues(values?: Record<string, number>) { return Object.fromEntries(Object.entries(values ?? {}).map(([id, amount]) => [id, String(amount)])); }
function draftMultiplier(draft: Draft) { try { return draft.amountMode === 'weight' ? servingsForWeight(Number(draft.weightAmount), draft.weightUnit, Number(draft.servingWeightGrams)) : requiredPositive(draft.servings, ''); } catch { return undefined; } }
function requiredPositive(value: string, error: string) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(error); return parsed; }
function optionalPositive(value: string, error: string) { if (!value.trim()) return undefined; return requiredPositive(value, error); }
function formatAmount(value: string | number) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) ? `${Math.round(parsed * 100) / 100}` : '—'; }
function weightCalculationText(draft: Draft, multiplier: number) { const amount = Number(draft.weightAmount); const converted = draft.weightUnit === 'oz' ? ` (${formatAmount(amount * 28.349523125)} g)` : ''; return `${formatAmount(amount)} ${draft.weightUnit}${converted} using ${formatAmount(draft.servingWeightGrams)} g per serving = ${formatAmount(multiplier)} servings`; }
async function preservePhoto(uri: string, foodId: string) { const source = new File(uri); const extension = source.extension || '.jpg'; const destination = new File(Paths.document, `nutrition-${foodId}-${nutritionId('photo')}${extension}`); await source.copy(destination); return destination.uri; }
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg }, eyebrow: { color: colors.nutritionNav, fontSize: 11, fontFamily: font.bold, letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 30, fontFamily: font.bold, marginTop: 7 }, methodPrompt: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 18 }, modeRow: { flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: 14, padding: 4, marginTop: 8 }, mode: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, modeActive: { backgroundColor: '#2A2140' }, modeText: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold }, modeTextActive: { color: colors.nutritionNav }, label: { color: colors.textDim, fontSize: 11, fontFamily: font.bold, letterSpacing: .7, marginTop: 13, marginBottom: 5 }, input: { minHeight: 46, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12, color: colors.text, paddingHorizontal: 12 }, multiline: { minHeight: 78, paddingTop: 11, textAlignVertical: 'top' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 }, chipActive: { backgroundColor: '#2A2140', borderColor: '#6C5398' }, chipText: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold }, chipTextActive: { color: colors.nutritionNav }, aiPanel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 13, marginTop: 15 }, aiTitle: { color: colors.text, fontSize: 14, fontFamily: font.bold }, aiHelp: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 15, marginTop: 5 }, description: { minHeight: 112, textAlignVertical: 'top', paddingTop: 11, marginTop: 10 }, analyze: { backgroundColor: colors.nutritionNav, borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: 10 }, analyzeText: { color: colors.background, fontSize: 11, fontFamily: font.bold }, photoActions: { flexDirection: 'row', gap: 8, marginTop: 12 }, photoButton: { flex: 1, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', paddingVertical: 12 }, photoButtonText: { color: colors.text, fontSize: 11, fontFamily: font.semibold }, photo: { width: '100%', aspectRatio: 4 / 3, maxHeight: 320, backgroundColor: colors.background, borderRadius: 12, marginTop: 10 }, status: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 12 }, warning: { color: colors.settingsNav, fontSize: 11, fontFamily: font.regular, lineHeight: 14, marginTop: 4 }, setupLink: { color: colors.nutritionNav, fontSize: 11, fontFamily: font.bold, marginTop: 9 }, builderSummary: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 13, marginTop: 16 }, builderItem: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 11 }, builderName: { color: colors.text, fontSize: 12, fontFamily: font.bold }, builderMeta: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 15, marginTop: 3 }, builderTotal: { backgroundColor: '#211B31', borderRadius: 12, padding: 11, marginTop: 12 }, draft: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 13, marginTop: 14 }, draftHead: { flexDirection: 'row', alignItems: 'center' }, flex: { flex: 1 }, draftEyebrow: { color: colors.nutritionNav, fontSize: 11, fontFamily: font.bold, letterSpacing: .7 }, draftCalories: { color: colors.text, fontSize: 21, fontFamily: font.bold, marginTop: 3 }, perServing: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold }, remove: { color: colors.danger, fontSize: 11, fontFamily: font.semibold, padding: 5 }, two: { flexDirection: 'row', gap: 8 }, field: { flex: 1 }, amountHeading: { color: colors.text, fontSize: 11, fontFamily: font.bold, letterSpacing: .5, marginTop: 18 }, amountModes: { flexDirection: 'row', gap: 7, marginTop: 8 }, amountMode: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.surfaceRaised }, amountModeActive: { borderColor: colors.nutritionNav, backgroundColor: '#2A2140' }, amountModeText: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold }, amountModeTextActive: { color: colors.nutritionNav }, unitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }, unitLabel: { flex: 1, color: colors.textMuted, fontSize: 11 , fontFamily: font.regular}, unitButton: { minWidth: 48, minHeight: 36, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, unitButtonActive: { borderColor: colors.nutritionNav, backgroundColor: '#2A2140' }, unitButtonText: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold }, unitButtonTextActive: { color: colors.nutritionNav }, calculation: { backgroundColor: '#211B31', borderRadius: 12, padding: 11, marginTop: 11 }, calculationTitle: { color: colors.text, fontSize: 11, fontFamily: font.semibold }, calculationMacros: { color: colors.nutritionNav, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 4 }, calculationReference: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 3 }, referenceHeading: { color: colors.textDim, fontSize: 11, fontFamily: font.bold, letterSpacing: .7, marginTop: 19 }, assumption: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 14, marginTop: 6 }, saveFoodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 11, marginTop: 12 }, checkbox: { width: 22, height: 22, borderRadius: 6, borderColor: colors.textDim, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, checkboxOn: { backgroundColor: colors.nutritionNav, borderColor: colors.nutritionNav }, check: { color: colors.background, fontFamily: font.bold }, saveFoodTitle: { color: colors.text, fontSize: 11, fontFamily: font.bold }, saveFoodHelp: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 2 }, addAnother: { alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingVertical: 12, marginTop: 10 }, addAnotherText: { color: colors.nutritionNav, fontSize: 11, fontFamily: font.semibold }, save: { backgroundColor: colors.nutritionNav, borderRadius: 14, alignItems: 'center', paddingVertical: 15, marginTop: 17 }, saveText: { color: colors.background, fontSize: 11, fontFamily: font.bold }, cancel: { alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 9 }, cancelText: { color: colors.text, fontSize: 11, fontFamily: font.semibold }, delete: { alignItems: 'center', paddingVertical: 15, marginTop: 10 }, deleteText: { color: colors.danger, fontSize: 11, fontFamily: font.semibold }, disabled: { opacity: .5 },
  methodOverlay: { flex: 1, backgroundColor: '#000C', justifyContent: 'center', padding: 24 },
  methodPanel: { backgroundColor: colors.surface, borderColor: '#7654A3', borderWidth: 1.5, borderRadius: 20, padding: 18, maxHeight: '80%' },
  methodTitle: { color: colors.text, fontSize: 18, fontFamily: font.bold },
  methodHelp: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 17, marginTop: 5, marginBottom: 9 },
  methodOption: { backgroundColor: '#211B31', borderColor: '#74539E', borderWidth: 1, borderRadius: 13, minHeight: 52, justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 10, marginTop: 9 },
  methodOptionText: { color: colors.nutritionNav, fontSize: 13, fontFamily: font.bold },
  methodCancel: { borderColor: colors.border, borderWidth: 1, borderRadius: 13, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  methodCancelText: { color: colors.text, fontSize: 12, fontFamily: font.semibold },
  librarySearch: { marginTop: 8 },
  libraryList: { flexGrow: 0, marginTop: 7 },
  libraryHeading: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, letterSpacing: 1, marginTop: 16 },
  libraryMeta: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 15, marginTop: 3 },
  libraryEmpty: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, textAlign: 'center', paddingVertical: 22 },
});
