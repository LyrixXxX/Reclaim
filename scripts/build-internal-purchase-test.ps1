param(
  [string]$BuildRoot = 'C:\R'
)

$ErrorActionPreference = 'Stop'
$names = @(
  'EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL',
  'EXPO_PUBLIC_RECLAIM_PURCHASE_TESTING_ENABLED',
  'EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED',
  'EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED',
  'EXPO_PUBLIC_RECLAIM_PRIVACY_URL',
  'EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL'
)
$previous = @{}
foreach ($name in $names) {
  $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  $env:EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL = 'https://reclaim-play-purchases.reclaim-nutrition.workers.dev'
  $env:EXPO_PUBLIC_RECLAIM_PURCHASE_TESTING_ENABLED = '1'
  $env:EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED = '1'
  $env:EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED = '0'
  if ([string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_RECLAIM_PRIVACY_URL)) {
    $env:EXPO_PUBLIC_RECLAIM_PRIVACY_URL = 'https://reclaim-privacy-policy.pages.dev/'
  }
  if ([string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL)) {
    $env:EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL = 'Reclaim.LyrixStudios@gmail.com'
  }

  if ([string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL) -or
      -not ([string]$env:EXPO_PUBLIC_RECLAIM_PRIVACY_URL).StartsWith('https://')) {
    throw 'Purchase testing requires a support email and a public HTTPS privacy URL.'
  }

  & (Join-Path $PSScriptRoot 'build-local-android.ps1') -BuildRoot $BuildRoot -PlayBundle
} finally {
  foreach ($name in $names) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
  }
}
