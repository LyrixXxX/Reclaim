package expo.modules.reclaimsteps

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReclaimStepsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ReclaimSteps")

    AsyncFunction("getStatus") {
      val sensor = (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager)
        .getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      val permission = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
      if (sensor != null && permission && StepStore.enabled(context) && !StepService.running) {
        StepStore.noteInterrupted(context)
        StepService.start(context)
      }
      StepStore.status(context, sensor != null, StepService.running)
    }

    AsyncFunction("start") {
      val sensor = (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager)
        .getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        ?: throw IllegalStateException("This phone does not have a hardware step counter.")
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("Allow physical activity access to count steps.")
      }
      StepStore.enable(context)
      if (!StepService.running) StepStore.noteInterrupted(context)
      StepService.start(context)
      StepStore.status(context, sensor != null, true)
    }

    AsyncFunction("stop") {
      StepStore.disable(context)
      context.stopService(StepService.intent(context))
      StepStore.status(context, true, false)
    }

    AsyncFunction("getHistory") { StepStore.history(context) }

    AsyncFunction("restoreHistory") { entries: List<Map<String, Any>> ->
      StepStore.restoreHistory(context, entries)
    }
  }
}
