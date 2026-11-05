import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { Href, router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, BackHandler, Platform, StyleSheet, ToastAndroid, View } from 'react-native';

import { AppLockScreen } from '@/components/app-lock-screen';
import { LocalSaveStatus } from '@/components/local-save-status';
import { PlayUpdatePrompt } from '@/components/play-update-prompt';
import { AppLockProvider, useAppLock } from '@/state/app-lock-context';
import { TrackerProvider } from '@/state/tracker-context';
import { MonetizationProvider } from '@/state/monetization-context';
import { AdsProvider } from '@/state/ads-context';
import { colors, font } from '@/theme';
import { consumePendingCaptureTarget } from '@/lib/pending-capture';
import '@/lib/activity-recording';
import { createStartupHandoff, startupFadeOptions, startupSurface } from '@/lib/startup';

// Hold only until a privacy-safe native view has laid out, including loading/errors.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions(startupFadeOptions(true));
void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => SplashScreen.setOptions(startupFadeOptions(reduced))).catch(() => undefined);
const handoffStartup = createStartupHandoff(() => SplashScreen.hide());
const BACK_TO_EXIT_MS = 2000;
const mainSectionPaths = new Set(['/', '/habits', '/weight', '/nutrition', '/supplements', '/activity', '/routes', '/activity-map', '/workouts', '/settings']);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  // Keep the native splash up until the typeface is ready; fall back to system fonts on failure.
  if (!fontsLoaded && !fontError) return null;
  return <View style={styles.shell} onLayout={handoffStartup}><StatusBar style="light" /><AppLockProvider><MonetizationProvider><AdsProvider><TrackerProvider><AppShell /></TrackerProvider></AdsProvider></MonetizationProvider></AppLockProvider></View>;
}

function AppShell() {
  const pathname = usePathname();
  const lastBackPress = useRef(0);
  const { locked, ready } = useAppLock();
  const privateContent = startupSurface(true, false, ready, locked) !== 'app';
  useEffect(() => {
    if (pathname !== '/') lastBackPress.current = 0;
    if (Platform.OS !== 'android' || privateContent || !mainSectionPaths.has(pathname)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const now = Date.now();
      if (pathname !== '/') {
        lastBackPress.current = now;
        router.replace('/' as Href);
        ToastAndroid.show('Press Back again to exit Reclaim', ToastAndroid.SHORT);
        return true;
      }
      if (now - lastBackPress.current <= BACK_TO_EXIT_MS) {
        BackHandler.exitApp();
        return true;
      }
      lastBackPress.current = now;
      ToastAndroid.show('Press Back again to exit Reclaim', ToastAndroid.SHORT);
      return true;
    });
    return () => subscription.remove();
  }, [pathname, privateContent]);
  useEffect(() => {
    Promise.all([ImagePicker.getPendingResultAsync(), consumePendingCaptureTarget()]).then(([result, target]) => {
      if (result && 'canceled' in result && !result.canceled && result.assets[0]) {
        if (target === 'nutrition') router.replace({ pathname: '/nutrition-log', params: { mode: 'label', recoveredPhotoUri: result.assets[0].uri } });
      }
    }).catch(() => undefined);
  }, []);
  return (
    <>
      <StatusBar style="light" />
      <View style={[styles.shell, privateContent && { opacity: 0 }]} pointerEvents={privateContent ? 'none' : 'auto'} accessibilityElementsHidden={privateContent} importantForAccessibility={privateContent ? 'no-hide-descendants' : 'auto'}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.background },
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontFamily: font.semibold, fontSize: 17 },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="dashboard-edit" options={{ title: 'Edit dashboard' }} />
          <Stack.Screen name="history" options={{ title: 'Habit history' }} />
          <Stack.Screen name="manage" options={{ title: 'Trackers' }} />
          <Stack.Screen name="archived" options={{ title: 'Archived trackers' }} />
          <Stack.Screen name="tracker-form" options={{ title: 'Tracker setup' }} />
          <Stack.Screen name="good-habit-types" options={{ title: 'Add good habit' }} />
          <Stack.Screen name="good-habit-form" options={{ title: 'Good habit setup' }} />
          <Stack.Screen name="water-form" options={{ title: 'Water habit setup' }} />
          <Stack.Screen name="water-history" options={{ title: 'Water history' }} />
          <Stack.Screen name="tracker/[id]" options={{ title: 'Tracker' }} />
          <Stack.Screen name="craving" options={{ title: 'Craving' }} />
          <Stack.Screen name="savings-goal" options={{ title: 'Savings goal' }} />
          <Stack.Screen name="progress-trends" options={{ title: 'Progress trends' }} />
          <Stack.Screen name="share-milestone" options={{ title: 'Share progress' }} />
          <Stack.Screen name="workout-session" options={{ title: 'Workout' }} />
          <Stack.Screen name="workout-exercises" options={{ title: 'Exercises' }} />
          <Stack.Screen name="workout-routines" options={{ title: 'Routines' }} />
          <Stack.Screen name="workout-plan" options={{ title: 'Build a training week' }} />
          <Stack.Screen name="workout-history" options={{ title: 'Workout history' }} />
          <Stack.Screen name="workout-progress" options={{ title: 'Strength progress' }} />
          <Stack.Screen name="workout-exercise-progress" options={{ title: 'Exercise progress' }} />
          <Stack.Screen name="workout-body-part" options={{ title: 'Body part strength' }} />
          <Stack.Screen name="workout-settings" options={{ title: 'Workout settings' }} />
          <Stack.Screen name="activity-map" options={{ headerShown: false }} />
          <Stack.Screen name="activity-routes" options={{ title: 'Saved routes' }} />
          <Stack.Screen name="route-settings" options={{ title: 'Route settings' }} />
          <Stack.Screen name="nutrition-add" options={{ title: 'Add food' }} />
          <Stack.Screen name="nutrition-log" options={{ title: 'Log food' }} />
          <Stack.Screen name="nutrition-trends" options={{ title: 'Food trend report' }} />
          <Stack.Screen name="nutrition-foods" options={{ title: 'Saved foods' }} />
          <Stack.Screen name="nutrition-food-form" options={{ title: 'Saved food' }} />
          <Stack.Screen name="nutrition-meal-form" options={{ title: 'Saved meal' }} />
          <Stack.Screen name="nutrition-meal-groups" options={{ title: 'Edit meal groups' }} />
          <Stack.Screen name="nutrition-settings" options={{ title: 'Macros' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy & data' }} />
        </Stack>
        <LocalSaveStatus errorsOnly />
        <PlayUpdatePrompt active={!privateContent} />
      </View>
      {(!ready || locked) && <AppLockScreen loading={!ready} />}
    </>
  );
}

const styles = StyleSheet.create({ shell: { flex: 1, backgroundColor: colors.background } });
