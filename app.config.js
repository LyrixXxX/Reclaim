const base = require('./app.json').expo;

const androidAppId = process.env.EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED === '1'
  ? 'ca-app-pub-3940256099942544~3347511713'
  : process.env.EXPO_PUBLIC_ADMOB_APP_ID || 'ca-app-pub-3940256099942544~3347511713';

module.exports = {
  expo: {
    ...base,
    plugins: base.plugins.map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads') {
        return [plugin[0], { ...plugin[1], androidAppId }];
      }
      return plugin;
    }),
  },
};
