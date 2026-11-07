import AsyncStorage from '@react-native-async-storage/async-storage';

const FULL_SCREEN_KEY = 'reclaim:route-start-full-screen:v1';
const NAVIGATION_KEY = 'reclaim:route-start-navigation:v1';

export type RouteStartView = { fullScreen: boolean; navigation: boolean };

/** How the map opens when a route starts. Both are off unless someone turns them on. */
export async function readRouteStartView(): Promise<RouteStartView> {
  const [fullScreen, navigation] = await Promise.all([AsyncStorage.getItem(FULL_SCREEN_KEY), AsyncStorage.getItem(NAVIGATION_KEY)]);
  return { fullScreen: fullScreen === 'true', navigation: navigation === 'true' };
}

export async function setRouteStartView(option: keyof RouteStartView, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(option === 'fullScreen' ? FULL_SCREEN_KEY : NAVIGATION_KEY, String(enabled));
}
