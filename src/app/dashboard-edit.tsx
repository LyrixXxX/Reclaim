import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DASHBOARD_WIDGETS, dashboardWidgetAllowed, defaultDashboard, moveDashboardWidget, normalizeDashboard } from '@/lib/dashboard';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { templateConfig } from '@/lib/good-habit-templates';
import { DashboardWidget, DashboardWidgetId } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout } from '@/theme';

export default function DashboardEditor() {
  const { preferences = DEFAULT_PREFERENCES, trackers, labTrackers = [], saveDashboard, setHomeHabitVisible, setQuittingTaperingOnHome } = useTrackers();
  const [draft, setDraft] = useState(() => normalizeDashboard(preferences.dashboard));
  const [hiddenHabits, setHiddenHabits] = useState<string[]>(preferences.hiddenHomeHabitIds ?? []);
  const [showQuittingTapering, setShowQuittingTapering] = useState(preferences.showQuittingTaperingOnHome !== false);
  const [dragging, setDragging] = useState(false);
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.max(112, Math.ceil(112 * fontScale));
  const insets = useSafeAreaInsets();
  const move = useCallback((id: DashboardWidgetId, delta: number) => {
    setDraft((current) => moveDashboardWidget(current, id, current.findIndex((item) => item.id === id) + delta));
  }, []);
  const update = (id: DashboardWidgetId, patch: Partial<DashboardWidget>) => setDraft((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const exit = () => router.replace('/');
  return <ScrollView style={styles.safe} scrollEnabled={!dragging} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
    <Text style={styles.title}>Edit Home</Text>
    <Text style={styles.body}>Choose which active habits appear in your daily goals or weekly cards. Hiding one here never stops its tracking.</Text>
    <Text style={styles.section}>Good habits</Text>
    {trackers.filter((item) => !item.archived && (item.habitTemplate === 'water' || templateConfig(item.habitTemplate))).map((item) => <View key={item.id} style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.flexText}>{item.displayName || item.name}</Text><Text style={styles.status}>{templateConfig(item.habitTemplate)?.period === 'week' ? 'Weekly card' : 'Daily goal'}</Text></View><Switch accessibilityLabel={`Show ${item.displayName || item.name} on Home`} value={!hiddenHabits.includes(item.id)} onValueChange={(visible) => setHiddenHabits((current) => visible ? current.filter((id) => id !== item.id) : [...current, item.id])} /></View>)}
    <Text style={styles.section}>Quitting &amp; Tapering</Text>
    <View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.flexText}>Show on Home</Text><Text style={styles.status}>Show active items and their current timeframes. Tracking stays unchanged if hidden.</Text></View><Switch accessibilityLabel="Show Quitting and Tapering on Home" value={showQuittingTapering} onValueChange={setShowQuittingTapering} /></View>
    <Text style={styles.section}>Weight card</Text>
    <Text style={styles.help}>You can hide the Weight card or choose how much detail it shows. Nothing here deletes your weigh-ins or your saved layout choices for other sections.</Text>
    <View style={styles.orderList}>
      {draft.filter((widget) => widget.id === 'weight').map((widget) => <OrderRow key={widget.id} widget={widget} index={0} count={1} height={rowHeight} blocked={!dashboardWidgetAllowed(widget.id, preferences)} move={move} onDragging={setDragging} onVisible={(visible) => update(widget.id, { visible })} />)}
    </View>
    <Text style={styles.section}>Widget details</Text>
    {draft.filter((widget) => widget.id === 'weight' && widget.visible && dashboardWidgetAllowed(widget.id, preferences)).map((widget) => {
      const options = widget.id === 'labs' ? labTrackers.map((item) => ({ id: item.id, name: item.name })) : widget.id === 'habits' ? trackers.filter((item) => !item.archived).map((item) => ({ id: item.id, name: item.displayName || item.name })) : [];
      return <View key={widget.id} style={styles.card}>
        <Text style={styles.cardTitle}>{DASHBOARD_WIDGETS.find((item) => item.id === widget.id)!.title}</Text>
        <Text style={styles.help}>{DASHBOARD_WIDGETS.find((item) => item.id === widget.id)!.description}</Text>
        <View style={styles.switchRow}><Text style={styles.flexText}>Expanded details</Text><Switch accessibilityLabel={`Expanded ${widget.id} details`} value={widget.expanded} onValueChange={(expanded) => update(widget.id, { expanded })} /></View>
        <Text style={styles.help}>{widget.expanded ? 'Show summary, details, and available mini-trend.' : 'Show summary and date only.'}</Text>
        {(widget.id === 'labs' || widget.id === 'habits') && <>
          <Text style={styles.help}>Choose what appears. Home previews up to three selected items; the full section keeps every record.</Text>
          <View style={styles.switchRow}><Text style={styles.flexText}>Include all (and future items)</Text><Switch accessibilityLabel={`Include all ${widget.id}`} value={widget.selectedIds === undefined} onValueChange={(all) => update(widget.id, { selectedIds: all ? undefined : [] })} /></View>
          {widget.selectedIds !== undefined && options.map((option) => <View key={option.id} style={styles.switchRow}><Text style={styles.flexText}>{option.name}</Text><Switch accessibilityLabel={`Show ${option.name}`} value={widget.selectedIds!.includes(option.id)} onValueChange={(checked) => update(widget.id, { selectedIds: checked ? [...widget.selectedIds!, option.id] : widget.selectedIds!.filter((id) => id !== option.id) })} /></View>)}
          {!options.length && <Text style={styles.help}>No eligible items yet. Add them in the section first.</Text>}
        </>}
      </View>;
    })}
    <Pressable accessibilityRole="button" onPress={() => { for (const item of trackers) if ((preferences.hiddenHomeHabitIds ?? []).includes(item.id) !== hiddenHabits.includes(item.id)) setHomeHabitVisible(item.id, !hiddenHabits.includes(item.id)); if ((preferences.showQuittingTaperingOnHome !== false) !== showQuittingTapering) setQuittingTaperingOnHome(showQuittingTapering); saveDashboard(draft); exit(); }} style={styles.save}><Text style={styles.saveText}>Save dashboard</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={exit} style={styles.secondary}><Text style={styles.buttonText}>Cancel</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => Alert.alert('Restore Weight card default?', 'This resets only the Weight card draft. No other saved widgets or health records will change. Tap Save dashboard to apply it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Restore card', onPress: () => setDraft((current) => current.map((item) => item.id === 'weight' ? defaultDashboard().find((candidate) => candidate.id === 'weight')! : item)) }])} style={styles.secondary}><Text style={styles.buttonText}>Restore Weight card default</Text></Pressable>
  </ScrollView>;
}

