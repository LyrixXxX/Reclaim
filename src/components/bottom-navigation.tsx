import { Href, Link, usePathname } from 'expo-router';
import { useMemo, useState } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Icon, IconName } from '@/components/icon';
import { colors, font } from '@/theme';
import { DEFAULT_PREFERENCES, normalizeNavigationOrder } from '@/lib/preferences';
import { selectionHaptic } from '@/lib/haptics';
import { horizontalOverflowState } from '@/lib/navigation';
import { useTrackers } from '@/state/tracker-context';
import { NavigationSection } from '@/models/tracker';

const navigationTabs: Record<NavigationSection, { href: '/activity' | '/routes' | '/habits' | '/weight' | '/nutrition' | '/workouts' | '/supplements'; label: string; icon: IconName; color: string; active: (path: string) => boolean }> = {
  activity: { href: '/activity', label: 'Steps', icon: 'steps', color: colors.activityNav, active: (path) => path === '/activity' },
  routes: { href: '/routes', label: 'Routes', icon: 'routes', color: colors.activityNav, active: (path) => path === '/routes' || path === '/activity-map' || path === '/activity-routes' },
  goals: { href: '/habits', label: 'Habits', icon: 'habits', color: colors.habitsNav, active: (path) => path === '/habits' },
  weight: { href: '/weight', label: 'Weight', icon: 'weight', color: colors.weightNav, active: (path) => path.startsWith('/weight') },
  nutrition: { href: '/nutrition', label: 'Nutrition', icon: 'nutrition', color: colors.nutritionNav, active: (path) => path.startsWith('/nutrition') },
  workouts: { href: '/workouts', label: 'Workouts', icon: 'workouts', color: colors.workoutsNav, active: (path) => path.startsWith('/workout') },
  supplements: { href: '/supplements', label: 'Supplements', icon: 'supplements', color: colors.healthNav, active: (path) => path === '/supplements' },
};

export function BottomNavigation() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const { preferences = DEFAULT_PREFERENCES } = useTrackers();
  const [scrollMetrics, setScrollMetrics] = useState({ contentWidth: 0, viewportWidth: 0, offset: 0 });
  const overflow = useMemo(() => horizontalOverflowState(scrollMetrics), [scrollMetrics]);
  const setViewportWidth = (event: LayoutChangeEvent) => {
    const viewportWidth = event.nativeEvent.layout.width;
    setScrollMetrics((current) => ({ ...current, viewportWidth }));
  };
  const setContentWidth = (contentWidth: number) => setScrollMetrics((current) => ({ ...current, contentWidth }));
  const setOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = Math.max(0, event.nativeEvent.contentOffset.x);
    setScrollMetrics((current) => ({ ...current, offset }));
  };
  return <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 8) }]}>
    <View style={styles.bar}>
      <View style={styles.moduleViewport} onLayout={setViewportWidth}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moduleScroll} contentContainerStyle={styles.moduleContent} onContentSizeChange={setContentWidth} onScroll={setOffset} scrollEventThrottle={32}>
          <Tab href="/" label="Home" icon="home" color={colors.accent} active={path === '/'} />
          {normalizeNavigationOrder(preferences.navigationOrder).filter((section) => preferences.visibleSections[section]).map((section) => {
            const tab = navigationTabs[section];
            return <Tab key={section} {...tab} active={tab.active(path)} />;
          })}
        </ScrollView>
        {overflow.canScrollLeft && <ScrollCue side="left" />}
        {overflow.canScrollRight && <ScrollCue side="right" />}
      </View>
      <View style={styles.settingsSlot}><Tab href="/settings" label="Settings" icon="settings" color={colors.settingsNav} active={path.startsWith('/settings')} /></View>
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

function Tab({ href, label, icon, color, active }: { href: '/' | '/habits' | '/weight' | '/nutrition' | '/activity' | '/routes' | '/workouts' | '/supplements' | '/settings'; label: string; icon: IconName; color: string; active: boolean }) {
  return <Link href={href as Href} replace asChild><Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={selectionHaptic} style={styles.tab}>
    <View style={styles.iconWell}>
      {/* SVG pill: Android drops borderRadius on this view inside the tab Link. */}
      {active && <Svg style={StyleSheet.absoluteFill} viewBox="0 0 52 30"><Rect x="0" y="0" width="52" height="30" rx="15" fill={color} fillOpacity={0.16} /></Svg>}
      <Icon name={icon} size={22} color={active ? color : colors.textDim} strokeWidth={active ? 2.1 : 1.8} /></View>
    <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
  </Pressable></Link>;
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
  tab: { width: 66, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconWell: { width: 52, height: 30, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.textDim, fontSize: 11, fontFamily: font.semibold },
  labelActive: { color: colors.text, fontFamily: font.bold },
});
