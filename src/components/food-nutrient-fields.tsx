import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FOOD_EXTRA_NUTRIENT_IDS, nutrientDefinition } from '@/lib/nutrient-catalog';
import { colors, font } from '@/theme';

export function FoodNutrientFields({ values, onChange, fiber, onFiberChange }: { values: Record<string, string>; onChange: (next: Record<string, string>) => void; fiber?: string; onFiberChange?: (value: string) => void }) {
  return <View style={styles.root}><Text style={styles.title}>Additional food details · optional</Text><Text style={styles.help}>Use values from the food label when available. Leave a field blank if it isn’t on the label; it counts as 0.</Text>
    {onFiberChange && <View style={styles.field}><Text style={styles.label}>Fiber · g</Text><TextInput accessibilityLabel="Fiber in g" value={fiber ?? ''} onChangeText={onFiberChange} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textDim} style={styles.input} /></View>}
    {FOOD_EXTRA_NUTRIENT_IDS.map((id) => { const definition = nutrientDefinition(id)!; return <View key={id} style={styles.field}><Text style={styles.label}>{definition.name} · {definition.unit}</Text><TextInput accessibilityLabel={`${definition.name} in ${definition.unit}`} value={values[id] ?? ''} onChangeText={(value) => onChange({ ...values, [id]: value })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textDim} style={styles.input} /></View>; })}
  </View>;
}

export function parseFoodExtraNutrients(values: Record<string, string>) {
  const result: Record<string, number> = {};
  for (const id of FOOD_EXTRA_NUTRIENT_IDS) {
    const raw = values[id];
    if (raw === undefined || !raw.trim()) continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Enter a valid value for ${nutrientDefinition(id)!.name}.`);
    result[id] = amount;
  }
  return result;
}

const styles = StyleSheet.create({ root: { marginTop: 18 }, title: { color: colors.text, fontSize: 16, fontFamily: font.bold }, help: { color: colors.textMuted, fontSize: 11, fontFamily: font.regular, lineHeight: 16, marginVertical: 7 }, field: { marginTop: 10 }, label: { color: colors.textMuted, fontSize: 11, fontFamily: font.semibold, marginBottom: 5 }, input: { minHeight: 46, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, color: colors.text, paddingHorizontal: 12 } });
