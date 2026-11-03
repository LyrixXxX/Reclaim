import { requestWidgetUpdate } from 'react-native-android-widget';

import { TrackerState } from '@/models/tracker';
import { QUIT_WIDGET_NAME, QuitWidget } from './quit-widget';
import { quitWidgetData } from './widget-data';

/** Refreshes any Reclaim widgets on the home screen with the latest state. */
export function updateQuitWidget(state: TrackerState) {
  void requestWidgetUpdate({ widgetName: QUIT_WIDGET_NAME, renderWidget: () => <QuitWidget data={quitWidgetData(state)} /> }).catch(() => undefined);
}
