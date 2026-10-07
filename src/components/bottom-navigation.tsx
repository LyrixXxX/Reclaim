import { Href, Link, usePathname } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { selectionHaptic } from '@/lib/haptics';
import { horizontalOverflowState } from '@/lib/navigation';
import { useTrackers } from '@/state/tracker-context';

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
          {preferences.visibleSections.goals && <Tab href="/habits" label="Habits" icon="habits" color={colors.habitsNav} active={path === '/habits'} />}
          {preferences.visibleSections.health && <Tab href="/health" label="Health" icon="health" color={colors.healthNav} active={path.startsWith('/health') || path === '/medications'} />}
          {preferences.visibleSections.cpap && <Tab href="/cpap" label="CPAP" icon="cpap" color={colors.cpapNav} active={path.startsWith('/cpap')} />}
          {preferences.visibleSections.weight && <Tab href="/weight" label="Weight" icon="weight" color={colors.weightNav} active={path.startsWith('/weight')} />}
          {preferences.visibleSections.nutrition && <Tab href="/nutrition" label="Nutrition" icon="nutrition" color={colors.nutritionNav} active={path.startsWith('/nutrition')} />}
          {preferences.visibleSections.activity && <Tab href="/activity" label="Activity" icon="activity" color={colors.activityNav} active={path === '/activity' || path === '/activity-map'} />}
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
    <Svg width="100%" height="100%" viewBox="0 0 38 48">
      <Defs><LinearGradient id={gradientId} x1={side === 'left' ? '1' : '0'} x2={side === 'left' ? '0' : '1'}><Stop offset="0" stopColor={colors.background} stopOpacity="0" /><Stop offset=".58" stopColor={colors.background} stopOpacity=".82" /><Stop offset="1" stopColor={colors.background} stopOpacity="1" /></LinearGradient></Defs>
      <Rect x="0" y="0" width="38" height="48" fill={`url(#${gradientId})`} />
      <Path d={side === 'left' ? 'M22 18 16 24l6 6' : 'm16 18 6 6-6 6'} fill="none" stroke={colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </View>;
}

type NavIconName = 'home' | 'habits' | 'health' | 'cpap' | 'weight' | 'nutrition' | 'activity' | 'settings';

function Tab({ href, label, icon, color, active }: { href: '/' | '/habits' | '/health' | '/cpap' | '/weight' | '/nutrition' | '/activity' | '/settings'; label: string; icon: NavIconName; color: string; active: boolean }) {
  return <Link href={href as Href} replace asChild><Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={selectionHaptic} style={styles.tab}>
    <NavIcon name={icon} active={active} />
    <Text style={[styles.label, active && { color }]}>{label}</Text>
  </Pressable></Link>;
}

function NavIcon({ name, active }: { name: NavIconName; active: boolean }) {
  const centers: Record<NavIconName, [number, number]> = {
    home: [267, 198], habits: [680, 198], health: [1096, 198], cpap: [1508, 198],
    weight: [267, 623], nutrition: [680, 623], activity: [1096, 623], settings: [1508, 623],
  };
  const scale = 34 / 326;
  const [centerX, centerY] = centers[name];
  return <View style={[styles.icon, { opacity: active ? 1 : 0.58 }]} accessibilityElementsHidden>
    <Image
      source={require('../../assets/images/navigation-icons-source.png')}
      resizeMode="stretch"
      style={{ position: 'absolute', width: 1774 * scale, height: 887 * scale, left: 17 - centerX * scale, top: 17 - centerY * scale }}
    />
  </View>;
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  bar: { flexDirection: 'row', maxWidth: 680, width: '100%', alignSelf: 'center' },
  moduleViewport: { flex: 1, position: 'relative' },
  moduleScroll: { flex: 1 },
  moduleContent: { alignItems: 'stretch' },
  scrollCue: { position: 'absolute', top: 0, width: 38, height: 48 },
  scrollCueLeft: { left: 0 },
  scrollCueRight: { right: 0 },
  settingsSlot: { width: 72, borderLeftWidth: 1, borderLeftColor: colors.border },
  tab: { width: 72, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { width: 34, height: 34, overflow: 'hidden' },
  label: { color: colors.textDim, fontSize: 10, fontWeight: '800' },
});
