// Package the supplied artwork without redrawing it. Run from any directory.
const Jimp = require('jimp-compact');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets/images');

async function main() {
  const artwork = await Jimp.read(path.join(assets, 'reclaim-icon-source.png'));
  await artwork.clone().resize(1024, 1024).writeAsync(path.join(assets, 'reclaim-icon.png'));
  // Apple and the Play listing get an opaque icon; Android and in-app marks keep the source alpha.
  const opaqueIcon = new Jimp(1024, 1024, 0x000000ff).composite(artwork.clone().resize(1024, 1024), 0, 0);
  await opaqueIcon.writeAsync(path.join(assets, 'reclaim-icon-ios.png'));
  await opaqueIcon.clone().resize(512, 512).writeAsync(path.join(assets, 'reclaim-play-store-icon.png'));
  // Android adaptive layers are 108dp; keep the ring inside the central 66dp so no launcher shape clips it.
  const foreground = new Jimp(1024, 1024, 0x00000000);
  foreground.composite(artwork.clone().resize(682, 682), 171, 171);
  await foreground.writeAsync(path.join(assets, 'reclaim-icon-foreground.png'));
  await artwork.clone().resize(64, 64).writeAsync(path.join(assets, 'reclaim-favicon.png'));
  // The native folders only exist in the build copy.
  if (!fs.existsSync(path.join(root, 'android/app/src/main/res'))) {
    console.log('Generated Reclaim icon assets. No android folder here, so density variants were skipped.');
    return;
  }
  for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
    const directory = path.join(root, 'android/app/src/main/res', `mipmap-${density}`);
    await artwork.clone().resize(48 * scale, 48 * scale).writeAsync(path.join(directory, 'reclaim_icon.png'));
    await artwork.clone().resize(48 * scale, 48 * scale).circle().writeAsync(path.join(directory, 'reclaim_icon_round.png'));
    await foreground.clone().resize(108 * scale, 108 * scale).writeAsync(path.join(directory, 'reclaim_foreground.png'));
    const splash = new Jimp(288 * scale, 288 * scale, 0x00000000);
    splash.composite(artwork.clone().resize(120 * scale, 120 * scale), 84 * scale, 84 * scale);
    await splash.writeAsync(path.join(root, 'android/app/src/main/res', `drawable-${density}`, 'splashscreen_logo.png'));
  }
  console.log('Generated Reclaim icon assets and Android density variants.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
