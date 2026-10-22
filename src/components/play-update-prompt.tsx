import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { getBuildNumber, getInstallerPackageName } from 'react-native-device-info';
import type SpInAppUpdates from 'sp-react-native-in-app-updates';
import type { StatusUpdateEvent } from 'sp-react-native-in-app-updates';

import { localDateKey } from '@/lib/progress';
import { PLAY_UPDATES_ENABLED, PlayUpdateReminder, shouldPromptForPlayUpdate } from '@/lib/play-updates';

const REMINDER_KEY = 'reclaim-play-update-reminder-v1';

/** Only signed Play-distributed AAB builds enable this; ADB APKs always leave it dormant. */
export function PlayUpdatePrompt({ active }: { active: boolean }) {
  const checking = useRef(false);
  const client = useRef<SpInAppUpdates | null>(null);
  const statusListener = useRef<((event: StatusUpdateEvent) => void) | null>(null);
  const downloadAlertShown = useRef(false);

  useEffect(() => {
    if (!PLAY_UPDATES_ENABLED || Platform.OS !== 'android' || !active) return;
    let mounted = true;

    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        if (await getInstallerPackageName() !== 'com.android.vending' || !mounted) return;
        const currentCode = Number(getBuildNumber());
        if (!Number.isInteger(currentCode) || currentCode < 1) return;
        const { default: Updates, IAUUpdateKind, IAUInstallStatus } = await import('sp-react-native-in-app-updates');
        if (!mounted) return;
        const updates = client.current ?? new Updates(false);
        client.current = updates;
        if (!statusListener.current) {
          const onStatus = (event: StatusUpdateEvent) => {
            if (event.status !== IAUInstallStatus.DOWNLOADED || downloadAlertShown.current || !mounted) return;
            downloadAlertShown.current = true;
            Alert.alert('Update ready', 'Reclaim downloaded the update. Restart to install it?', [
              { text: 'Later', style: 'cancel', onPress: () => { downloadAlertShown.current = false; } },
              { text: 'Restart', onPress: () => updates.installUpdate() },
            ]);
          };
          updates.addStatusUpdateListener(onStatus);
          statusListener.current = onStatus;
        }

        const result = await updates.checkNeedsUpdate({ curVersion: String(currentCode) });
        if (!mounted || !result.shouldUpdate || !('versionCode' in result.other)) return;
        const availableCode = result.other.versionCode;
        const day = localDateKey();
        const raw = await AsyncStorage.getItem(REMINDER_KEY);
        const saved = raw ? JSON.parse(raw) as PlayUpdateReminder : null;
        const reminder = saved && Number.isInteger(saved.versionCode) && typeof saved.day === 'string' ? saved : null;
        if (!mounted || !shouldPromptForPlayUpdate(currentCode, availableCode, result.other.isFlexibleUpdateAllowed, reminder, day)) return;
        await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify({ versionCode: availableCode, day }));
        if (!mounted) return;
        const important = result.other.updatePriority >= 4;
        Alert.alert(important ? 'Important update available' : 'New update available',
          'A newer Reclaim version is available through Google Play. You can keep using the app while it downloads.', [
            { text: 'Later', style: 'cancel' },
            { text: 'Update', onPress: () => { void updates.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE }).catch(() => undefined); } },
          ]);
      } catch {
        // Play services, storage, or network unavailable: never block app use.
      } finally {
        checking.current = false;
      }
    };

    void check();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void check(); });
    return () => {
      mounted = false;
      subscription.remove();
      if (client.current && statusListener.current) client.current.removeStatusUpdateListener(statusListener.current);
      statusListener.current = null;
    };
  }, [active]);

  return null;
}
