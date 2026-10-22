import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'reclaim:route-auto-pause:v1';

export async function readRouteAutoPauseEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === 'true';
}

export async function setRouteAutoPauseEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, String(enabled));
}
