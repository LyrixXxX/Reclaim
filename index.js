import { Platform } from 'react-native';
import 'expo-router/entry';

// Android home-screen widget: rendered headlessly from saved state.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
