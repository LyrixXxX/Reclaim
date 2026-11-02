const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// These packages ship Android/iOS code only. On web, resolve them to inert
// stand-ins so screens can be previewed in a browser.
const nativeOnly = new Set([
  'react-native-google-mobile-ads',
  'expo-iap',
  '@maplibre/maplibre-react-native',
  '@infinitered/react-native-mlkit-text-recognition',
  'sp-react-native-in-app-updates',
]);
const webStub = path.resolve(__dirname, 'web-stubs/native-modules.js');
const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && nativeOnly.has(moduleName)) return { type: 'sourceFile', filePath: webStub };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
