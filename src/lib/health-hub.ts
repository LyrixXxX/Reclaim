import { TrackerState } from '@/models/tracker';
import { dashboardContent } from './dashboard-content';
import { homeOverview } from './home-overview';
import { localDateKey } from './progress';
import { medicationIsActiveOnDate } from './medications';

/** Read-only summaries of the same records used by each full tracker screen. */
export function healthHubSummary(state: TrackerState, now: Date) {
  const today = localDateKey(now);
  const readings = [...(state.healthReadings ?? [])]
    .filter((reading) => Number.isFinite(Date.parse(reading.measuredAt)) && Date.parse(reading.measuredAt) <= now.getTime())
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
  const activeMedications = (state.medications ?? []).filter((medication) => medicationIsActiveOnDate(medication, today));
  const medicationStatus = homeOverview(state, { status: 'unsupported' }, now).medications;
  const nextDoses = dashboardContent(state, { id: 'medications', visible: true, expanded: true }, now).rows;
  const trackedLabs = state.labTrackers ?? [];
  const results = [...(state.labResults ?? [])].filter((result) => result.panelDate <= today)
    .sort((a, b) => b.panelDate.localeCompare(a.panelDate) || (b.resultTime ?? '').localeCompare(a.resultTime ?? '') || b.recordedAt.localeCompare(a.recordedAt));
  const latestByTracker = new Set<string>();
  const recentLabs = results.filter((result) => {
    const key = result.labTrackerId ?? result.marker.toLowerCase();
    if (latestByTracker.has(key)) return false;
    latestByTracker.add(key);
    return true;
  }).slice(0, 2).map((result) => ({ ...result, name: trackedLabs.find((tracker) => tracker.id === result.labTrackerId)?.name ?? result.marker }));
  return { readings, activeMedications, medicationStatus, nextDoses, trackedLabs, results, recentLabs };
}
