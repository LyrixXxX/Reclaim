const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReclaimSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    let source = gradleConfig.modResults.contents;
    if (!source.includes("System.getenv('RECLAIM_STORE_FILE')")) {
      const debugConfig = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;
      const releaseConfig = `${debugConfig}
        release {
            if (System.getenv('RECLAIM_STORE_FILE')) {
                storeFile file(System.getenv('RECLAIM_STORE_FILE'))
                storePassword System.getenv('RECLAIM_STORE_PASSWORD')
                keyAlias System.getenv('RECLAIM_KEY_ALIAS')
                keyPassword System.getenv('RECLAIM_KEY_PASSWORD')
            }
        }`;
      source = source.replace(debugConfig, releaseConfig);
    }
    const buildTypesIndex = source.indexOf('    buildTypes {');
    if (buildTypesIndex !== -1) {
      const beforeBuildTypes = source.slice(0, buildTypesIndex);
      let buildTypes = source.slice(buildTypesIndex);
      buildTypes = buildTypes.replace(
        /release \{([\s\S]*?)signingConfig signingConfigs\.debug/,
        'release {$1signingConfig signingConfigs.release',
      );
      if (!buildTypes.includes('applicationIdSuffix ".dev"')) {
        buildTypes = buildTypes.replace(
          `        debug {
            signingConfig signingConfigs.debug
        }`,
          `        debug {
            signingConfig signingConfigs.debug
            applicationIdSuffix ".dev"
            versionNameSuffix "-dev"
        }`,
        );
      }
      source = beforeBuildTypes + buildTypes;
    }
    gradleConfig.modResults.contents = source;
    return gradleConfig;
  });
};
