const { withAndroidManifest, withAndroidStyles, withAppBuildGradle } = require('expo/config-plugins');

function useCurrentMaterialComponents(buildGradle) {
  const dependency = 'implementation("com.google.android.material:material:1.14.0")';
  if (buildGradle.includes(dependency)) return buildGradle;
  return buildGradle.replace(/dependencies\s*\{/, (match) => `${match}\n    // Material 1.14 fixes Android 15 bottom-sheet system-bar handling.\n    ${dependency}`);
}

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
  config = withAndroidStyles(config, (mod) => {
    mod.modResults = removeLegacySystemBarColors(mod.modResults);
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = useCurrentMaterialComponents(mod.modResults.contents);
    return mod;
  });
};

module.exports.removeLegacyWindowAttributes = removeLegacyWindowAttributes;
module.exports.removeLegacySystemBarColors = removeLegacySystemBarColors;
module.exports.useCurrentMaterialComponents = useCurrentMaterialComponents;
