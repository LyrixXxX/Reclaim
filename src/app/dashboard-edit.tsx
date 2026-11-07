import { Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron } from '@/components/icon';
import { DASHBOARD_WIDGETS, dashboardWidgetAllowed, normalizeDashboard } from '@/lib/dashboard';
import { HOME_CARDS, hiddenCardsLast, HomeCardId, moveHomeCard, normalizeHiddenHomeCards, normalizeHomeCardOrder, reorderForVisibility } from '@/lib/home-cards';
import { quittingStarts } from '@/lib/quit-progress';
import { DEFAULT_PREFERENCES, homeColorGoals } from '@/lib/preferences';
import { HOME_GOAL_COLOR_NAMES, HOME_GOAL_COLORS, homeGoalColor } from '@/lib/home-goal-colors';
import { templateConfig } from '@/lib/good-habit-templates';
import { DashboardWidget, DashboardWidgetId } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, font } from '@/theme';

export default function DashboardEditor() {
  const { preferences = DEFAULT_PREFERENCES, trackers, stepGoals = [], nutritionGoals = [], labTrackers = [], saveDashboard, setHomeHabitVisible, setHomeGoalColors, setBadgesOnHome, setHomeCards, setQuittingTaperingOnHome, setTrainingOverviewOnHome, taperSteps = [] } = useTrackers();
  const [draft, setDraft] = useState(() => normalizeDashboard(preferences.dashboard));
  const [hiddenHabits, setHiddenHabits] = useState<string[]>(preferences.hiddenHomeHabitIds ?? []);
  const [goalColors, setGoalColors] = useState<Record<string, string>>(preferences.homeGoalColors ?? {});
  // The older on/off settings still count, so anything already hidden shows as hidden here.
  const [hiddenCards, setHiddenCards] = useState<HomeCardId[]>(() => [...new Set<HomeCardId>([
    ...normalizeHiddenHomeCards(preferences.hiddenHomeCards),
    ...(preferences.showQuittingTaperingOnHome === false ? ['quit', 'journey'] as const : []),
    ...(preferences.showTrainingOverviewOnHome === false ? ['training'] as const : []),
    ...(preferences.showBadgesOnHome === false ? ['badge'] as const : []),
    ...(normalizeDashboard(preferences.dashboard).find((item) => item.id === 'weight')?.visible === false ? ['weight'] as const : []),
  ])]);
  const [cardOrder, setCardOrder] = useState(() => hiddenCardsLast(normalizeHomeCardOrder(preferences.homeCardOrder), hiddenCards));
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.max(64, Math.ceil(64 * fontScale));
  const insets = useSafeAreaInsets();
  const update = (id: DashboardWidgetId, patch: Partial<DashboardWidget>) => setDraft((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const activeHabits = trackers.filter((item) => !item.archived && (item.habitTemplate === 'water' || templateConfig(item.habitTemplate)));
  const colorGoals = [
    ...(preferences.visibleSections.activity && stepGoals.length ? [{ id: 'steps', title: 'Steps', fallback: colors.activityNav }] : []),
    ...(preferences.visibleSections.nutrition && nutritionGoals.length ? [{ id: 'nutrition', title: 'Nutrition', fallback: colors.nutritionNav }] : []),
    ...activeHabits.filter((item) => !hiddenHabits.includes(item.id)).map((item) => ({ id: item.id, title: item.displayName || item.name, fallback: colors.habitsNav })),
  ];
  const colorsInUse = (goalId: string) => new Set(homeColorGoals({ trackers, stepGoals, nutritionGoals }).filter((goal) => goal.id !== goalId).map((goal) => goalColors[goal.id]));
  const exit = () => router.replace('/' as Href);
  const sections = preferences.visibleSections;
  const hasQuits = quittingStarts(trackers, taperSteps).length > 0;
  const cardAvailable: Record<HomeCardId, boolean> = {
    quit: sections.goals && hasQuits,
    weather: !!sections.routes,
    progress: true,
    nutrition: sections.nutrition && nutritionGoals.length > 0,
    badge: sections.goals,
    training: !!sections.workouts,
    mindfulness: activeHabits.some((item) => item.habitTemplate === 'mindfulness'),
    weekly: activeHabits.some((item) => templateConfig(item.habitTemplate)?.period === 'week'),
    journey: sections.goals && hasQuits,
    weight: dashboardWidgetAllowed('weight', preferences),
  };
  const shownOrder = cardOrder.filter((id) => cardAvailable[id]);
  const onHome = shownOrder.filter((id) => !hiddenCards.includes(id));
  const moveCard = (id: HomeCardId, delta: number) => setCardOrder((current) => moveHomeCard(current, id, delta, onHome));
  const setCardVisible = (id: HomeCardId, visible: boolean) => {
    setCardOrder((current) => reorderForVisibility(current, hiddenCards, id, visible));
    setHiddenCards((current) => visible ? current.filter((item) => item !== id) : [...current, id]);
  };
  const save = () => {
    for (const item of trackers) if ((preferences.hiddenHomeHabitIds ?? []).includes(item.id) !== hiddenHabits.includes(item.id)) setHomeHabitVisible(item.id, !hiddenHabits.includes(item.id));
    const showQuitting = !(hiddenCards.includes('quit') && hiddenCards.includes('journey'));
    if ((preferences.showQuittingTaperingOnHome !== false) !== showQuitting) setQuittingTaperingOnHome(showQuitting);
    if ((preferences.showTrainingOverviewOnHome !== false) === hiddenCards.includes('training')) setTrainingOverviewOnHome(!hiddenCards.includes('training'));
    if ((preferences.showBadgesOnHome !== false) === hiddenCards.includes('badge')) setBadgesOnHome(!hiddenCards.includes('badge'));
    setHomeGoalColors(goalColors);
    saveDashboard(draft.map((item) => item.id === 'weight' ? { ...item, visible: !hiddenCards.includes('weight') } : item));
    setHomeCards(cardOrder, hiddenCards);
    exit();
  };
  return <ScrollView style={styles.safe} scrollEnabled={!dragging} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
    <Text style={styles.body}>Put your cards in any order, and choose what shows on Home. Hiding something never stops its tracking.</Text>
    <Text style={styles.section}>Home cards</Text>
    <Text style={styles.help}>Drag the handle, or use the arrows. The top of this list is the top of Home, and cards you turn off move to the bottom.</Text>
    <View style={styles.orderList}>
      {shownOrder.map((id, index) => <OrderRow key={id} id={id} index={index} count={onHome.length} height={rowHeight} hidden={hiddenCards.includes(id)} move={moveCard} onDragging={setDragging} onVisible={(visible) => setCardVisible(id, visible)} />)}
    </View>
    {activeHabits.length > 0 && <><Text style={styles.section}>Goals on Home</Text>
    <Text style={styles.help}>Choose which habits count toward your daily goals or get their own card.</Text></>}
    {activeHabits.map((item) => <View key={item.id} style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.flexText}>{item.displayName || item.name}</Text><Text style={styles.status}>{item.habitTemplate === 'mindfulness' ? 'Mindfulness card' : templateConfig(item.habitTemplate)?.period === 'week' ? 'Weekly card' : 'Daily goal'}</Text></View><Switch accessibilityLabel={`Show ${item.displayName || item.name} on Home`} value={!hiddenHabits.includes(item.id)} onValueChange={(visible) => setHiddenHabits((current) => visible ? current.filter((id) => id !== item.id) : [...current, item.id])} /></View>)}
    <Text style={styles.section}>Goal colors</Text>
    {colorGoals.length > 0 && <Text style={styles.help}>Each goal has its own color. Tap one to change it. Dimmed colors are already used by another goal, including hidden ones.</Text>}
    {colorGoals.map((goal) => <View key={goal.id} style={styles.colorCard}><Pressable accessibilityRole="button" accessibilityState={{ expanded: openColor === goal.id }} accessibilityLabel={`${goal.title} color`} onPress={() => setOpenColor((current) => current === goal.id ? null : goal.id)} style={styles.colorHeading}><View style={[styles.colorMarker, { backgroundColor: homeGoalColor(goal.id, goalColors, goal.fallback) }]} /><Text style={styles.flexText}>{goal.title}</Text><Chevron direction={openColor === goal.id ? 'up' : 'down'} size={16} color={colors.textMuted} /></Pressable>{openColor === goal.id && <View style={styles.colorChoices}>{HOME_GOAL_COLORS.map((color) => <Pressable key={color} accessibilityRole="radio" accessibilityLabel={`${goal.title}: ${HOME_GOAL_COLOR_NAMES[color]}`} accessibilityState={{ checked: homeGoalColor(goal.id, goalColors, goal.fallback) === color, disabled: colorsInUse(goal.id).has(color) }} disabled={colorsInUse(goal.id).has(color)} onPress={() => setGoalColors((current) => ({ ...current, [goal.id]: color }))} style={[styles.colorChoice, { backgroundColor: color }, homeGoalColor(goal.id, goalColors, goal.fallback) === color && styles.colorSelected, colorsInUse(goal.id).has(color) && styles.colorTaken]}><Text style={styles.colorCheck}>{homeGoalColor(goal.id, goalColors, goal.fallback) === color ? '✓' : ''}</Text></Pressable>)}</View>}</View>)}
    {!colorGoals.length && <Text style={styles.help}>Set a Steps or Nutrition goal, or add a good habit, to choose its Home color.</Text>}
    {draft.some((widget) => widget.id === 'weight' && dashboardWidgetAllowed(widget.id, preferences)) && !hiddenCards.includes('weight') && <Text style={styles.section}>Weight card</Text>}
    {draft.filter((widget) => widget.id === 'weight' && !hiddenCards.includes('weight') && dashboardWidgetAllowed(widget.id, preferences)).map((widget) => {
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
    <Pressable accessibilityRole="button" onPress={save} style={styles.save}><Text style={styles.saveText}>Save</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={exit} style={styles.secondary}><Text style={styles.buttonText}>Cancel</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => Alert.alert('Restore the default order?', 'Your cards go back to their original order. What you’ve chosen to hide stays hidden. Tap Save to apply it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Restore order', onPress: () => setCardOrder(hiddenCardsLast(normalizeHomeCardOrder(undefined), hiddenCards)) }])} style={styles.secondary}><Text style={styles.buttonText}>Restore default order</Text></Pressable>
  </ScrollView>;
}

function OrderRow({ id, index, count, height, hidden, move, onDragging, onVisible }: {
  id: HomeCardId; index: number; count: number; height: number; hidden: boolean;
  move: (id: HomeCardId, delta: number) => void; onDragging: (dragging: boolean) => void; onVisible: (visible: boolean) => void;
}) {
  const [translation, setTranslation] = useState(0);
  const [active, setActive] = useState(false);
  const title = HOME_CARDS.find((item) => item.id === id)!.title;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { setActive(true); onDragging(true); },
    onPanResponderMove: (_, gesture) => setTranslation(Math.max(-index * height, Math.min((count - index - 1) * height, gesture.dy))),
    onPanResponderRelease: (_, gesture) => { setTranslation(0); setActive(false); onDragging(false); move(id, Math.round(gesture.dy / height)); },
    onPanResponderTerminate: () => { setTranslation(0); setActive(false); onDragging(false); },
    onPanResponderTerminationRequest: () => false,
  }), [index, count, height, id, move, onDragging]);
  return <View style={[styles.orderRow, { height, transform: [{ translateY: translation }], zIndex: active ? 10 : 0 }, active && styles.dragging]}>
    {hidden ? <View style={styles.handleSpace} /> : <View {...responder.panHandlers} accessible accessibilityLabel={`Drag ${title}; move buttons also available`} style={styles.handle}><Text style={styles.handleText}>⠿</Text></View>}
    <Text style={[styles.rowTitle, hidden && styles.rowHidden]} numberOfLines={2}>{title}</Text>
    {!hidden && <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${title} up`} disabled={index === 0} onPress={() => move(id, -1)} style={[styles.arrow, index === 0 && styles.disabled]}><Text style={styles.buttonText}>↑</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${title} down`} disabled={index === count - 1} onPress={() => move(id, 1)} style={[styles.arrow, index === count - 1 && styles.disabled]}><Text style={styles.buttonText}>↓</Text></Pressable>
    </>}
    <Switch accessibilityLabel={`Show ${title} on Home`} value={!hidden} onValueChange={onVisible} />
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: 20 }, title: { color: colors.text, fontSize: 28, fontFamily: font.bold }, body: { color: colors.textMuted, fontSize: 14, fontFamily: font.regular, lineHeight: 22, marginTop: 10 }, help: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 20, marginTop: 8 }, orderList: { marginTop: 20 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 8, marginBottom: 0 }, rowTitle: { flex: 1, color: colors.text, fontSize: 15, fontFamily: font.semibold, marginLeft: 2 }, rowHidden: { color: colors.textDim }, handleSpace: { width: 48 }, dragging: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised, elevation: 8 }, rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 4 }, cardTitle: { flexShrink: 1, color: colors.text, fontSize: 16, fontFamily: font.semibold }, status: { flex: 1, color: colors.textMuted, fontSize: 12 , fontFamily: font.regular}, handle: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, handleText: { color: colors.accent, fontSize: 28 , fontFamily: font.regular}, arrow: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 12 }, buttonText: { color: colors.text, fontSize: 15, fontFamily: font.bold }, disabled: { opacity: .3 },
  section: { color: colors.text, fontSize: 20, fontFamily: font.semibold, marginTop: 24, marginBottom: 12 }, card: { padding: 16, borderColor: colors.border, borderWidth: 1, borderRadius: 18, backgroundColor: colors.surface, marginBottom: 12 }, switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12 }, flexText: { flex: 1, color: colors.text, fontSize: 14, fontFamily: font.regular, lineHeight: 21 }, save: { backgroundColor: colors.accent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, saveText: { color: colors.background, fontSize: 15, fontFamily: font.semibold }, secondary: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  colorCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10, gap: 10 }, colorHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, colorMarker: { width: 13, height: 13, borderRadius: 7 }, colorChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, colorChoice: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' }, colorSelected: { borderColor: colors.text }, colorTaken: { opacity: 0.2 }, colorCheck: { color: colors.background, fontSize: 20, fontFamily: font.bold },
});
