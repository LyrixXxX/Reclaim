package expo.modules.reclaimsteps

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import java.util.Calendar
import java.util.Locale

class StepService : Service(), SensorEventListener {
  private lateinit var sensors: SensorManager
  private var sensor: Sensor? = null
  private var stepDetector: Sensor? = null
  private val handler = Handler(Looper.getMainLooper())
  private val midnightUpdate = object : Runnable {
    override fun run() {
      if (!running) return
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
        .notify(NOTIFICATION, notification(StepStore.status(this@StepService, true, true)["count"] as Int))
      scheduleMidnightUpdate()
    }
  }

  override fun onCreate() {
    super.onCreate()
    sensors = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    sensor = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    stepDetector = sensors.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!StepStore.enabled(this) || sensor == null ||
      (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED)) {
      stopSelf()
      return START_NOT_STICKY
    }
    val notifications = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    notifications.createNotificationChannel(NotificationChannel(CHANNEL, "Daily step tracking", NotificationManager.IMPORTANCE_LOW))
    startForeground(NOTIFICATION, notification(StepStore.status(this, true, true)["count"] as Int))
    running = true
    sensors.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
    stepDetector?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    scheduleMidnightUpdate()
    return START_STICKY
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type == Sensor.TYPE_STEP_DETECTOR) {
      val stepAt = System.currentTimeMillis() - (SystemClock.elapsedRealtimeNanos() - event.timestamp) / 1_000_000L
      if (stepAt in (System.currentTimeMillis() - 86_400_000L)..(System.currentTimeMillis() + 5_000L)) StepStore.recordWalkingStep(this, stepAt)
      return
    }
    if (event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
    val count = StepStore.record(this, event.values[0].toLong(), System.currentTimeMillis())
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION, notification(count))
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    handler.removeCallbacks(midnightUpdate)
    sensors.unregisterListener(this)
    if (StepStore.enabled(this)) StepStore.noteInterrupted(this)
    running = false
    super.onDestroy()
  }

  private fun scheduleMidnightUpdate() {
    handler.removeCallbacks(midnightUpdate)
    val next = Calendar.getInstance().apply {
      add(Calendar.DAY_OF_YEAR, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 1)
      set(Calendar.MILLISECOND, 0)
    }
    handler.postDelayed(midnightUpdate, (next.timeInMillis - System.currentTimeMillis()).coerceAtLeast(1000L))
  }

  private fun notification(count: Int): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    return Notification.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_directions)
      .setContentTitle("Reclaim is counting steps")
      .setContentText("Today: ${String.format(Locale.US, "%,d", count)} steps")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(pending)
      .build()
  }

  companion object {
    private const val CHANNEL = "reclaim-steps"
    private const val NOTIFICATION = 5834
    @Volatile var running = false
      private set
    fun intent(context: Context) = Intent(context, StepService::class.java)
    fun start(context: Context) { ContextCompat.startForegroundService(context, intent(context)) }
  }
}
