import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ImageSourcePropType, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { HomeAdBanner } from '@/components/home-ad-banner';
import { colors, font } from '@/theme';
import { selectionHaptic } from '@/lib/haptics';
import { horizontalOverflowState } from '@/lib/navigation';

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
const TAB_WIDTH = 66;

/** Tab bar for the swipeable section pager; Settings stays pinned on the right. */
export function BottomNavigation({ state, emitter, navigateToTab }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [scrollMetrics, setScrollMetrics] = useState({ contentWidth: 0, viewportWidth: 0, offset: 0 });
  const overflow = useMemo(() => horizontalOverflowState(scrollMetrics), [scrollMetrics]);
  const activeRoute = state.routes[state.index];
  const sections = state.routes.filter((route) => route.name !== 'settings');
  const settings = state.routes.find((route) => route.name === 'settings');
  const activeSection = sections.findIndex((route) => route.key === activeRoute?.key);

  // Keep the active tab in view when a swipe lands on a section that is scrolled off the bar.
  const { offset, viewportWidth } = scrollMetrics;
  useEffect(() => {
    if (activeSection < 0 || !viewportWidth) return;
    const left = activeSection * TAB_WIDTH;
    if (left < offset) scrollRef.current?.scrollTo({ x: left, animated: true });
    else if (left + TAB_WIDTH > offset + viewportWidth) scrollRef.current?.scrollTo({ x: left + TAB_WIDTH - viewportWidth, animated: true });
  }, [activeSection, viewportWidth]); // eslint-disable-line react-hooks/exhaustive-deps -- only follow tab changes, not manual bar scrolling

  const press = (key: string) => {
    selectionHaptic();
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!event.defaultPrevented) navigateToTab(key);
  };
  const setViewportWidth = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setScrollMetrics((current) => ({ ...current, viewportWidth: width }));
  };
  const setContentWidth = (contentWidth: number) => setScrollMetrics((current) => ({ ...current, contentWidth }));
  const setOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = Math.max(0, event.nativeEvent.contentOffset.x);
    setScrollMetrics((current) => ({ ...current, offset: x }));
  };
  return <View>
    {activeRoute && adRoutes.has(activeRoute.name) && <HomeAdBanner />}
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        <View style={styles.moduleViewport} onLayout={setViewportWidth}>
          <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={styles.moduleScroll} contentContainerStyle={styles.moduleContent} onContentSizeChange={setContentWidth} onScroll={setOffset} scrollEventThrottle={32}>
            {sections.map((route) => <Tab key={route.key} name={route.name} active={route.key === activeRoute?.key} onPress={() => press(route.key)} />)}
          </ScrollView>
          {overflow.canScrollLeft && <ScrollCue side="left" />}
          {overflow.canScrollRight && <ScrollCue side="right" />}
        </View>
        {settings && <View style={styles.settingsSlot}><Tab name="settings" active={settings.key === activeRoute?.key} onPress={() => press(settings.key)} /></View>}
      </View>
    </View>
  </View>;
}

function ScrollCue({ side }: { side: 'left' | 'right' }) {
  const gradientId = `navigation-${side}-fade`;
  return <View pointerEvents="none" accessibilityElementsHidden style={[styles.scrollCue, side === 'left' ? styles.scrollCueLeft : styles.scrollCueRight]}>
    <Svg width="100%" height="100%" viewBox="0 0 20 48" preserveAspectRatio="none">
      <Defs><LinearGradient id={gradientId} x1={side === 'left' ? '1' : '0'} x2={side === 'left' ? '0' : '1'}><Stop offset="0" stopColor={colors.background} stopOpacity="0" /><Stop offset=".58" stopColor={colors.background} stopOpacity=".82" /><Stop offset="1" stopColor={colors.background} stopOpacity="1" /></LinearGradient></Defs>
      <Rect x="0" y="0" width="20" height="48" fill={`url(#${gradientId})`} />
    </Svg>
  </View>;
}

function Tab({ name, active, onPress }: { name: string; active: boolean; onPress: () => void }) {
  const tab = tabDetails[name];
  if (!tab) return null;
  return <Pressable accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: active }} onPress={onPress} style={styles.tab}>
    <View style={styles.iconWell}>
      {/* SVG pill: Android drops borderRadius on this view. */}
      {active && <Svg style={StyleSheet.absoluteFill} viewBox="0 0 52 30"><Rect x="0" y="0" width="52" height="30" rx="15" fill={tab.color} fillOpacity={0.16} /></Svg>}
      <Image source={navigationIcons[tab.icon]} style={[styles.icon, !active && styles.iconInactive]} resizeMode="contain" accessible={false} />
    </View>
    <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{tab.label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  bar: { flexDirection: 'row', maxWidth: 680, width: '100%', alignSelf: 'center' },
  moduleViewport: { flex: 1, position: 'relative' },
  moduleScroll: { flex: 1 },
  moduleContent: { alignItems: 'stretch' },
  scrollCue: { position: 'absolute', top: 0, bottom: 0, width: 20 },
  scrollCueLeft: { left: 0 },
  scrollCueRight: { right: 0 },
  settingsSlot: { width: 70, borderLeftWidth: 1, borderLeftColor: colors.border },
  tab: { width: TAB_WIDTH, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconWell: { width: 52, height: 30, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 30, height: 30 },
  iconInactive: { opacity: 0.55 },
  label: { color: colors.textDim, fontSize: 11, fontFamily: font.semibold },
  labelActive: { color: colors.text, fontFamily: font.bold },
});
