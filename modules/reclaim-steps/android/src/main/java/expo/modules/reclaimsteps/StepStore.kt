package expo.modules.reclaimsteps

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.json.JSONArray

internal object StepStore {
  private const val PREFS = "reclaim-step-counter-v1"
  private const val WALK_GAP_MS = 15_000L
  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  fun today() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
  fun enabled(context: Context) = prefs(context).getBoolean("enabled", false)

  fun enable(context: Context) {
    if (!enabled(context)) prefs(context).edit().putBoolean("enabled", true).putLong("lastRaw", -1L)
      .putBoolean("incomplete:${today()}", true).apply()
  }

  fun disable(context: Context) {
    prefs(context).edit().putBoolean("enabled", false).putLong("lastRaw", -1L).remove("lastWalkStepAt").apply()
  }

  fun noteInterrupted(context: Context) {
    prefs(context).edit().putBoolean("incomplete:${today()}", true).putLong("lastRaw", -1L).remove("lastWalkStepAt").apply()
  }

  @Synchronized fun recordWalkingStep(context: Context, stepAt: Long) {
    val prefs = prefs(context)
    if (!enabled(context) || stepAt <= 0L) return
    val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(stepAt))
    val previous = prefs.getLong("lastWalkStepAt", -1L)
    val previousDate = if (previous > 0L) SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(previous)) else null
    val editor = prefs.edit().putLong("lastWalkStepAt", stepAt)
    if (previous > 0L && previousDate == date && stepAt > previous && stepAt - previous <= WALK_GAP_MS) {
      val intervals = try { JSONArray(prefs.getString("walk:$date", "[]")) } catch (_: Exception) { JSONArray() }
      val last = if (intervals.length() > 0) intervals.optJSONArray(intervals.length() - 1) else null
      if (last != null && last.optLong(1) == previous) last.put(1, stepAt)
      else intervals.put(JSONArray().put(previous).put(stepAt))
      editor.putString("walk:$date", intervals.toString())
    }
    editor.apply()
  }

  @Synchronized fun walkingIntervals(context: Context, date: String): List<Map<String, Long>> {
    if (!date.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) return emptyList()
    val intervals = try { JSONArray(prefs(context).getString("walk:$date", "[]")) } catch (_: Exception) { JSONArray() }
    return (0 until intervals.length()).mapNotNull { index ->
      val pair = intervals.optJSONArray(index) ?: return@mapNotNull null
      val start = pair.optLong(0)
      val end = pair.optLong(1)
      if (end > start) mapOf("startedAt" to start, "endedAt" to end) else null
    }
  }

  @Synchronized fun walkingHistory(context: Context): List<Map<String, Any>> = prefs(context).all.keys
    .filter { it.startsWith("walk:") }
    .map { it.removePrefix("walk:") }
    .sortedDescending()
    .map { date -> mapOf("date" to date, "intervals" to walkingIntervals(context, date)) }

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
    prefs.all.keys.filter { it.startsWith("day:") || it.startsWith("incomplete:") || it.startsWith("walk:") }
      .forEach { editor.remove(it) }
    entries.forEach { entry ->
      val date = entry["date"] as String
      editor.putInt("day:$date", (entry["count"] as Number).toInt())
      editor.putBoolean("incomplete:$date", entry["incomplete"] as Boolean)
    }
    editor.putLong("lastRaw", -1L).remove("lastDate").remove("lastWalkStepAt").apply()
  }
}
