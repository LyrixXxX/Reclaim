# Local Android build

Run this from PowerShell after Reclaim has been updated:

```powershell
cd "C:\Users\TJ\Documents\Codex\2026-07-26\create-an-expo-react-native-typescript\outputs\Reclaim"
$env:EXPO_PUBLIC_STADIA_MAPS_KEY = '<your Stadia Maps mobile key>'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\build-local-android.ps1"
```

The script synchronizes the project into the short-path build cache at
`C:\ReclaimBuild`, creates a signed release APK with the saved EAS keystore,
verifies the APK signature, and copies the result to:

`dist\Reclaim-android-release.apk`

The build checks Stadia Maps access before compiling and stops if the key is
rejected. Changing the key refreshes the bundled app code automatically. Set the
key in the same PowerShell window used to start the build; do not paste it into
the repository or a screenshot.

Upload that APK to Google Drive and install it over the existing Reclaim app.
Do not uninstall the existing app first, because Reclaim stores its data locally.

The `credentials.json` file and `credentials` folder must remain in the project.
They are excluded from Git and should not be shared.

The Stadia Maps key is configured once per app build, not by each user. Keep the
real value out of the repository and screenshots. Monitor requests and billing in
the Stadia dashboard, and rotate the key there before wider distribution or if it
is misused. A key embedded in an Android app can be extracted; it is not a secret.
Offline map areas are optional and managed in Reclaim Settings. Saved routes are
included in backups, but downloaded map tiles must be downloaded again after a
restore.
