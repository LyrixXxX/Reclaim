import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppLockScreen } from '@/components/app-lock-screen';
import { BottomNavigation } from '@/components/bottom-navigation';
import { LocalSaveStatus } from '@/components/local-save-status';
import { HomeAdBanner } from '@/components/home-ad-banner';
import { AppLockProvider, useAppLock } from '@/state/app-lock-context';
import { TrackerProvider } from '@/state/tracker-context';
import { MonetizationProvider } from '@/state/monetization-context';
import { colors } from '@/theme';
import { consumePendingCaptureTarget } from '@/lib/pending-capture';
import '@/lib/activity-recording';
import { createStartupHandoff, startupFadeOptions, startupSurface } from '@/lib/startup';

// Hold only until a privacy-safe native view has laid out, including loading/errors.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions(startupFadeOptions(true));
void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => SplashScreen.setOptions(startupFadeOptions(reduced))).catch(() => undefined);
const handoffStartup = createStartupHandoff(() => SplashScreen.hide());

export default function RootLayout() {
  return <View style={styles.shell} onLayout={handoffStartup}><StatusBar style="light" /><AppLockProvider><MonetizationProvider><TrackerProvider><AppShell /></TrackerProvider></MonetizationProvider></AppLockProvider></View>;
}

function AppShell() {
  const pathname = usePathname();
  const { locked, ready } = useAppLock();
  const privateContent = startupSurface(true, false, ready, locked) !== 'app';
  const mainTabs = ['/', '/habits', '/health', '/medications', '/cpap', '/weight', '/nutrition', '/activity', '/activity-map', '/settings'];
  const showBottomNavigation = mainTabs.includes(pathname);
  useEffect(() => {
    Promise.all([ImagePicker.getPendingResultAsync(), consumePendingCaptureTarget()]).then(([result, target]) => {
      if (result && 'canceled' in result && !result.canceled && result.assets[0]) {
        if (target === 'nutrition') router.replace({ pathname: '/nutrition-log', params: { mode: 'label', recoveredPhotoUri: result.assets[0].uri } });
        else if (target?.startsWith('labs')) router.replace({ pathname: '/labs', params: { recoveredPhotoUri: result.assets[0].uri, recoveredLabTrackerId: target.includes(':') ? target.slice(target.indexOf(':') + 1) : undefined } });
        else router.replace({ pathname: '/cpap', params: { recoveredPhotoUri: result.assets[0].uri } });
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
            headerTitleStyle: { fontWeight: '700' },
          }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="habits" options={{ headerShown: false }} />
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
          <Stack.Screen name="health" options={{ headerShown: false }} />
          <Stack.Screen name="health-history" options={{ title: 'Reading history' }} />
          <Stack.Screen name="doctor-summary" options={{ title: 'Doctor summary' }} />
          <Stack.Screen name="cpap" options={{ headerShown: false }} />
          <Stack.Screen name="cpap-history" options={{ title: 'CPAP history' }} />
          <Stack.Screen name="cpap-care" options={{ title: 'CPAP care' }} />
          <Stack.Screen name="cpap-doctor-summary" options={{ title: 'CPAP summary' }} />
          <Stack.Screen name="cpap-settings" options={{ title: 'Therapy settings' }} />
          <Stack.Screen name="weight" options={{ headerShown: false }} />
          <Stack.Screen name="nutrition" options={{ headerShown: false }} />
          <Stack.Screen name="activity" options={{ headerShown: false }} />
          <Stack.Screen name="activity-map" options={{ headerShown: false }} />
          <Stack.Screen name="activity-routes" options={{ title: 'Saved routes' }} />
          <Stack.Screen name="activity-map-settings" options={{ title: 'Offline maps' }} />
          <Stack.Screen name="nutrition-log" options={{ title: 'Log food' }} />
          <Stack.Screen name="nutrition-trends" options={{ title: 'Food trend report' }} />
          <Stack.Screen name="nutrition-foods" options={{ title: 'Saved foods' }} />
          <Stack.Screen name="nutrition-food-form" options={{ title: 'Saved food' }} />
          <Stack.Screen name="nutrition-meal-form" options={{ title: 'Saved meal' }} />
          <Stack.Screen name="nutrition-settings" options={{ title: 'Nutrition setup' }} />
          <Stack.Screen name="nutrition-ai-settings" options={{ title: 'Private AI' }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy & data' }} />
          <Stack.Screen name="medications" options={{ headerShown: false }} />
          <Stack.Screen name="medication-reminder-settings" options={{ title: 'Reminder settings' }} />
          <Stack.Screen name="labs" options={{ title: 'Laboratory results' }} />
        </Stack>
        <LocalSaveStatus errorsOnly />
        {pathname === '/' && !privateContent && <HomeAdBanner />}
        {showBottomNavigation && <BottomNavigation />}
      </View>
      {(!ready || locked) && <AppLockScreen loading={!ready} />}
    </>
  );
}

const styles = StyleSheet.create({ shell: { flex: 1, backgroundColor: colors.background } });
