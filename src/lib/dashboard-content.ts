import { DashboardWidget, TrackerState } from '@/models/tracker';
import { goalForDate, macroCalories, nutritionTotals } from './nutrition';
import { formatMedicationTime, medicationIsActiveOnDate } from './medications';
import { scheduledDosesForDate } from './medication-regimen';
import { localDateKey } from './progress';
import { completedCalendarDays, formatTaperQuitStart, taperQuitPhase, trackerJourneySection } from './taper-quit';
import { currentStreakFromEntries } from './recovery';
import { StepResult } from './activity-steps';
import { formatMiles } from './activity-units';
import { routeCaloriesForDate } from './activity';

export type DashboardContent = {
  value: string;
  caption: string;
  calorieStatus?: 'within' | 'over';
  rows: { label: string; value: string }[];
  trend?: { date: string; value: number }[];
  trendLabel?: string;
};
const number = (value: number) => Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
export function dashboardDate(date: string) {
  const parsed = new Date(date.length === 10 ? `${date}T12:00:00` : date);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
}
const minutes = (value: number) => `${Math.floor(Math.round(value) / 60)}h ${Math.round(value) % 60}m`;
const empty = (caption: string): DashboardContent => ({ value: 'No data yet', caption, rows: [] });

export function dashboardContent(state: TrackerState, widget: DashboardWidget, now: Date, steps?: StepResult): DashboardContent {
  const today = localDateKey(now);
  if (widget.id === 'activity') {
    const routes = [...(state.activityRoutes ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return { value: steps?.count !== undefined ? `${number(steps.count)} steps` : 'Steps not connected', caption: steps?.incomplete ? 'Today · count may be incomplete' : steps?.status === 'available' ? 'Today · phone step counter' : 'Open Activity to enable step tracking.', rows: routes[0] ? [{ label: `Latest ${routes[0].kind} · ${dashboardDate(routes[0].startedAt)}`, value: formatMiles(routes[0].distanceMeters) }] : [] };
  }
  if (widget.id === 'nutrition') {
    const entries = (state.nutritionEntries ?? []).filter((entry) => entry.eventDate === today);
    const goal = goalForDate(state.nutritionGoals ?? [], today);
    if (!entries.length) return empty(`Today · ${goal ? 'Your saved targets are ready.' : 'Set your targets in Nutrition.'}`);
    const totals = nutritionTotals(entries);
    const budget = goal ? macroCalories(goal) + routeCaloriesForDate(state.activityRoutes ?? [], today, state.preferences?.includeRouteCaloriesInNutrition ?? false) : null;
    const recordedDates = [...new Set((state.nutritionEntries ?? []).filter((entry) => entry.eventDate <= today).map((entry) => entry.eventDate))].sort().slice(-7);
    return { value: `${number(totals.calories)} kcal`, calorieStatus: budget !== null ? (totals.calories > budget ? 'over' : 'within') : undefined, caption: `Today · ${entries.length} food ${entries.length === 1 ? 'entry' : 'entries'}${budget !== null ? ` · ${number(budget)} kcal target` : ''}`,
      rows: ([['Carbs', 'carbsGrams'], ['Protein', 'proteinGrams'], ['Fat', 'fatGrams'], ['Fiber', 'fiberGrams']] as const).map(([label, key]) => ({ label, value: `${number(totals[key])}${goal ? ` / ${number(goal[key])}` : ''} g` })),
      trend: recordedDates.map((date) => ({ date, value: nutritionTotals(state.nutritionEntries ?? [], date).calories })), trendLabel: 'Calories logged · recorded days only' };
  }
  if (widget.id === 'cpap') {
    const readings = [...(state.cpapReadings ?? [])].filter((item) => item.sleepDate <= today).sort((a, b) => a.sleepDate.localeCompare(b.sleepDate));
    const latest = readings.at(-1);
    if (!latest) return empty('Scan your machine screen or enter a night in CPAP.');
    return { value: minutes(latest.usedMinutes), caption: `Latest recorded night · ${dashboardDate(latest.sleepDate)}`,
      rows: [{ label: 'AHI', value: number(latest.ahi) }, { label: 'Average leak', value: `${number(latest.averageLeak)} L/min` }],
      trend: readings.slice(-7).map((item) => ({ date: item.sleepDate, value: item.usedMinutes })), trendLabel: 'Therapy minutes · latest recorded nights' };
  }
  if (widget.id === 'weight') {
    const entries = [...(state.weightEntries ?? [])].filter((item) => item.date <= today).sort((a, b) => a.date.localeCompare(b.date));
    const latest = entries.at(-1);
    if (!latest) return empty('Add a weigh-in in Weight.');
    const recent = entries.filter((item) => item.unit === latest.unit).slice(-7);
    return { value: `${number(latest.weight)} ${latest.unit}`, caption: `Latest weigh-in · ${dashboardDate(latest.date)}`,
      rows: [{ label: `Average of latest ${recent.length} entries`, value: `${number(recent.reduce((sum, item) => sum + item.weight, 0) / recent.length)} ${latest.unit}` }],
      trend: recent.map((item) => ({ date: item.date, value: item.weight })), trendLabel: `Recorded weigh-ins · ${latest.unit}` };
  }
  if (widget.id === 'bloodPressure') {
    const latest = [...(state.healthReadings ?? [])].filter((item) => Date.parse(item.measuredAt) <= now.getTime()).sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0];
    if (!latest) return empty('Add a blood pressure reading in Health.');
    return { value: `${latest.systolic} / ${latest.diastolic}`, caption: `mmHg · ${dashboardDate(latest.measuredAt)} · ${new Date(latest.measuredAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`,
      rows: [{ label: 'Pulse', value: `${latest.pulse} bpm` }] };
  }
  if (widget.id === 'medications') {
    const medications = (state.medications ?? []).filter((item) => medicationIsActiveOnDate(item, today));
    const events = (state.medicationEvents ?? []).filter((event) => medications.some((item) => item.id === event.medicationId));
    const due = scheduledDosesForDate(medications, events, today);
    const pending = due.filter((dose) => !dose.status)
      .map((dose) => ({ time: dose.time, name: dose.medication.discreetName || dose.medication.name }));
    return { value: `${due.filter((dose) => dose.status === 'taken').length} taken · ${due.filter((dose) => dose.status === 'skipped').length} skipped`,
      caption: `Today · ${pending.length} scheduled doses not logged. Open Medications & Supplements for as-needed or interval schedules.`,
      rows: pending.slice(0, 3).map((dose) => ({ label: dose.name, value: formatMedicationTime(dose.time) })) };
  }
  if (widget.id === 'labs') {
    const trackers = (state.labTrackers ?? []).filter((item) => !widget.selectedIds || widget.selectedIds.includes(item.id));
    return { value: `${trackers.length} selected labs`, caption: 'Latest recorded results · open Labs for full history.', rows: trackers.slice(0, 3).map((tracker) => {
      const result = [...(state.labResults ?? [])].filter((item) => item.labTrackerId === tracker.id && item.panelDate <= today).sort((a, b) => b.panelDate.localeCompare(a.panelDate) || (b.resultTime ?? '').localeCompare(a.resultTime ?? ''))[0];
      return { label: `${tracker.name}${result ? ` · ${dashboardDate(result.panelDate)}` : ''}`, value: result ? `${number(result.value)} ${result.unit}` : 'No data' };
    }) };
  }
  const trackers = state.trackers.filter((item) => !item.archived && (!widget.selectedIds || widget.selectedIds.includes(item.id)));
  return { value: `${trackers.length} selected ${trackers.length === 1 ? 'habit' : 'habits'}`, caption: trackers.length > 3 ? `Showing 3 of ${trackers.length} · open Habits to view all.` : 'Your active trackers · open Habits for timers and history.', rows: trackers.slice(0, 3).map((tracker) => {
    const phase = taperQuitPhase(tracker, state.taperSteps ?? []);
    const start = phase?.startedAt ?? tracker.startedAt;
    const label = tracker.displayName || tracker.name;
    if (tracker.mode === 'abstinence' && !start) return { label, value: 'No start date' };
    if (start && Date.parse(start) > now.getTime()) return { label, value: `Starts ${dashboardDate(start)}` };
    if (start && trackerJourneySection(tracker, state.taperSteps ?? []) === 'quitting') {
      const streakStart = currentStreakFromEntries(start, (state.historicalEntries ?? []).filter((entry) => entry.trackerId === tracker.id), now);
      const elapsedMinutes = Math.floor(Math.max(0, now.getTime() - Date.parse(streakStart)) / 60_000);
      return { label, value: phase && !phase.exact ? `${phase.datePrecision === 'approximate' ? 'About ' : ''}${completedCalendarDays(streakStart, now)} days · ${formatTaperQuitStart(phase)}` : `${Math.floor(elapsedMinutes / 1440)}d ${Math.floor(elapsedMinutes % 1440 / 60)}h ${elapsedMinutes % 60}m · current streak` };
    }
    return { label, value: tracker.mode === 'reduction' ? `${tracker.current ?? '—'} ${tracker.unit ?? ''}` : `${tracker.frequencyCount ?? 1} per ${tracker.frequencyPeriod ?? 'day'}${start ? ` · Started ${dashboardDate(start)}` : ''}` };
  }) };
}
