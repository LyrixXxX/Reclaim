import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useState } from 'react';
import { Image, ImageSourcePropType, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Rect } from 'react-native-svg';

import { HomeAdBanner } from '@/components/home-ad-banner';
import { colors, font, radius } from '@/theme';
import { selectionHaptic } from '@/lib/haptics';
import { bottomBarLayout } from '@/lib/navigation';

type NavIconName = 'home' | 'steps' | 'routes' | 'habits' | 'weight' | 'nutrition' | 'workouts' | 'supplements' | 'settings';

// Illustrated 144px artwork, drawn at 30pt; inactive tabs are dimmed.
const navigationIcons: Record<NavIconName, ImageSourcePropType> = {
  home: require('../../assets/images/nav/home.png'),
  steps: require('../../assets/images/nav/steps.png'),
  routes: require('../../assets/images/nav/routes.png'),
  habits: require('../../assets/images/nav/habits.png'),
  weight: require('../../assets/images/nav/weight.png'),
  nutrition: require('../../assets/images/nav/nutrition.png'),
  workouts: require('../../assets/images/nav/workouts.png'),
  supplements: require('../../assets/images/nav/supplements.png'),
  settings: require('../../assets/images/nav/settings.png'),
};

// Keyed by route file name in app/(tabs).
const tabDetails: Record<string, { label: string; icon: NavIconName; color: string }> = {
  index: { label: 'Home', icon: 'home', color: colors.accent },
  activity: { label: 'Steps', icon: 'steps', color: colors.activityNav },
  routes: { label: 'Routes', icon: 'routes', color: colors.activityNav },
  habits: { label: 'Habits', icon: 'habits', color: colors.habitsNav },
  weight: { label: 'Weight', icon: 'weight', color: colors.weightNav },
  nutrition: { label: 'Nutrition', icon: 'nutrition', color: colors.nutritionNav },
  workouts: { label: 'Workouts', icon: 'workouts', color: colors.workoutsNav },
  supplements: { label: 'Supplements', icon: 'supplements', color: colors.healthNav },
  settings: { label: 'Settings', icon: 'settings', color: colors.settingsNav },
};
const adRoutes = new Set(['index', 'nutrition', 'activity']);

/**
 * Tab bar for the swipeable section pager: Home, the first three sections, and More for the rest.
 * Swiping still moves through every section; when it lands on one under More, More shows it.
 */
export function BottomNavigation({ state, emitter, navigateToTab }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeRoute = state.routes[state.index];
  const { bar, more } = bottomBarLayout(state.routes);
  const activeInMore = !!activeRoute && more.some((route) => route.key === activeRoute.key);

  const press = (key: string) => {
    selectionHaptic();
    setMoreOpen(false);
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!event.defaultPrevented) navigateToTab(key);
  };
  const settings = more.find((route) => route.name === 'settings');

  return <View>
    {activeRoute && adRoutes.has(activeRoute.name) && <HomeAdBanner />}
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {bar.map((route) => <Tab key={route.key} name={route.name} active={route.key === activeRoute?.key} onPress={() => press(route.key)} />)}
        {more.length > 0 && (activeInMore
          ? <Tab name={activeRoute!.name} active onPress={() => { selectionHaptic(); setMoreOpen(true); }} accessibilityLabel={`More. Showing ${tabDetails[activeRoute!.name]?.label ?? 'section'}`} />
          : <MoreTab onPress={() => { selectionHaptic(); setMoreOpen(true); }} />)}
      </View>
    </View>
    <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close More" onPress={() => setMoreOpen(false)} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>More</Text>
          <View style={styles.grid}>
            {more.filter((route) => route.name !== 'settings').map((route) => <GridItem key={route.key} name={route.name} active={route.key === activeRoute?.key} onPress={() => press(route.key)} />)}
            {settings && <GridItem name="settings" active={settings.key === activeRoute?.key} onPress={() => press(settings.key)} />}
          </View>
          {settings && <Pressable accessibilityRole="button" onPress={() => press(settings.key)} style={styles.edit}>
            <Text style={styles.editText}>Choose bar sections</Text>
            <Text style={styles.editHint}>The first three in your order sit in the bar. Reorder them in Settings → Bottom navigation.</Text>
          </Pressable>}
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}

function Tab({ name, active, onPress, accessibilityLabel }: { name: string; active: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const tab = tabDetails[name];
  if (!tab) return null;
  return <Pressable accessibilityRole="tab" accessibilityLabel={accessibilityLabel ?? tab.label} accessibilityState={{ selected: active }} onPress={onPress} style={styles.tab}>
    <View style={styles.iconWell}>
      {/* SVG pill: Android drops borderRadius on this view. */}
      {active && <Svg style={StyleSheet.absoluteFill} viewBox="0 0 52 30"><Rect x="0" y="0" width="52" height="30" rx="15" fill={tab.color} fillOpacity={0.16} /></Svg>}
      <Image source={navigationIcons[tab.icon]} style={[styles.icon, !active && styles.iconInactive]} resizeMode="contain" accessible={false} />
    </View>
    <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>{tab.label}</Text>
  </Pressable>;
}

function MoreTab({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityLabel="More sections and Settings" accessibilityState={{ selected: false }} onPress={onPress} style={styles.tab}>
    <View style={styles.iconWell}>
      <Svg width={24} height={24} viewBox="0 0 24 24" accessibilityElementsHidden>
        {[[6, 6], [18, 6], [6, 18], [18, 18]].map(([cx, cy]) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.4} fill={colors.textMuted} />)}
      </Svg>
    </View>
    <Text style={styles.label} numberOfLines={1}>More</Text>
  </Pressable>;
}

function GridItem({ name, active, onPress }: { name: string; active: boolean; onPress: () => void }) {
  const tab = tabDetails[name];
  if (!tab) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={tab.label} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.gridItem, active && { borderColor: tab.color }, pressed && { opacity: 0.8 }]}>
    <Image source={navigationIcons[tab.icon]} style={styles.gridIcon} resizeMode="contain" accessible={false} />
    <Text style={[styles.gridLabel, active && { color: colors.text }]} numberOfLines={1}>{tab.label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  bar: { flexDirection: 'row', maxWidth: 680, width: '100%', alignSelf: 'center' },
  tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconWell: { width: 52, height: 30, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 30, height: 30 },
  iconInactive: { opacity: 0.55 },
  label: { color: colors.textDim, fontSize: 11, fontFamily: font.semibold },
  labelActive: { color: colors.text, fontFamily: font.bold },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000A' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.textDim, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 20, fontFamily: font.bold, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '2.75%', rowGap: 10 },
  gridItem: { width: '31.5%', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  gridIcon: { width: 40, height: 40 },
  gridLabel: { color: colors.textMuted, fontSize: 13, fontFamily: font.semibold },
  edit: { marginTop: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  editText: { color: colors.accent, fontSize: 15, fontFamily: font.bold },
  editHint: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 3, lineHeight: 17 },
});
