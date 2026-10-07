package expo.modules.reclaimsteps

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

class StepBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED || !StepStore.enabled(context)) return
    val permitted = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
    if (permitted) try { StepService.start(context) } catch (_: Exception) { /* Reclaim will retry when opened. */ }
  }
}
