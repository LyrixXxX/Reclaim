const { withAndroidManifest, withAndroidStyles } = require('expo/config-plugins');

function removeLegacyWindowAttributes(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) return manifest;
  delete application.$?.['android:resizeableActivity'];
  for (const activity of application.activity ?? []) {
    if (activity.$?.['android:name'] === '.MainActivity') {
      delete activity.$['android:screenOrientation'];
      delete activity.$['android:resizeableActivity'];
      delete activity.$['android:minAspectRatio'];
      delete activity.$['android:maxAspectRatio'];
    }
  }
  return manifest;
}

function removeLegacySystemBarColors(styles) {
  for (const style of styles.resources.style ?? []) {
    if (style.$?.name === 'AppTheme') {
      style.item = (style.item ?? []).filter((item) => ![
        'android:statusBarColor',
        'android:navigationBarColor',
        'android:navigationBarDividerColor',
      ].includes(item.$?.name));
    }
  }
  return styles;
}

module.exports = function withAdaptiveAndroidUi(config) {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = removeLegacyWindowAttributes(mod.modResults);
    return mod;
  });
  return withAndroidStyles(config, (mod) => {
    mod.modResults = removeLegacySystemBarColors(mod.modResults);
    return mod;
  });
};

module.exports.removeLegacyWindowAttributes = removeLegacyWindowAttributes;
module.exports.removeLegacySystemBarColors = removeLegacySystemBarColors;
