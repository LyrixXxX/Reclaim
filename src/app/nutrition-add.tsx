import { useMemo, useState } from 'react';
import { Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SavedAdConfirmation } from '@/components/saved-ad-confirmation';
import { Chevron } from '@/components/icon';
import { useAds } from '@/state/ads-context';
import { useTrackers } from '@/state/tracker-context';
import { FoodChoice, foodChoice, foodMatchRank, mealChoice, recentFoodChoices, searchFoodChoices, suggestedMealGroupId } from '@/lib/food-search';
import { nutritionEntryCalories, nutritionId, prepareNutritionLogBatch, scaleNutrients, servingsForWeight } from '@/lib/nutrition';
import { isoToUs } from '@/lib/us-date';
import { colors, font, layout, radius, spacing } from '@/theme';

const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const nowClock = () => { const date = new Date(); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; };
const round = (value: number) => Math.round(value * 10) / 10;
const fmt = (value: number) => Number.isInteger(round(value)) ? String(round(value)) : round(value).toFixed(1);

/** Quick add: search what you've eaten before, pick an amount and a meal, log it. */
export default function NutritionAddScreen() {
  const params = useLocalSearchParams<{ date?: string; meal?: string; view?: string }>();
  const date = params.date ?? today();
  const { nutritionEntries = [], savedFoods = [], savedMeals = [], nutritionMealGroups = [], saveNutritionLogBatch, deleteNutritionEntry, renameLoggedFood, saveNutritionFood } = useTrackers();
  const { showCompletionAd } = useAds();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'home' | 'library'>(params.view === 'library' ? 'library' : 'home');
  const [renaming, setRenaming] = useState<FoodChoice>();
  const [picked, setPicked] = useState<FoodChoice>();
  const [added, setAdded] = useState<{ ids: string[]; title: string; detail: string }>();
  // The last food logged with "Log and add another", while the next one is being chosen.
  const [lastAdded, setLastAdded] = useState<{ id: string; text: string }>();
  const groups = useMemo(() => nutritionMealGroups.filter((group) => !group.archived).sort((a, b) => a.sortOrder - b.sortOrder), [nutritionMealGroups]);
  const recents = useMemo(() => recentFoodChoices(nutritionEntries), [nutritionEntries]);
  const trimmed = query.trim();
  const results = trimmed ? searchFoodChoices(trimmed, savedFoods, savedMeals, view === 'library' ? [] : recents) : [];
  const exact = results.some((item) => foodMatchRank(item.name, trimmed) === 0 && item.name.trim().toLowerCase() === trimmed.toLowerCase());

  const choose = (item: FoodChoice) => {
    Keyboard.dismiss();
    if (item.kind === 'meal') { router.push({ pathname: '/nutrition-log', params: { mealId: item.mealId, date, ...(params.meal ? { meal: params.meal } : {}) } }); return; }
    setPicked(item);
  };
  const openEntry = (mode: 'manual' | 'text' | 'label', name?: string) => router.push({ pathname: '/nutrition-log', params: { mode, date, ...(name ? { name } : {}), ...(params.meal ? { meal: params.meal } : {}), ...(mode === 'label' ? { captureOnOpen: 'camera' } : {}) } });

  const actions = (item: FoodChoice) => {
    if (item.kind === 'meal') { Alert.alert(item.name, undefined, [{ text: 'Edit meal', onPress: () => router.push({ pathname: '/nutrition-meal-form', params: { id: item.mealId } }) }, { text: 'Cancel', style: 'cancel' }]); return; }
    const saved = item.foodId && savedFoods.some((food) => food.id === item.foodId);
    Alert.alert(item.name, saved ? 'Saved in your food library.' : 'Logged before, not saved to your library.', [
      { text: 'Rename', onPress: () => setRenaming(item) },
      saved
        ? { text: 'Edit details', onPress: () => router.push({ pathname: '/nutrition-food-form', params: { id: item.foodId! } }) }
        : { text: 'Save to library', onPress: () => {
          const id = nutritionId('food');
          saveNutritionFood({ name: item.name, brand: item.brand, servingLabel: item.servingLabel || '1 serving', servingWeightGrams: item.servingWeightGrams, nutrients: item.nutrients, statedCalories: item.statedCalories, source: 'manual' }, id);
          router.push({ pathname: '/nutrition-food-form', params: { id } });
        } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const finish = () => {
    setAdded(undefined);
    if (date !== today()) { router.replace({ pathname: '/nutrition', params: { date } }); return; }
    void showCompletionAd('meal').finally(() => router.replace({ pathname: '/nutrition', params: { date } }));
  };
  const addAnother = () => { setAdded(undefined); setQuery(''); setView('home'); };
  const undo = () => { added?.ids.forEach((id) => deleteNutritionEntry(id, true)); setAdded(undefined); };

  return <SafeAreaView style={styles.safe} edges={['bottom']}>
    {lastAdded && <View style={styles.addedBar}>
      <Text style={styles.addedText} numberOfLines={2}>{lastAdded.text}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Undo: ${lastAdded.text}`} hitSlop={8} onPress={() => { deleteNutritionEntry(lastAdded.id, true); setLastAdded(undefined); }}><Text style={styles.addedUndo}>Undo</Text></Pressable>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={finish}><Text style={styles.addedDone}>Done</Text></Pressable>
    </View>}
    {view === 'home' ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
      <Text style={styles.prompt}>How would you like to add it?</Text>
      <Option icon="✦" title="Describe meal" detail="Type what you ate." onPress={() => openEntry('text')} />
      <Option icon="⌗" title="Scan label" detail="Photograph a nutrition label." onPress={() => openEntry('label')} />
      <Option icon="✎" title="Manual entry" detail="Enter calories and macros yourself." onPress={() => openEntry('manual')} />
      <Option icon="▤" title="Food library" detail={savedFoods.length || savedMeals.length ? `${savedFoods.length} saved ${savedFoods.length === 1 ? 'food' : 'foods'} · ${savedMeals.length} saved ${savedMeals.length === 1 ? 'meal' : 'meals'}` : 'Foods and meals you save show up here.'} onPress={() => { setQuery(''); setView('library'); }} />
      {recents.length > 0 && <View style={styles.headingRow}><Text style={styles.heading}>Recent</Text><Text style={styles.headingHint}>Hold a food to rename it</Text></View>}
      {recents.slice(0, 10).map((item) => <Row key={item.key} item={item} onPress={() => choose(item)} onLongPress={() => actions(item)} />)}
    </ScrollView> : <>
      <View style={styles.searchWrap}>
        <View style={styles.libraryHead}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to add food options" hitSlop={8} onPress={() => { setQuery(''); setView('home'); }}><Text style={styles.back}>‹ Add food</Text></Pressable>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push({ pathname: '/nutrition-foods', params: { date } })}><Text style={styles.manage}>Manage</Text></Pressable>
        </View>
        <View style={styles.search}>
          <TextInput accessibilityLabel="Search your food library" value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" placeholder="Search saved foods and meals" placeholderTextColor={colors.textDim} style={styles.searchInput} />
          {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}><Text style={styles.clear}>×</Text></Pressable>}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        {trimmed ? <>
          {results.map((item) => <Row key={item.key} item={item} query={trimmed} onPress={() => choose(item)} onLongPress={() => actions(item)} />)}
          {!results.length && <Text style={styles.empty}>Nothing saved matches “{trimmed}”.</Text>}
          {!exact && <Pressable accessibilityRole="button" onPress={() => openEntry('manual', trimmed)} style={styles.create}><Text style={styles.createText}>+ Create “{trimmed}”</Text></Pressable>}
        </> : <>
          {savedFoods.length > 0 && <Text style={styles.heading}>Saved foods</Text>}
          {[...savedFoods].sort((x, y) => x.name.localeCompare(y.name)).map((food) => { const item = foodChoice(food); return <Row key={item.key} item={item} onPress={() => choose(item)} onLongPress={() => actions(item)} />; })}
          {savedMeals.length > 0 && <Text style={styles.heading}>Saved meals</Text>}
          {[...savedMeals].sort((x, y) => x.name.localeCompare(y.name)).map((meal) => { const item = mealChoice(meal); return <Row key={item.key} item={item} onPress={() => choose(item)} onLongPress={() => actions(item)} />; })}
          {!savedFoods.length && !savedMeals.length && <Text style={styles.empty}>Your library is empty. Foods you enter manually are saved here when “Remember this food” is on, or hold a recent food and choose Save to library.</Text>}
        </>}
      </ScrollView>
    </>}
    {picked && <AmountSheet item={picked} date={date} groups={groups} initialMeal={params.meal ?? suggestedMealGroupId(groups) ?? groups[0]?.id} onClose={() => setPicked(undefined)} onLog={(entry, mealName, another) => {
      const batch = { entries: [entry], foods: [] };
      prepareNutritionLogBatch(batch);
      saveNutritionLogBatch(batch);
      setPicked(undefined);
      setQuery('');
      const calories = nutritionEntryCalories(entry);
      if (another) { setLastAdded({ id: entry.id!, text: `Added ${entry.name} to ${mealName}` }); setView('home'); return; }
      setLastAdded(undefined);
      if (date === today()) setAdded({ ids: [entry.id!], title: `Added to ${mealName}`, detail: `${entry.name} · ${fmt(calories)} kcal` });
      else router.replace({ pathname: '/nutrition', params: { date } });
    }} />}
    {renaming && <RenameDialog food={renaming} onClose={() => setRenaming(undefined)} onSave={(name) => { renameLoggedFood(renaming, name); setRenaming(undefined); }} />}
    <SavedAdConfirmation visible={!!added} title={added?.title} subject={added?.detail} onContinue={finish} onUndo={undo} onAddAnother={addAnother} />
  </SafeAreaView>;
}

function Option({ icon, title, detail, onPress }: { icon: string; title: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
    <View style={styles.optionIcon}><Text style={styles.optionIconText}>{icon}</Text></View>
    <View style={{ flex: 1 }}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionDetail} numberOfLines={1}>{detail}</Text></View>
    <Chevron size={18} color={colors.textMuted} />
  </Pressable>;
}

function RenameDialog({ food, onClose, onSave }: { food: FoodChoice; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(food.name);
  const valid = name.trim().length > 0 && name.trim() !== food.name;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.dialogShade}><View style={styles.dialog}>
      <Text style={styles.sheetTitle}>Rename food</Text>
      <Text style={styles.dialogHelp}>Updates every time you’ve logged {food.name}{food.foodId ? ', and its library entry' : ''}. Amounts and nutrition stay the same.</Text>
      <TextInput accessibilityLabel="Food name" value={name} onChangeText={setName} autoFocus selectTextOnFocus maxLength={120} style={styles.dialogInput} placeholderTextColor={colors.textDim} />
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid }} disabled={!valid} onPress={() => onSave(name)} style={[styles.logButton, !valid && { opacity: 0.4 }]}><Text style={styles.logText}>Rename</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.dialogCancel}><Text style={styles.methodText}>Cancel</Text></Pressable>
    </View></View>
  </Modal>;
}

function Row({ item, query, onPress, onLongPress }: { item: FoodChoice; query?: string; onPress: () => void; onLongPress?: () => void }) {
  const tag = item.kind === 'meal' ? 'Saved meal' : item.kind === 'food' ? 'Saved food' : 'Recent';
  const amount = item.kind === 'recent' && item.servings !== 1 ? `${fmt(item.servings)} × ` : '';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.calories} calories`} onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
    <View style={{ flex: 1 }}>
      <Highlighted text={item.name} query={query} />
      <Text style={styles.rowMeta} numberOfLines={1}>{amount}{item.servingLabel || '1 serving'}{item.brand ? ` · ${item.brand}` : ''} · {tag}</Text>
    </View>
    <Text style={styles.rowCalories}>{fmt(item.calories)}<Text style={styles.rowUnit}> kcal</Text></Text>
    <Chevron size={18} color={colors.textMuted} />
  </Pressable>;
}

function Highlighted({ text, query }: { text: string; query?: string }) {
  const words = (query ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return <Text style={styles.rowName} numberOfLines={1}>{text.split(/(\s+)/).map((part, index) => {
    const word = words.filter((item) => part.toLowerCase().startsWith(item)).sort((a, b) => b.length - a.length)[0];
    return word ? <Text key={index}><Text style={styles.match}>{part.slice(0, word.length)}</Text>{part.slice(word.length)}</Text> : <Text key={index}>{part}</Text>;
  })}</Text>;
}

type EntryDraft = Parameters<typeof prepareNutritionLogBatch>[0]['entries'][number];

function AmountSheet({ item, date, groups, initialMeal, onClose, onLog }: { item: FoodChoice; date: string; groups: { id: string; name: string }[]; initialMeal?: string; onClose: () => void; onLog: (entry: EntryDraft, mealName: string, another: boolean) => void }) {
  const canWeigh = !!item.servingWeightGrams;
  const [mode, setMode] = useState<'servings' | 'weight'>('servings');
  const [servings, setServings] = useState(fmt(item.servings));
  const [weight, setWeight] = useState(item.servingWeightGrams ? fmt(item.servingWeightGrams * item.servings) : '');
  const [meal, setMeal] = useState(initialMeal);
  const [error, setError] = useState('');
  const multiplier = (() => {
    try { return mode === 'weight' ? servingsForWeight(Number(weight), 'g', item.servingWeightGrams!) : Number(servings) > 0 ? Number(servings) : undefined; } catch { return undefined; }
  })();
  const scaled = multiplier ? scaleNutrients(item.nutrients, multiplier) : undefined;
  const calories = multiplier ? nutritionEntryCalories({ nutrients: item.nutrients, servings: multiplier, statedCalories: item.statedCalories }) : undefined;
  const step = (delta: number) => setServings((current) => fmt(Math.max(0.25, (Number(current) || 0) + delta)));
  const group = groups.find((entry) => entry.id === meal);

  const log = (another: boolean) => {
    if (!multiplier) { setError(mode === 'weight' ? 'Enter how many grams you ate.' : 'Enter how many servings you ate.'); return; }
    if (!group) { setError('Choose a meal.'); return; }
    try {
      onLog({
        id: nutritionId('entry'), eventDate: date, eatenAt: date === today() ? nowClock() : undefined, mealGroupId: group.id, mealLabel: group.name,
        foodId: item.foodId, name: item.name, brand: item.brand, servingLabel: item.servingLabel || '1 serving', servings: multiplier,
        amountMode: mode, consumedAmount: mode === 'weight' ? Number(weight) : undefined, consumedUnit: mode === 'weight' ? 'g' : undefined,
        servingWeightGrams: item.servingWeightGrams, nutrients: item.nutrients, statedCalories: item.statedCalories, source: item.foodId ? 'saved_food' : 'manual',
      }, group.name, another);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the amount.'); }
  };

  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.sheetMeta}>{item.servingLabel || '1 serving'}{item.servingWeightGrams ? ` · ${fmt(item.servingWeightGrams)} g` : ''}{date === today() ? '' : ` · ${isoToUs(date)}`}</Text>

        {canWeigh && <View style={styles.toggle}>{(['servings', 'weight'] as const).map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: mode === option }} onPress={() => setMode(option)} style={[styles.toggleItem, mode === option && styles.toggleOn]}><Text style={[styles.toggleText, mode === option && styles.toggleTextOn]}>{option === 'servings' ? 'Servings' : 'Grams'}</Text></Pressable>)}</View>}
        {mode === 'servings'
          ? <View style={styles.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel="Less" onPress={() => step(-0.5)} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable>
            <TextInput accessibilityLabel="Servings eaten" value={servings} onChangeText={setServings} keyboardType="decimal-pad" selectTextOnFocus style={styles.amountInput} />
            <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => step(0.5)} style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable>
          </View>
          : <View style={styles.stepper}><TextInput accessibilityLabel="Grams eaten" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" selectTextOnFocus style={[styles.amountInput, { flex: 1 }]} /><Text style={styles.unit}>g</Text></View>}

        <View style={styles.preview}>
          <Text style={styles.previewCalories}>{calories === undefined ? '—' : fmt(calories)}<Text style={styles.previewUnit}> kcal</Text></Text>
          <Text style={styles.previewMacros}>{scaled ? `${fmt(scaled.proteinGrams)}g protein · ${fmt(scaled.carbsGrams)}g carbs · ${fmt(scaled.fatGrams)}g fat` : 'Enter an amount'}</Text>
        </View>

        <Text style={styles.label}>Meal</Text>
        <View style={styles.meals}>{groups.map((entry) => <Pressable key={entry.id} accessibilityRole="radio" accessibilityState={{ checked: meal === entry.id }} onPress={() => setMeal(entry.id)} style={[styles.mealChip, meal === entry.id && styles.mealChipOn]}><Text style={[styles.mealChipText, meal === entry.id && styles.mealChipTextOn]}>{entry.name}</Text></Pressable>)}</View>

        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" onPress={() => log(false)} style={styles.logButton}><Text style={styles.logText}>Log{group ? ` to ${group.name}` : ''}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => log(true)} style={styles.anotherButton}><Text style={styles.anotherText}>Log and add another</Text></Pressable>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  searchWrap: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: 14, gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.nutritionNav, backgroundColor: colors.surface, paddingHorizontal: 16 },
  searchInput: { flex: 1, color: colors.text, fontSize: 17, fontFamily: font.medium, paddingVertical: 12 },
  clear: { color: colors.textMuted, fontSize: 24, fontFamily: font.regular, paddingHorizontal: 4 },
  methods: { flexDirection: 'row', gap: 8 },
  method: { flex: 1, minHeight: 42, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  methodText: { color: colors.text, fontSize: 13, fontFamily: font.semibold },
  prompt: { color: colors.textMuted, fontSize: 14, fontFamily: font.medium, marginTop: 6, marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13, marginTop: 9 },
  optionPressed: { borderColor: colors.nutritionNav },
  optionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#211B31', alignItems: 'center', justifyContent: 'center' },
  optionIconText: { color: colors.nutritionNav, fontSize: 18, fontFamily: font.bold },
  optionTitle: { color: colors.text, fontSize: 16, fontFamily: font.bold },
  optionDetail: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  headingHint: { color: colors.textDim, fontSize: 11, fontFamily: font.medium },
  libraryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: colors.nutritionNav, fontSize: 15, fontFamily: font.bold },
  manage: { color: colors.nutritionNav, fontSize: 14, fontFamily: font.bold },
  dialogShade: { flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20 },
  dialogHelp: { color: colors.textMuted, fontSize: 13, lineHeight: 19, fontFamily: font.regular, marginTop: 6 },
  dialogInput: { marginTop: 14, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.nutritionNav, backgroundColor: colors.surfaceRaised, color: colors.text, fontSize: 16, fontFamily: font.medium, paddingHorizontal: 14 },
  dialogCancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  list: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: 6, paddingBottom: 40 },
  heading: { color: colors.textMuted, fontSize: 12, fontFamily: font.bold, letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowPressed: { opacity: 0.7 },
  rowName: { color: colors.text, fontSize: 16, fontFamily: font.semibold },
  match: { color: colors.nutritionNav, fontFamily: font.bold },
  rowMeta: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 3 },
  rowCalories: { color: colors.text, fontSize: 16, fontFamily: font.bold, fontVariant: ['tabular-nums'] },
  rowUnit: { color: colors.textMuted, fontSize: 12, fontFamily: font.medium },
  create: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 },
  createText: { color: colors.nutritionNav, fontSize: 16, fontFamily: font.bold },
  createHint: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 21, fontFamily: font.regular, marginTop: 24 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000A' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.textDim, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: colors.text, fontSize: 22, fontFamily: font.bold },
  sheetMeta: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, marginTop: 4 },
  toggle: { flexDirection: 'row', gap: 8, marginTop: 16 },
  toggleItem: { flex: 1, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { borderColor: colors.nutritionNav, backgroundColor: '#2A2140' },
  toggleText: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold },
  toggleTextOn: { color: colors.nutritionNav },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  stepButton: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 26, fontFamily: font.semibold },
  amountInput: { flex: 1, minHeight: 56, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, color: colors.text, fontSize: 24, fontFamily: font.bold, textAlign: 'center' },
  unit: { color: colors.textMuted, fontSize: 18, fontFamily: font.semibold },
  preview: { marginTop: 16, borderRadius: radius.md, backgroundColor: '#211B31', padding: 14, alignItems: 'center' },
  previewCalories: { color: colors.text, fontSize: 28, fontFamily: font.extrabold, fontVariant: ['tabular-nums'] },
  previewUnit: { color: colors.textMuted, fontSize: 15, fontFamily: font.semibold },
  previewMacros: { color: colors.textMuted, fontSize: 13, fontFamily: font.medium, marginTop: 4 },
  label: { color: colors.textMuted, fontSize: 12, fontFamily: font.bold, letterSpacing: 1, textTransform: 'uppercase', marginTop: 18 },
  meals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  mealChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14, paddingVertical: 9 },
  mealChipOn: { borderColor: colors.nutritionNav, backgroundColor: '#2A2140' },
  mealChipText: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold },
  mealChipTextOn: { color: colors.nutritionNav },
  error: { color: colors.danger, fontSize: 13, fontFamily: font.medium, marginTop: 12 },
  addedBar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: spacing.lg, marginTop: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  addedText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontFamily: font.medium },
  addedUndo: { color: colors.textMuted, fontSize: 14, fontFamily: font.semibold },
  addedDone: { color: colors.nutritionNav, fontSize: 14, fontFamily: font.bold },
  anotherButton: { minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  anotherText: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  logButton: { minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.nutritionNav, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  logText: { color: colors.background, fontSize: 16, fontFamily: font.bold },
});
