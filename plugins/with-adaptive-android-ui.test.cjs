const assert = require('node:assert/strict');
const test = require('node:test');
const { removeLegacyWindowAttributes, removeLegacySystemBarColors, useCurrentMaterialComponents } = require('./with-adaptive-android-ui');

test('uses current Material Components without duplicating the dependency', () => {
  const original = 'dependencies {\n    implementation("com.facebook.react:react-android")\n}';
  const updated = useCurrentMaterialComponents(original);
  assert.match(updated, /material:1\.14\.0/);
  assert.equal(useCurrentMaterialComponents(updated), updated);
});

test('removes the main activity orientation lock without touching unrelated activities', () => {
  const manifest = { manifest: { application: [{ $: { 'android:resizeableActivity': 'false' }, activity: [
    { $: { 'android:name': '.MainActivity', 'android:screenOrientation': 'portrait' } },
    { $: { 'android:name': '.OtherActivity', 'android:screenOrientation': 'portrait' } },
  ] }] } };
  removeLegacyWindowAttributes(manifest);
  assert.equal(manifest.manifest.application[0].$['android:resizeableActivity'], undefined);
  assert.equal(manifest.manifest.application[0].activity[0].$['android:screenOrientation'], undefined);
  assert.equal(manifest.manifest.application[0].activity[1].$['android:screenOrientation'], 'portrait');
});

test('removes only deprecated system-bar color parameters from AppTheme', () => {
  const styles = { resources: { style: [
    { $: { name: 'AppTheme' }, item: [
      { $: { name: 'android:statusBarColor' }, _: '@android:color/transparent' },
      { $: { name: 'android:navigationBarColor' }, _: '@android:color/transparent' },
      { $: { name: 'colorPrimary' }, _: '@color/colorPrimary' },
    ] },
    { $: { name: 'OtherTheme' }, item: [{ $: { name: 'android:statusBarColor' } }] },
  ] } };
  removeLegacySystemBarColors(styles);
  assert.deepEqual(styles.resources.style[0].item.map((item) => item.$.name), ['colorPrimary']);
  assert.equal(styles.resources.style[1].item[0].$.name, 'android:statusBarColor');
});