function OrderRow({ widget, index, count, height, blocked, move, onDragging, onVisible }: {
  widget: DashboardWidget; index: number; count: number; height: number; blocked: boolean;
  move: (id: DashboardWidgetId, delta: number) => void; onDragging: (dragging: boolean) => void; onVisible: (visible: boolean) => void;
}) {
  const [translation, setTranslation] = useState(0);
  const [active, setActive] = useState(false);
  const title = DASHBOARD_WIDGETS.find((item) => item.id === widget.id)!.title;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { setActive(true); onDragging(true); },
    onPanResponderMove: (_, gesture) => setTranslation(Math.max(-index * height, Math.min((count - index - 1) * height, gesture.dy))),
    onPanResponderRelease: (_, gesture) => { setTranslation(0); setActive(false); onDragging(false); move(widget.id, Math.round(gesture.dy / height)); },
    onPanResponderTerminate: () => { setTranslation(0); setActive(false); onDragging(false); },
    onPanResponderTerminationRequest: () => true,
  }), [index, count, height, widget.id, move, onDragging]);
  return <View style={[styles.orderRow, { height, transform: [{ translateY: translation }], zIndex: active ? 10 : 0 }, active && styles.dragging]}>
    <View style={styles.rowTop}><Text style={styles.cardTitle}>{index + 1}. {title}</Text><Switch accessibilityLabel={`Show ${title} on Home`} value={widget.visible} onValueChange={onVisible} /></View>
    <View style={styles.rowBottom}>
      <Text style={styles.status}>{blocked ? 'Hidden in Settings' : widget.visible ? 'On Home' : 'Hidden on Home'}</Text>
      {count > 1 && <><View {...responder.panHandlers} accessible accessibilityLabel={`Drag ${title}; move buttons also available`} style={styles.handle}><Text style={styles.handleText}>⠿</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Move ${title} up`} disabled={index === 0} onPress={() => move(widget.id, -1)} style={[styles.arrow, index === 0 && styles.disabled]}><Text style={styles.buttonText}>↑</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Move ${title} down`} disabled={index === count - 1} onPress={() => move(widget.id, 1)} style={[styles.arrow, index === count - 1 && styles.disabled]}><Text style={styles.buttonText}>↓</Text></Pressable></>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: 20 }, title: { color: colors.text, fontSize: 28, fontWeight: '900' }, body: { color: colors.textMuted, fontSize: 14, lineHeight: 22, marginTop: 10 }, help: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 }, orderList: { marginTop: 20 },
  orderRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'space-evenly' }, dragging: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised, elevation: 8 }, rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 4 }, cardTitle: { flexShrink: 1, color: colors.text, fontSize: 16, fontWeight: '800' }, status: { flex: 1, color: colors.textMuted, fontSize: 12 }, handle: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, handleText: { color: colors.accent, fontSize: 28 }, arrow: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 12 }, buttonText: { color: colors.text, fontSize: 15, fontWeight: '700' }, disabled: { opacity: .3 },
  section: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 24, marginBottom: 12 }, card: { padding: 16, borderColor: colors.border, borderWidth: 1, borderRadius: 18, backgroundColor: colors.surface, marginBottom: 12 }, switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12 }, flexText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 }, save: { backgroundColor: colors.accent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, saveText: { color: colors.background, fontSize: 15, fontWeight: '800' }, secondary: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
});
