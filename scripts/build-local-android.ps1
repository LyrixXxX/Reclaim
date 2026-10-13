param(
  [string]$BuildRoot = 'C:\ReclaimBuild',
  [switch]$SyncOnly,
  [switch]$PlayBundle
)

$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$buildRootFull = [IO.Path]::GetFullPath($BuildRoot)
$markerPath = Join-Path $buildRootFull '.reclaim-local-build'
$credentialsPath = Join-Path $sourceRoot 'credentials.json'
$outputDirectory = Join-Path $sourceRoot 'dist'
$outputApk = Join-Path $outputDirectory 'Reclaim-android-release.apk'
$outputBundle = Join-Path $outputDirectory 'Reclaim-android-release.aab'

if (-not $SyncOnly) {
  try {
    $commitCounters = (Get-Counter '\Memory\Committed Bytes', '\Memory\Commit Limit' -ErrorAction Stop).CounterSamples
    $committed = ($commitCounters | Where-Object { $_.Path -like '*\memory\committed bytes' } | Select-Object -First 1).CookedValue
    $commitLimit = ($commitCounters | Where-Object { $_.Path -like '*\memory\commit limit' } | Select-Object -First 1).CookedValue
    if ($committed -and $commitLimit -and ($commitLimit - $committed) -lt 6GB) {
      $availableGB = [math]::Round(($commitLimit - $committed) / 1GB, 1)
      throw "Windows has only $availableGB GB of commit capacity available. Reclaim's native Android build needs more; close memory-heavy apps or restart Windows before retrying. Free physical RAM alone does not indicate available commit capacity."
    }
  } catch {
    if ($_.Exception.Message -like 'Windows has only *') { throw }
    Write-Warning 'Could not check Windows commit capacity; continuing with the build.'
  }
}

