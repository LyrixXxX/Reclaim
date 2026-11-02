import { TopTabs } from 'expo-router/js-top-tabs';

import { BottomNavigation } from '@/components/bottom-navigation';
import { DEFAULT_PREFERENCES, normalizeNavigationOrder } from '@/lib/preferences';
import { NavigationSection } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

// Route file for each optional section, in the order Settings lets people arrange.
const sectionRoutes: Record<NavigationSection, string> = {
  activity: 'activity',
  routes: 'routes',
  goals: 'habits',
  weight: 'weight',
  nutrition: 'nutrition',
  workouts: 'workouts',
  supplements: 'supplements',
};

/** Main sections as swipeable pages; the bottom bar stays in sync with the pager. */
export default function TabsLayout() {
  const { preferences = DEFAULT_PREFERENCES } = useTrackers();
  return <TopTabs
    tabBarPosition="bottom"
    tabBar={(props) => <BottomNavigation {...props} />}
    screenOptions={{ lazy: true, lazyPreloadDistance: 1, sceneStyle: { backgroundColor: colors.background } }}>
    <TopTabs.Screen name="index" />
    {normalizeNavigationOrder(preferences.navigationOrder).map((section) => <TopTabs.Protected key={section} guard={!!preferences.visibleSections[section]}>
      <TopTabs.Screen name={sectionRoutes[section]} />
    </TopTabs.Protected>)}
    <TopTabs.Screen name="settings" />
  </TopTabs>;
}
