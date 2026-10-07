import { HistoryPages } from '@/components/history-pages';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CpapSettingsModal } from '@/components/cpap-settings-modal';
import { CpapTherapySettings } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function CpapSettingsScreen() {
  const { cpapTherapySettings = [], saveCpapTherapySettings, deleteCpapTherapySettings } = useTrackers();
  const [editing, setEditing] = useState<CpapTherapySettings | null | undefined>();
  const ordered = [...cpapTherapySettings].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || (b.effectiveTime ?? '').localeCompare(a.effectiveTime ?? ''));
  const remove = (item: CpapTherapySettings) => Alert.alert('Delete this settings entry?', 'The machine readings remain saved. Pressure chart boundaries will be recalculated from the remaining settings timeline.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteCpapTherapySettings(item.id, true) }]);
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.eyebrow}>DEVICE HISTORY</Text><Text style={styles.title}>Therapy settings</Text><Text style={styles.subtitle}>Keep a dated record of the settings shown on your machine. These values appear as reference lines on pressure charts and in the doctor report.</Text>
    <Pressable onPress={() => setEditing(null)} style={styles.add}><Text style={styles.addText}>+ Add settings change</Text></Pressable>
    {!ordered.length && <View style={styles.empty}><Text style={styles.emptyTitle}>No settings recorded</Text><Text style={styles.emptyText}>Add the date and values shown on the machine. Leave the time blank if you do not know it.</Text></View>}
    <HistoryPages items={ordered}>{(page) => page.map((item) => <View key={item.id} style={styles.card}>
      <View style={styles.row}><View style={styles.body}><Text style={styles.current}>{ordered.indexOf(item) === 0 ? 'CURRENT SETTINGS' : 'PREVIOUS SETTINGS'}</Text><Text style={styles.date}>{formatEffective(item)}</Text><Text style={styles.pressure}>{formatNumber(item.minPressure)}–{formatNumber(item.maxPressure)} cmH₂O</Text><Text style={styles.meta}>{item.mode}{item.maskName ? ` · ${item.maskName}` : ''}</Text></View><View><Pressable onPress={() => setEditing(item)}><Text style={styles.edit}>Edit</Text></Pressable><Pressable onPress={() => remove(item)}><Text style={styles.delete}>Delete</Text></Pressable></View></View>
      {(item.rampStartPressure !== undefined || item.rampMinutes !== undefined || item.exhalationRelief || item.humidity || item.heatedTubeTemperature) && <Text style={styles.details}>{formatDetails(item)}</Text>}
      {item.note && <Text style={styles.note}>{item.note}</Text>}
    </View>)}</HistoryPages>
    <Text style={styles.disclaimer}>Reclaim stores and displays the values you enter. It does not evaluate the settings or recommend changes.</Text>
  </ScrollView><CpapSettingsModal key={editing === undefined ? 'closed' : editing?.id ?? 'new'} visible={editing !== undefined} setting={editing} onClose={() => setEditing(undefined)} onSave={saveCpapTherapySettings} /></SafeAreaView>;
}

function formatEffective(item: CpapTherapySettings) { const date = new Date(`${item.effectiveDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); return item.effectiveTime ? `${date} at ${formatTime(item.effectiveTime)}` : date; }
function formatTime(value: string) { const [rawHour, minute] = value.split(':').map(Number); return `${rawHour % 12 || 12}:${String(minute).padStart(2, '0')} ${rawHour >= 12 ? 'PM' : 'AM'}`; }
function formatNumber(value: number) { return Number.isInteger(value) ? `${value}` : `${Math.round(value * 10) / 10}`; }
function formatDetails(item: CpapTherapySettings) { return [`Ramp${item.rampStartPressure !== undefined ? ` ${formatNumber(item.rampStartPressure)} cmH₂O` : ''}${item.rampMinutes !== undefined ? ` / ${item.rampMinutes} min` : ''}`, item.exhalationRelief && `Reslex ${item.exhalationRelief}`, item.humidity && `Humidity ${item.humidity}`, item.heatedTubeTemperature && `Tube ${item.heatedTubeTemperature}`].filter(Boolean).join(' · '); }

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 80 }, eyebrow: { color: colors.cpapNav, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 6 }, subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 7 }, add: { minHeight: 49, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cpapNav, borderRadius: 14, marginTop: 20 }, addText: { color: colors.background, fontSize: 12, fontWeight: '900' }, empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 18, padding: 20, marginTop: 16 }, emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, emptyText: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 5 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, marginTop: 12 }, row: { flexDirection: 'row' }, body: { flex: 1 }, current: { color: colors.cpapNav, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, date: { color: colors.textMuted, fontSize: 11, marginTop: 5 }, pressure: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 7 }, meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 }, details: { color: colors.textMuted, fontSize: 10, lineHeight: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 11 }, note: { color: colors.textDim, fontSize: 10, lineHeight: 16, marginTop: 8 }, edit: { color: colors.cpapNav, fontSize: 10, fontWeight: '800', padding: 6 }, delete: { color: colors.danger, fontSize: 9, fontWeight: '700', padding: 6, marginTop: 4 }, disclaimer: { color: colors.textDim, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 24 } });
