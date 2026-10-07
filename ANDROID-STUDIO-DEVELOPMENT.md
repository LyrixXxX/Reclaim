# Reclaim Android development workflow

Android Studio is already installed at `C:\Program Files\Android\Android Studio` and Reclaim now includes `expo-dev-client`.

## One-time Android Studio setup

1. From the Reclaim folder, run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\build-local-android.ps1" -SyncOnly
   ```

2. Open Android Studio.
3. Choose **Open** and select `C:\ReclaimBuild\android`. This short build workspace avoids Windows CMake path-length failures. Continue editing the app only in the original Reclaim folder.
4. Allow Gradle Sync to finish. Use Android Studio's bundled JDK when prompted.
5. On the phone, enable Developer options, Wireless debugging, and **Pair device with pairing code**.
6. In Android Studio, open **Device Manager**, choose **Pair Devices Using Wi-Fi**, and follow the phone's pairing prompt.
7. Select the phone as the run target and run the `app` configuration once. This installs the development version of Reclaim. You can also use `scripts\install-development-build.ps1` from PowerShell.

The development build uses the separate Android package `com.greekkid60.reclaim.dev`. It cannot overwrite the signed everyday-use release or its private data.

## Fast Refresh after the one-time install

Run:

```powershell
cd "C:\Users\TJ\Documents\Codex\2026-07-26\create-an-expo-react-native-typescript\outputs\Reclaim"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-development-server.ps1"
```

Open the development Reclaim app while the PC and phone are on the same network. Most TypeScript and visual changes will refresh without building or transferring another APK.

## Reinstall after native changes

Native dependency, permission, or `app.json` changes require a new development build. With the phone paired or connected, run:

```powershell
cd "C:\Users\TJ\Documents\Codex\2026-07-26\create-an-expo-react-native-typescript\outputs\Reclaim"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-development-build.ps1"
```

Use Android Studio's **Logcat** window to inspect runtime crashes from `com.greekkid60.reclaim`.

If a package or native setting changes, synchronize `C:\ReclaimBuild` again before opening or building in Android Studio. Ordinary TypeScript and design changes use Fast Refresh and do not require another native build.
