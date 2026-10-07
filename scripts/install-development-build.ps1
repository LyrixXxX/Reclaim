$ErrorActionPreference = 'Stop'
$physicalRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$buildRoot = 'C:\ReclaimBuild'
$syncScript = Join-Path $PSScriptRoot 'build-local-android.ps1'

& $syncScript -BuildRoot $buildRoot -SyncOnly

$privateJavaHome = Get-ChildItem -LiteralPath (Join-Path $buildRoot '.jdk21-runtime') -Directory -ErrorAction SilentlyContinue |
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
$env:NODE_ENV = 'development'

$androidDirectory = Join-Path $buildRoot 'android'
$gradle = Join-Path $androidDirectory 'gradlew.bat'
Push-Location $androidDirectory
try {
  Write-Host 'Building and installing the separate Reclaim development app...' -ForegroundColor Green
  & $gradle :app:installDebug -PreactNativeArchitectures=arm64-v8a
  if ($LASTEXITCODE -ne 0) { throw "Android development build failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
}
