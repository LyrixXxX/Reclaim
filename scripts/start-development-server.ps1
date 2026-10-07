$ErrorActionPreference = 'Stop'
$physicalRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$node = 'C:\Program Files\nodejs\node.exe'
$expo = Join-Path $physicalRoot 'node_modules\expo\bin\cli'

if (-not (Test-Path -LiteralPath $node)) { throw "Node.js was not found at $node." }
if (-not (Test-Path -LiteralPath $expo)) { throw 'Expo is not installed. Run npm install in the Reclaim project first.' }

$privateJavaHome = Get-ChildItem -LiteralPath 'C:\ReclaimBuild\.jdk21-runtime' -Directory -ErrorAction SilentlyContinue |
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

Push-Location $physicalRoot
try {
  Write-Host 'Starting Reclaim for the installed development app...' -ForegroundColor Green
  Write-Host 'Keep this window open while using Fast Refresh on your phone.'
  & $node $expo start --dev-client --lan
  if ($LASTEXITCODE -ne 0) { throw "Expo development server stopped with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}
