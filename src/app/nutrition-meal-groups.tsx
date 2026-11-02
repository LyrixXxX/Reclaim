import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { nutritionId, upsertMealGroup } from '@/lib/nutrition';
import { NutritionMealGroup } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function NutritionMealGroupsScreen() {
  const { nutritionMealGroups = [], nutritionEntries = [], saveNutritionMealGroup, deleteNutritionMealGroup } = useTrackers();
  const [newMeal, setNewMeal] = useState('');
  const groups = useMemo(() => [...nutritionMealGroups].sort((a, b) => a.sortOrder - b.sortOrder), [nutritionMealGroups]);
  const activeGroups = groups.filter((group) => !group.archived);
  const addGroup = () => {
    try {
      const nextOrder = Math.max(-1, ...groups.map((group) => group.sortOrder)) + 1;
      const group = { id: nutritionId('meal'), name: newMeal, sortOrder: nextOrder, builtIn: false, archived: false };
      upsertMealGroup(groups, group);
      saveNutritionMealGroup(group);
      setNewMeal('');
    } catch (error) { Alert.alert('Could not add meal group', message(error)); }
  };
  const move = (group: NutritionMealGroup, direction: -1 | 1) => {
    const index = activeGroups.findIndex((item) => item.id === group.id);
    const other = activeGroups[index + direction];
    if (!other) return;
    saveNutritionMealGroup({ ...group, sortOrder: other.sortOrder });
    saveNutritionMealGroup({ ...other, sortOrder: group.sortOrder });
  };
  const confirmDelete = (group: NutritionMealGroup) => Alert.alert(
    `Delete ${group.name}?`,
    'This unused meal group will be removed. Saved foods and meals will not be deleted.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete group', style: 'destructive', onPress: () => deleteNutritionMealGroup(group.id) }],
  );
  return <SafeAreaView style={styles.safe} edges={['bottom']}><KeyboardSafeScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>NUTRITION</Text><Text style={styles.title}>Edit meal groups</Text>
    <Text style={styles.help}>Rename and arrange your meal categories. Delete unused custom groups, or archive groups with food history to keep earlier logs intact.</Text>
    <View style={styles.addRow}><TextInput accessibilityLabel="New meal group name" value={newMeal} onChangeText={setNewMeal} placeholder="Custom meal group" placeholderTextColor={colors.textDim} style={[styles.input, styles.flex]} /><Pressable accessibilityRole="button" onPress={addGroup} style={styles.add}><Text style={styles.addText}>Add</Text></Pressable></View>
    <View style={styles.card}>{groups.map((group) => {
      const activeIndex = activeGroups.findIndex((item) => item.id === group.id);
      const hasHistory = nutritionEntries.some((entry) => entry.mealGroupId === group.id);
      return <View key={group.id} style={styles.groupRow}><View style={styles.flex}>{group.builtIn ? <Text style={styles.rowTitle}>{group.name}</Text> : <TextInput accessibilityLabel={`Rename ${group.name}`} defaultValue={group.name} onEndEditing={(event) => { try { const renamed = { ...group, name: event.nativeEvent.text }; upsertMealGroup(groups, renamed); saveNutritionMealGroup(renamed); } catch (error) { Alert.alert('Could not rename', message(error)); } }} style={styles.groupInput} />}<Text style={styles.rowMeta}>{group.archived ? 'Archived · history preserved' : group.builtIn ? 'Standard group' : hasHistory ? 'Custom group · has food history' : 'Custom group · unused'}</Text></View>{!group.archived && <><Pressable accessibilityRole="button" accessibilityLabel={`Move ${group.name} up`} disabled={activeIndex === 0} onPress={() => move(group, -1)}><Text style={styles.move}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Move ${group.name} down`} disabled={activeIndex === activeGroups.length - 1} onPress={() => move(group, 1)}><Text style={styles.move}>↓</Text></Pressable></>}{!group.builtIn && <Pressable accessibilityRole="button" accessibilityLabel={`${group.archived ? 'Restore' : 'Archive'} ${group.name}`} onPress={() => saveNutritionMealGroup({ ...group, archived: !group.archived })}><Text style={styles.archive}>{group.archived ? 'Restore' : 'Archive'}</Text></Pressable>}{!group.builtIn && !hasHistory && <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${group.name}`} onPress={() => confirmDelete(group)}><Text style={styles.delete}>Delete</Text></Pressable>}</View>;
    })}</View>
  </KeyboardSafeScrollView></SafeAreaView>;
}

const message = (error: unknown) => error instanceof Error ? error.message : 'Nothing was changed.';
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: 18 },
  eyebrow: { color: colors.nutritionNav, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 }, title: { color: colors.text, fontSize: 30, fontWeight: '700', marginTop: 8 }, help: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 10 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 20, marginBottom: 14 }, input: { minHeight: 48, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, color: colors.text }, flex: { flex: 1 }, add: { minWidth: 70, minHeight: 48, borderRadius: 13, backgroundColor: colors.nutritionNav, alignItems: 'center', justifyContent: 'center' }, addText: { color: colors.background, fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }, groupRow: { minHeight: 68, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, borderBottomColor: colors.border, borderBottomWidth: 1 }, rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 4 }, groupInput: { color: colors.text, fontSize: 14, fontWeight: '700', paddingVertical: 4 }, move: { color: colors.nutritionNav, fontSize: 22, padding: 5 }, archive: { color: colors.nutritionNav, fontSize: 11, fontWeight: '600', padding: 5 }, delete: { color: colors.danger, fontSize: 11, fontWeight: '600', padding: 5 },
});
