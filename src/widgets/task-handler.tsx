import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { STATE_STORAGE_KEY } from '@/lib/local-storage';
import { TrackerState } from '@/models/tracker';
import { QuitWidget } from './quit-widget';
import { quitWidgetData } from './widget-data';
import { readWidgetStepCount } from './widget-steps';

async function readState(): Promise<TrackerState | undefined> {
  try {
    const raw = await AsyncStorage.getItem(STATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as TrackerState : undefined;
  } catch { return undefined; }
}

/** Runs headless when Android adds, resizes or refreshes the widget. */
export async function widgetTaskHandler({ widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  const [state, stepCount] = await Promise.all([readState(), readWidgetStepCount()]);
  renderWidget(<QuitWidget data={quitWidgetData(state, Date.now(), stepCount)} />);
}