if (Test-Path -LiteralPath $buildRootFull) {
  $existing = Get-Item -LiteralPath $buildRootFull -Force
  if (($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$buildRootFull must be a real folder, not a directory link."
  }
  if (-not (Test-Path -LiteralPath $markerPath)) {
    throw "$buildRootFull already exists but is not marked as Reclaim's temporary build folder."
  }
} else {
  New-Item -ItemType Directory -Path $buildRootFull | Out-Null
  Set-Content -LiteralPath $markerPath -Value 'Reclaim local Android build cache. Safe to delete when no build is running.'
}

Write-Host 'Synchronizing Reclaim into the short-path Android build cache...'
& robocopy $sourceRoot $buildRootFull /E /XD '.git' 'dist' '.gradle' '.cxx' 'build' '.npm-task-cache' '.expo-task-home' /XF '.reclaim-local-build' /NFL /NDL /NJH /NJS /NP
$robocopyExitCode = $LASTEXITCODE
if ($robocopyExitCode -ge 8) {
  throw "Unable to synchronize the build cache (robocopy exit code $robocopyExitCode)."
}
if (-not (Test-Path -LiteralPath $markerPath)) {
  Set-Content -LiteralPath $markerPath -Value 'Reclaim local Android build cache. Safe to delete when no build is running.'
}

# Robocopy's /XD matching applies to nested folders too. The general sync excludes
# generated "build" directories, but npm packages can also contain required source
# files in folders with that name (for example, Expo config plugins). Refresh the
# complete dependency tree whenever package-lock.json changes, then remove only
# native Android build caches that may contain paths from the source checkout.
$sourcePackageLock = Join-Path $sourceRoot 'package-lock.json'
$dependencyMarker = Join-Path $buildRootFull '.reclaim-package-lock.sha256'
$packageLockHash = (Get-FileHash -LiteralPath $sourcePackageLock -Algorithm SHA256).Hash
$cachedPackageLockHash = if (Test-Path -LiteralPath $dependencyMarker) { (Get-Content -Raw -LiteralPath $dependencyMarker).Trim() } else { '' }
if ($packageLockHash -ne $cachedPackageLockHash) {
  Write-Host 'Refreshing local build dependencies after a package change...'
  $sourceNodeModules = [IO.Path]::GetFullPath((Join-Path $sourceRoot 'node_modules'))
  $cachedNodeModules = [IO.Path]::GetFullPath((Join-Path $buildRootFull 'node_modules'))
  if (-not $cachedNodeModules.StartsWith($buildRootFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to refresh dependencies outside $buildRootFull."
  }
  & robocopy $sourceNodeModules $cachedNodeModules /MIR /XD '.cxx' '.cache' /NFL /NDL /NJH /NJS /NP | Out-Null
  $dependencyCopyExitCode = $LASTEXITCODE
  if ($dependencyCopyExitCode -ge 8) {
    throw "Unable to refresh build dependencies (robocopy exit code $dependencyCopyExitCode)."
  }
  $generatedPackageCaches = Get-ChildItem -LiteralPath $cachedNodeModules -Directory -Filter 'build' -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Parent.Name -eq 'android' } |
    Sort-Object { $_.FullName.Length } -Descending
  foreach ($cache in $generatedPackageCaches) {
    $cachePath = [IO.Path]::GetFullPath($cache.FullName)
    if (-not $cachePath.StartsWith($cachedNodeModules, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove a dependency cache outside $cachedNodeModules."
    }
    Remove-Item -LiteralPath $cachePath -Recurse -Force
  }
  Set-Content -LiteralPath $dependencyMarker -Value $packageLockHash
}

# Native config plugins must be reapplied when Android permissions or packages change.
$nativeConfigMarker = Join-Path $buildRootFull '.reclaim-native-config.sha256'
$appConfigHash = (Get-FileHash -LiteralPath (Join-Path $buildRootFull 'app.json') -Algorithm SHA256).Hash
$dynamicConfigHash = (Get-FileHash -LiteralPath (Join-Path $buildRootFull 'app.config.js') -Algorithm SHA256).Hash
# Local phone builds show Google's non-revenue sample banner by default.
# An explicit 0 keeps ads off; live monetization always uses its own setup.
if ([string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED) -and $env:EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED -ne '1') {
  $env:EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED = '1'
  Write-Host 'Google test ads are enabled for this local build.'
}
$testAdsEnabled = $env:EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED -eq '1'
if ($testAdsEnabled -and $env:EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED -eq '1') {
  throw 'Choose either Google test ads or live monetization; both flags cannot be enabled.'
}
$admobAppId = if ($testAdsEnabled) { 'ca-app-pub-3940256099942544~3347511713' } else { [string]$env:EXPO_PUBLIC_ADMOB_APP_ID }
if ($env:EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED -eq '1' -and ([string]::IsNullOrWhiteSpace($admobAppId) -or $admobAppId.StartsWith('ca-app-pub-3940256099942544'))) {
  throw 'Live monetization requires your own AdMob app ID. Google test IDs cannot be used for release.'
}
if ($env:EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED -eq '1') {
  if ([string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_ADMOB_BANNER_ID) -or [string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL) -or -not ([string]$env:EXPO_PUBLIC_RECLAIM_PRIVACY_URL).StartsWith('https://') -or -not ([string]$env:EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL).StartsWith('https://')) {
    throw 'Live monetization requires an AdMob banner ID, support email, public HTTPS privacy URL, and HTTPS purchase verifier URL.'
  }
  if (([string]$env:EXPO_PUBLIC_ADMOB_BANNER_ID).StartsWith('ca-app-pub-3940256099942544')) {
    throw 'Live monetization cannot use a Google test banner ID.'
  }
}
# The Android ads Gradle project reads app.json directly, independently of
# Expo's config plugin. Keep its build-time ID aligned with the manifest ID.
if (-not [string]::IsNullOrWhiteSpace($admobAppId)) {
  $cachedAppJsonPath = Join-Path $buildRootFull 'app.json'
  $cachedAppJson = Get-Content -Raw -LiteralPath $cachedAppJsonPath | ConvertFrom-Json
  $cachedAppJson.'react-native-google-mobile-ads'.android_app_id = $admobAppId
  $cachedAppJson | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $cachedAppJsonPath
}
$nativeConfigHash = "$appConfigHash-$dynamicConfigHash-$packageLockHash-$admobAppId"
$cachedNativeConfigHash = if (Test-Path -LiteralPath $nativeConfigMarker) { (Get-Content -Raw -LiteralPath $nativeConfigMarker).Trim() } else { '' }
if ($nativeConfigHash -ne $cachedNativeConfigHash) {
  Write-Host 'Updating Android native configuration for installed packages and permissions...'
  $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
  Push-Location $buildRootFull
  try {
    & $nodeExecutable (Join-Path $buildRootFull 'node_modules\expo\bin\cli') prebuild --platform android --no-install --no-clean
    if ($LASTEXITCODE -ne 0) { throw "Android native configuration failed with exit code $LASTEXITCODE." }
  } finally { Pop-Location }
  Set-Content -LiteralPath $nativeConfigMarker -Value $nativeConfigHash
}

# Expo's incremental prebuild can leave an older checked-in manifest intact.
# Route recording schedules a persistent Android job; without this permission
# the phone force-closes Reclaim on the first location update.
$androidManifestPath = Join-Path $buildRootFull 'android\app\src\main\AndroidManifest.xml'
if (-not (Test-Path -LiteralPath $androidManifestPath) -or
    -not (Select-String -LiteralPath $androidManifestPath -Pattern '<uses-permission\s+android:name="android.permission.RECEIVE_BOOT_COMPLETED"' -Quiet)) {
  throw 'Android manifest is missing RECEIVE_BOOT_COMPLETED. Refusing to build a release that crashes when a route starts.'
}

# The source checkout contains an older generated android/gradle.properties.
# Robocopy updates the short-path build copy on every run, so restore this
# config-plugin value even when prebuild is skipped by the hash check.
$gradlePropertiesPath = Join-Path $buildRootFull 'android\gradle.properties'
if (-not (Test-Path -LiteralPath $gradlePropertiesPath)) {
  throw 'The generated Android Gradle properties file is missing.'
}
$gradleProperties = Get-Content -Raw -LiteralPath $gradlePropertiesPath
if ($gradleProperties -match '(?m)^android\.minSdkVersion=') {
  $gradleProperties = $gradleProperties -replace '(?m)^android\.minSdkVersion=.*$', 'android.minSdkVersion=26'
} else {
  $gradleProperties = $gradleProperties.TrimEnd() + "`r`nandroid.minSdkVersion=26`r`n"
}
Set-Content -LiteralPath $gradlePropertiesPath -Value $gradleProperties

$generatedAutolinking = @(
  (Join-Path $buildRootFull 'android\build\generated\autolinking'),
  (Join-Path $buildRootFull 'android\app\build\generated\autolinking')
)
foreach ($generatedDirectory in $generatedAutolinking) {
  if (Test-Path -LiteralPath $generatedDirectory) {
    Remove-Item -LiteralPath $generatedDirectory -Recurse -Force
  }
}

$cacheVersionMarker = Join-Path $buildRootFull '.reclaim-short-path-cache-v3'
if (-not (Test-Path -LiteralPath $cacheVersionMarker)) {
  Write-Host 'Migrating generated native caches to the short build path...'
  $nativeCaches = Get-ChildItem -LiteralPath $buildRootFull -Directory -Filter '.cxx' -Recurse -Force -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Length } -Descending
  foreach ($cache in $nativeCaches) {
    $cachePath = [IO.Path]::GetFullPath($cache.FullName)
    if (-not $cachePath.StartsWith($buildRootFull, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove a native cache outside $buildRootFull."
    }
    Remove-Item -LiteralPath $cachePath -Recurse -Force
  }
  Set-Content -LiteralPath $cacheVersionMarker -Value 'Native caches generated from the C:\ReclaimBuild short path.'
}

if ($SyncOnly) {
  Write-Host ''
  Write-Host 'Reclaim development workspace synchronized successfully.' -ForegroundColor Green
  Write-Host "Android Studio project: $buildRootFull\android"
  Write-Host 'Edit app source in the original Reclaim folder, not in this generated build cache.'
  return
}

# EXPO_PUBLIC_ values are embedded into the JS bundle. Gradle does not track
# shell environment changes as inputs, so a changed key must invalidate that
# bundle explicitly. Validate the key before starting a long native build.
$stadiaKey = [string]$env:EXPO_PUBLIC_STADIA_MAPS_KEY
if ([string]::IsNullOrWhiteSpace($stadiaKey) -or $stadiaKey -match '^\s*(<|PASTE_|your-|YOUR-)') {
  throw 'Set EXPO_PUBLIC_STADIA_MAPS_KEY to your real Stadia Maps API key in this PowerShell window before building.'
}
Write-Host 'Checking Stadia Maps access (the key will not be printed)...'
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$tileStatus = & $nodeExecutable --input-type=module -e "try { const response = await fetch('https://tiles.stadiamaps.com/tiles/outdoors/1/1/1.png', { headers: { Authorization: 'Stadia-Auth ' + process.env.EXPO_PUBLIC_STADIA_MAPS_KEY }, signal: AbortSignal.timeout(20000) }); await response.arrayBuffer(); console.log(response.status); if (!response.ok) process.exitCode = 1; } catch { process.exitCode = 2; }"
if ($LASTEXITCODE -ne 0) {
  if ($tileStatus -eq '401' -or $tileStatus -eq '403') {
    throw "Stadia Maps rejected this key (HTTP $tileStatus). Check that it is an active Stadia Maps API key for the selected property. No Android release was built."
  }
  throw 'Could not verify Stadia Maps access. Check the internet connection and key in this PowerShell window. No Android release was built.'
}
Write-Host 'Stadia Maps access verified.'
$keyBytes = [Text.Encoding]::UTF8.GetBytes($stadiaKey)
$sha = [Security.Cryptography.SHA256]::Create()
try { $stadiaKeyHash = [BitConverter]::ToString($sha.ComputeHash($keyBytes)).Replace('-', '') } finally { $sha.Dispose(); [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
$stadiaKey = $null
$stadiaMarker = Join-Path $buildRootFull '.reclaim-stadia-key.sha256'
$previousStadiaHash = if (Test-Path -LiteralPath $stadiaMarker) { (Get-Content -Raw -LiteralPath $stadiaMarker).Trim() } else { '' }
if ($stadiaKeyHash -ne $previousStadiaHash) {
  $bundlePath = [IO.Path]::GetFullPath((Join-Path $buildRootFull 'android\app\build\generated\assets\react\release\index.android.bundle'))
  $expectedBundlePrefix = [IO.Path]::GetFullPath((Join-Path $buildRootFull 'android\app\build\generated\assets\react\release')) + [IO.Path]::DirectorySeparatorChar
  if (-not $bundlePath.StartsWith($expectedBundlePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to invalidate a bundle outside the Reclaim build cache.' }
  if (Test-Path -LiteralPath $bundlePath) { Remove-Item -LiteralPath $bundlePath -Force }
  Write-Host 'Stadia key changed; refreshing the bundled app code.'
}

$monetizationValues = @(
  [string]$env:EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED,
  [string]$env:EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED,
  [string]$env:EXPO_PUBLIC_RECLAIM_PRIVACY_URL,
  [string]$env:EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL,
  [string]$env:EXPO_PUBLIC_ADMOB_BANNER_ID,
  [string]$env:EXPO_PUBLIC_ADMOB_APP_ID,
  [string]$env:EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL
) -join '|'
$monetizationHashBytes = [Text.Encoding]::UTF8.GetBytes($monetizationValues)
$monetizationSha = [Security.Cryptography.SHA256]::Create()
try { $monetizationHash = [BitConverter]::ToString($monetizationSha.ComputeHash($monetizationHashBytes)).Replace('-', '') } finally { $monetizationSha.Dispose(); [Array]::Clear($monetizationHashBytes, 0, $monetizationHashBytes.Length) }
$monetizationMarker = Join-Path $buildRootFull '.reclaim-monetization.sha256'
$previousMonetizationHash = if (Test-Path -LiteralPath $monetizationMarker) { (Get-Content -Raw -LiteralPath $monetizationMarker).Trim() } else { '' }
if ($monetizationHash -ne $previousMonetizationHash) {
  $bundlePath = [IO.Path]::GetFullPath((Join-Path $buildRootFull 'android\app\build\generated\assets\react\release\index.android.bundle'))
  $expectedBundlePrefix = [IO.Path]::GetFullPath((Join-Path $buildRootFull 'android\app\build\generated\assets\react\release')) + [IO.Path]::DirectorySeparatorChar
  if (-not $bundlePath.StartsWith($expectedBundlePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to invalidate a bundle outside the Reclaim build cache.' }
  if (Test-Path -LiteralPath $bundlePath) { Remove-Item -LiteralPath $bundlePath -Force }
  Write-Host 'Monetization configuration changed; refreshing the bundled app code.'
}

if (-not (Test-Path -LiteralPath $credentialsPath)) {
  throw 'credentials.json is missing. Download Android credentials from EAS first.'
}

$credentials = Get-Content -Raw -LiteralPath (Join-Path $buildRootFull 'credentials.json') | ConvertFrom-Json
$keystore = $credentials.android.keystore
if (-not $keystore) { throw 'Android keystore settings are missing from credentials.json.' }
$keystorePath = Join-Path $buildRootFull $keystore.keystorePath
if (-not (Test-Path -LiteralPath $keystorePath)) { throw "Keystore file is missing: $keystorePath" }

$gradleFile = Join-Path $buildRootFull 'android\app\build.gradle'
if (-not (Test-Path -LiteralPath $gradleFile) -or -not (Select-String -LiteralPath $gradleFile -SimpleMatch 'RECLAIM_STORE_FILE' -Quiet)) {
  throw 'The generated Android project is missing the Reclaim release-signing configuration.'
}

$env:RECLAIM_STORE_FILE = (Resolve-Path -LiteralPath $keystorePath).Path
$env:RECLAIM_STORE_PASSWORD = $keystore.keystorePassword
$env:RECLAIM_KEY_ALIAS = $keystore.keyAlias
$env:RECLAIM_KEY_PASSWORD = $keystore.keyPassword
$privateJavaHome = Get-ChildItem -LiteralPath (Join-Path $buildRootFull '.jdk21-runtime') -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'lib\jvm.cfg') } |
  Select-Object -First 1
$javaHomeCandidates = @(
  $privateJavaHome.FullName,
  'C:\Program Files\Android\Android Studio1\jbr',
  'C:\Program Files\Android\Android Studio\jbr'
)
$env:JAVA_HOME = $javaHomeCandidates |
  Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'lib\jvm.cfg')) } |
  Select-Object -First 1
if (-not $env:JAVA_HOME) { throw 'A complete Android Studio Java runtime was not found.' }
$env:ANDROID_HOME = 'C:\Users\TJ\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $env:USERPROFILE '.android'
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle'
$env:NODE_ENV = 'production'

$androidDirectory = Join-Path $buildRootFull 'android'
# Expo SDK 57 uses NDK r27b. An explicit path avoids an Android Gradle
# NDK-discovery crash on this Windows installation.
$ndkDirectory = Join-Path $env:ANDROID_HOME 'ndk\27.1.12297006'
if (-not (Test-Path -LiteralPath (Join-Path $ndkDirectory 'source.properties'))) {
  throw "Required Android NDK 27.1.12297006 is not installed: $ndkDirectory"
}
$localPropertiesPath = Join-Path $androidDirectory 'local.properties'
$ndkLine = 'ndk.dir=' + $ndkDirectory.Replace('\', '\\').Replace(':', '\:')
$localProperties = if (Test-Path -LiteralPath $localPropertiesPath) { Get-Content -Raw -LiteralPath $localPropertiesPath } else { '' }
if ($localProperties -match '(?m)^ndk\.dir=') {
  $localProperties = $localProperties -replace '(?m)^ndk\.dir=.*$', $ndkLine
} else {
  $localProperties = $localProperties.TrimEnd() + "`r`n" + $ndkLine + "`r`n"
}
Set-Content -LiteralPath $localPropertiesPath -Value $localProperties
$gradle = Join-Path $androidDirectory 'gradlew.bat'
$previousJavaToolOptions = [Environment]::GetEnvironmentVariable('JAVA_TOOL_OPTIONS', 'Process')
# Android's Prefab CLI starts separate Java processes while configuring CMake.
# Without a cap they can each reserve a multi-gigabyte heap and exhaust Windows
# commit memory alongside Metro and Gradle. Serial GC avoids the large G1
# reservation that fails when Windows paging space is tight. Gradle's explicit
# 2 GB heap remains, while standalone Prefab helpers use the smaller cap.
$env:JAVA_TOOL_OPTIONS = (($previousJavaToolOptions, '-Xms64m -Xmx384m -XX:+UseSerialGC') | Where-Object { $_ }) -join ' '
Push-Location $androidDirectory
try {
  Write-Host 'Generating React Native autolinking files...'
  & $gradle :app:generateAutolinkingNewArchitectureFiles --no-daemon --no-parallel --max-workers=1 --stacktrace
  if ($LASTEXITCODE -ne 0) { throw "Autolinking generation failed with exit code $LASTEXITCODE." }

  $releaseTask = if ($PlayBundle) { 'bundleRelease' } else { 'assembleRelease' }
  $releaseKind = if ($PlayBundle) { 'App Bundle for Google Play' } else { 'APK' }
  Write-Host "Building the signed Android release $releaseKind..."
  & $gradle $releaseTask --no-daemon --no-parallel --max-workers=1 --stacktrace
  if ($LASTEXITCODE -ne 0) { throw "Android build failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
  Remove-Item Env:RECLAIM_STORE_FILE, Env:RECLAIM_STORE_PASSWORD, Env:RECLAIM_KEY_ALIAS, Env:RECLAIM_KEY_PASSWORD, Env:NODE_ENV -ErrorAction SilentlyContinue
  if ($null -eq $previousJavaToolOptions) { Remove-Item Env:JAVA_TOOL_OPTIONS -ErrorAction SilentlyContinue }
  else { $env:JAVA_TOOL_OPTIONS = $previousJavaToolOptions }
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if ($PlayBundle) {
  $builtBundle = Join-Path $buildRootFull 'android\app\build\outputs\bundle\release\app-release.aab'
  if (-not (Test-Path -LiteralPath $builtBundle)) { throw 'Gradle completed but the App Bundle was not found.' }
  $jarsigner = Join-Path $env:JAVA_HOME 'bin\jarsigner.exe'
  if (-not (Test-Path -LiteralPath $jarsigner)) { throw 'Java jarsigner was not found for App Bundle signature verification.' }
  $signatureResult = & $jarsigner -verify $builtBundle 2>&1
  if ($LASTEXITCODE -ne 0 -or -not (($signatureResult -join "`n") -match 'jar verified\.')) {
    throw 'The App Bundle was created but its upload signature could not be verified.'
  }
  Copy-Item -LiteralPath $builtBundle -Destination $outputBundle -Force
  $outputArtifact = $outputBundle
} else {
  $builtApk = Join-Path $buildRootFull 'android\app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path -LiteralPath $builtApk)) { throw 'Gradle completed but the APK was not found.' }
  $aapt = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\aapt.exe'
  if (-not (Test-Path -LiteralPath $aapt)) { throw 'Android aapt was not found for APK permission verification.' }
  $apkPermissions = & $aapt dump permissions $builtApk
  if ($LASTEXITCODE -ne 0 -or -not ($apkPermissions -match 'android.permission.RECEIVE_BOOT_COMPLETED')) {
    throw 'The built APK is missing RECEIVE_BOOT_COMPLETED. Refusing to publish the crashing APK.'
  }
  Copy-Item -LiteralPath $builtApk -Destination $outputApk -Force
  $apksigner = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat'
  if (-not (Test-Path -LiteralPath $apksigner)) { throw 'Android apksigner was not found.' }
  & $apksigner verify --verbose $outputApk | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The APK was created but its Android signature could not be verified.' }
  $outputArtifact = $outputApk
}
Set-Content -LiteralPath $stadiaMarker -Value $stadiaKeyHash
Set-Content -LiteralPath $monetizationMarker -Value $monetizationHash

$sizeMb = [Math]::Round((Get-Item -LiteralPath $outputArtifact).Length / 1MB, 1)
Write-Host ''
Write-Host 'Reclaim Android build completed successfully.' -ForegroundColor Green
Write-Host "$($releaseKind): $outputArtifact"
Write-Host "Size: $sizeMb MB"
Write-Host 'Signature: verified'
if ($PlayBundle) {
  Write-Host 'Upload this .aab file to Google Play Console > Test and release > Testing > Internal testing.'
} else {
  Write-Host 'Install this APK over the existing app. Do not uninstall Reclaim first.'
}
