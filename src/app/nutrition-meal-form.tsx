import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { nutritionId, savedMealTotals, servingsForWeight } from '@/lib/nutrition';
import { NutritionEntry, SavedFood, SavedMealItem } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing, font } from '@/theme';

type ItemDraft = Omit<SavedMealItem, 'servings' | 'consumedAmount' | 'consumedUnit'> & {
  amount: string;
  unit: 'g' | 'oz';
};

export default function NutritionMealFormScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string; mealGroupId?: string }>();
  const { savedMeals = [], savedFoods = [], nutritionEntries = [], saveNutritionSavedMeal, deleteNutritionSavedMeal } = useTrackers();
  const meal = savedMeals.find((item) => item.id === params.id);
  const sourceEntries = nutritionEntries.filter((entry) => params.date && params.mealGroupId && entry.eventDate === params.date && entry.mealGroupId === params.mealGroupId);
  const [name, setName] = useState(meal?.name ?? '');
  const [note, setNote] = useState(meal?.note ?? '');
  const saving = useRef(false);
  const [items, setItems] = useState<ItemDraft[]>(() => meal ? meal.items.map(fromItem) : sourceEntries.map(fromEntry));
  const totals = useMemo(() => savedMealTotals(items.flatMap((item) => { try { return [toItem(item)]; } catch { return []; } })), [items]);
  const selectedFoodIds = new Set(items.map((item) => item.foodId).filter(Boolean));
  const availableFoods = savedFoods.filter((food) => !selectedFoodIds.has(food.id));

  const update = (id: string, changes: Partial<ItemDraft>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  const addFood = (food: SavedFood) => setItems((current) => [...current, fromFood(food)]);
  const save = () => {
    if (saving.current) return;
    saving.current = true;
    try {
      const savedItems = items.map(toItem);
      saveNutritionSavedMeal({ id: meal?.id, name, note, items: savedItems }, meal?.id ?? nutritionId('meal'));
      router.back();
    } catch (error) {
      saving.current = false;
      Alert.alert('Check saved meal', message(error));
    }
  };
  const remove = () => Alert.alert(`Delete ${meal?.name}?`, 'This removes only the reusable meal. Previously logged foods and the saved foods inside it will remain.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { deleteNutritionSavedMeal(meal!.id, true); router.back(); } },
  ]);

  return <SafeAreaView style={styles.safe} edges={['bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>MEAL LIBRARY</Text><Text style={styles.title}>{meal ? 'Edit saved meal' : 'Create saved meal'}</Text>
    <Text style={styles.help}>Save several foods and their usual amounts as one reusable meal. Logging it later still creates separate, editable food entries.</Text>
    <Field label="MEAL NAME" value={name} onChange={setName} placeholder="Fiber Oatmeal Breakfast" />
    <Field label="NOTE · OPTIONAL" value={note} onChange={setNote} placeholder="Usual weekday breakfast" />
    <View style={styles.total}><Text style={styles.totalLabel}>CURRENT MEAL TOTAL</Text><Text style={styles.totalValue}>{format(totals.calories)} kcal</Text><Text style={styles.totalMacros}>{format(totals.carbsGrams)}C · {format(totals.proteinGrams)}P · {format(totals.fatGrams)}F · {format(totals.fiberGrams)} fiber</Text></View>

    <Text style={styles.sectionTitle}>Foods in this meal</Text>
    {items.map((item) => <View key={item.id} style={styles.selectedCard}>
      <View style={styles.row}><View style={styles.flex}><Text style={styles.foodName}>{item.name}</Text><Text style={styles.foodMeta}>{item.brand ? `${item.brand} · ` : ''}{item.servingLabel}</Text></View><Pressable onPress={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}><Text style={styles.removeText}>Remove</Text></Pressable></View>
      {item.servingWeightGrams ? <View style={styles.modeRow}><Mode label="Weight" active={item.amountMode === 'weight'} onPress={() => update(item.id, { amountMode: 'weight', amount: String(item.servingWeightGrams) })} /><Mode label="Servings" active={item.amountMode === 'servings'} onPress={() => update(item.id, { amountMode: 'servings', amount: '1' })} /></View> : null}
      <View style={styles.amountRow}><View style={styles.flex}><Text style={styles.amountLabel}>{item.amountMode === 'weight' ? `AMOUNT EATEN · ${item.unit.toUpperCase()}` : 'SERVINGS'}</Text><TextInput value={item.amount} onChangeText={(amount) => update(item.id, { amount })} keyboardType="decimal-pad" placeholderTextColor={colors.textDim} style={styles.amountInput} /></View>{item.amountMode === 'weight' && <View style={styles.units}><Mode label="g" active={item.unit === 'g'} onPress={() => update(item.id, { unit: 'g' })} compact /><Mode label="oz" active={item.unit === 'oz'} onPress={() => update(item.id, { unit: 'oz' })} compact /></View>}</View>
    </View>)}
    {!items.length && <Text style={styles.empty}>Choose at least one saved food below.</Text>}

    <Text style={styles.sectionTitle}>Add saved foods</Text>
    {availableFoods.map((food) => <Pressable key={food.id} onPress={() => addFood(food)} style={styles.availableRow}><View style={styles.flex}><Text style={styles.foodName}>{food.name}</Text><Text style={styles.foodMeta}>{food.brand ? `${food.brand} · ` : ''}{food.servingLabel}</Text></View><Text style={styles.addText}>+ Add</Text></Pressable>)}
    {!availableFoods.length && <Text style={styles.empty}>{savedFoods.length ? 'Every saved food is already included.' : 'Save individual foods first, or create this meal from foods already logged today.'}</Text>}
    <Pressable onPress={save} style={styles.primary}><Text style={styles.primaryText}>Save meal</Text></Pressable>
    {meal && <Pressable onPress={remove} style={styles.delete}><Text style={styles.deleteText}>Delete saved meal</Text></Pressable>}
  </KeyboardSafeScrollView></SafeAreaView>;
}

function fromFood(food: SavedFood): ItemDraft {
  const weighted = Boolean(food.servingWeightGrams);
  return { id: nutritionId('meal-item'), foodId: food.id, name: food.name, brand: food.brand, servingLabel: food.servingLabel, servingWeightGrams: food.servingWeightGrams, nutrients: { ...food.nutrients }, statedCalories: food.statedCalories, amountMode: weighted ? 'weight' : 'servings', amount: weighted ? String(food.servingWeightGrams) : '1', unit: 'g' };
}
function fromItem(item: SavedMealItem): ItemDraft { return { ...item, nutrients: { ...item.nutrients }, amount: String(item.amountMode === 'weight' ? item.consumedAmount : item.servings), unit: item.consumedUnit ?? 'g' }; }
function fromEntry(entry: NutritionEntry): ItemDraft { return { id: nutritionId('meal-item'), foodId: entry.foodId, name: entry.name, brand: entry.brand, servingLabel: entry.servingLabel, servingWeightGrams: entry.servingWeightGrams, nutrients: { ...entry.nutrients }, statedCalories: entry.statedCalories, amountMode: entry.amountMode ?? 'servings', amount: String(entry.amountMode === 'weight' ? entry.consumedAmount : entry.servings), unit: entry.consumedUnit ?? 'g' }; }
function toItem(draft: ItemDraft): SavedMealItem {
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${draft.name} needs an amount greater than zero.`);
  const servings = draft.amountMode === 'weight' ? servingsForWeight(amount, draft.unit, draft.servingWeightGrams ?? 0) : amount;
  return { id: draft.id, foodId: draft.foodId, name: draft.name, brand: draft.brand, servingLabel: draft.servingLabel, servingWeightGrams: draft.servingWeightGrams, nutrients: { ...draft.nutrients }, statedCalories: draft.statedCalories, amountMode: draft.amountMode, servings, consumedAmount: draft.amountMode === 'weight' ? amount : undefined, consumedUnit: draft.amountMode === 'weight' ? draft.unit : undefined };
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <View><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textDim} style={styles.input} /></View>; }
function Mode({ label, active, onPress, compact }: { label: string; active: boolean; onPress: () => void; compact?: boolean }) { return <Pressable onPress={onPress} style={[styles.mode, compact && styles.modeCompact, active && styles.modeActive]}><Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text></Pressable>; }
const message = (error: unknown) => error instanceof Error ? error.message : 'Nothing was changed.';
const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg }, eyebrow: { color: colors.nutritionNav, fontSize: 11, fontFamily: font.bold, letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 31, fontFamily: font.bold, marginTop: 7 }, help: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginTop: 7 }, label: { color: colors.textDim, fontSize: 11, fontFamily: font.bold, letterSpacing: .7, marginTop: 14, marginBottom: 5 }, input: { minHeight: 47, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, color: colors.text, paddingHorizontal: 13 }, total: { backgroundColor: '#211B31', borderRadius: 15, padding: 14, marginTop: 17 }, totalLabel: { color: colors.nutritionNav, fontSize: 11, fontFamily: font.bold }, totalValue: { color: colors.text, fontSize: 24, fontFamily: font.bold, marginTop: 4 }, totalMacros: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 4 }, sectionTitle: { color: colors.text, fontSize: 17, fontFamily: font.bold, marginTop: 20, marginBottom: 8 }, selectedCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, flex: { flex: 1 }, foodName: { color: colors.text, fontSize: 13, fontFamily: font.bold }, foodMeta: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, marginTop: 3 }, removeText: { color: colors.danger, fontSize: 11, fontFamily: font.semibold }, modeRow: { flexDirection: 'row', gap: 7, marginTop: 11 }, mode: { flex: 1, minHeight: 38, borderColor: colors.border, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, modeCompact: { flex: 0, width: 45 }, modeActive: { backgroundColor: '#2A2140', borderColor: colors.nutritionNav }, modeText: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold }, modeTextActive: { color: colors.nutritionNav }, amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 9 }, amountLabel: { color: colors.textDim, fontSize: 11, fontFamily: font.bold, marginBottom: 4 }, amountInput: { minHeight: 42, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 11, color: colors.text, paddingHorizontal: 11 }, units: { flexDirection: 'row', gap: 5 }, empty: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 16, textAlign: 'center', paddingVertical: 15 }, availableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 7 }, addText: { color: colors.nutritionNav, fontSize: 11, fontFamily: font.bold }, primary: { backgroundColor: colors.nutritionNav, borderRadius: 14, alignItems: 'center', paddingVertical: 15, marginTop: 18 }, primaryText: { color: colors.background, fontSize: 11, fontFamily: font.bold }, delete: { alignItems: 'center', paddingVertical: 15, marginTop: 12 }, deleteText: { color: colors.danger, fontSize: 11, fontFamily: font.semibold },
});
