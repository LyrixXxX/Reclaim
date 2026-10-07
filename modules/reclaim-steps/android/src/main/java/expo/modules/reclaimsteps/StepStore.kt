package expo.modules.reclaimsteps

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal object StepStore {
  private const val PREFS = "reclaim-step-counter-v1"
  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  fun today() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
  fun enabled(context: Context) = prefs(context).getBoolean("enabled", false)

  fun enable(context: Context) {
    if (!enabled(context)) prefs(context).edit().putBoolean("enabled", true).putLong("lastRaw", -1L)
      .putBoolean("incomplete:${today()}", true).apply()
  }

  fun disable(context: Context) {
    prefs(context).edit().putBoolean("enabled", false).putLong("lastRaw", -1L).apply()
  }

  fun noteInterrupted(context: Context) {
    prefs(context).edit().putBoolean("incomplete:${today()}", true).putLong("lastRaw", -1L).apply()
  }

  @Synchronized fun record(context: Context, raw: Long, sampleAt: Long): Int {
    val prefs = prefs(context)
    val date = today()
    val previousRaw = prefs.getLong("lastRaw", -1L)
    val existing = prefs.getInt("day:$date", 0)
    val delta = when {
      previousRaw < 0 -> 0L
      raw < previousRaw -> 0L // Reboot reset the counter; the missed interval is unknown.
      else -> raw - previousRaw
    }.coerceAtLeast(0L)
    val incomplete = previousRaw >= 0 && raw < previousRaw
    val count = (existing.toLong() + delta).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    prefs.edit().putInt("day:$date", count).putLong("lastRaw", raw)
      .putString("lastDate", date).putLong("lastSampleAt", sampleAt)
      .putBoolean("incomplete:$date", prefs.getBoolean("incomplete:$date", false) || incomplete).apply()
    return count
  }

  fun status(context: Context, available: Boolean, running: Boolean): Map<String, Any> {
    val prefs = prefs(context)
    val date = today()
    return mapOf(
      "available" to available,
      "enabled" to enabled(context),
      "running" to running,
      "count" to prefs.getInt("day:$date", 0),
      "date" to date,
      "lastSampleAt" to prefs.getLong("lastSampleAt", 0L),
      "incomplete" to (prefs.getBoolean("incomplete:$date", false) ||
        (enabled(context) && !running && prefs.getString("lastDate", null) != date))
    )
  }

  @Synchronized fun history(context: Context): List<Map<String, Any>> = prefs(context).all.keys
    .filter { it.startsWith("day:") }
    .map { it.removePrefix("day:") }
    .sortedDescending()
    .map { date ->
      mapOf("date" to date, "count" to prefs(context).getInt("day:$date", 0),
        "incomplete" to prefs(context).getBoolean("incomplete:$date", false))
    }

  @Synchronized fun restoreHistory(context: Context, entries: List<Map<String, Any>>) {
    val prefs = prefs(context)
    val editor = prefs.edit()
    prefs.all.keys.filter { it.startsWith("day:") || it.startsWith("incomplete:") }
      .forEach { editor.remove(it) }
    entries.forEach { entry ->
      val date = entry["date"] as String
      editor.putInt("day:$date", (entry["count"] as Number).toInt())
      editor.putBoolean("incomplete:$date", entry["incomplete"] as Boolean)
    }
    editor.putLong("lastRaw", -1L).remove("lastDate").apply()
  }
}
