import { activeCpapSettings, cpapSettingsPeriods, cpapSummary, cpapTrendDescription, cpapTrendPoints, cpapUsageDayCounts, CpapTrendMetric, CpapTrendRange, CpapUsageStreakStats, equalNightSettingsComparison } from './cpap';
import { CpapReading, CpapTherapySettings } from '@/models/tracker';

type ReportOptions = {
  readings: CpapReading[];
  settings?: CpapTherapySettings[];
  range: CpapTrendRange;
  periodLabel: string;
  streak: CpapUsageStreakStats;
  usageDays?: ReturnType<typeof cpapUsageDayCounts>;
  generatedAt?: Date;
};

const REPORT_METRICS: { metric: CpapTrendMetric; label: string; color: string; suffix: string }[] = [
  { metric: 'usedMinutes', label: 'Therapy time', color: '#3f8cff', suffix: 'm' },
  { metric: 'ahi', label: 'AHI', color: '#55a8ff', suffix: '' },
  { metric: 'averageLeak', label: 'Average leak', color: '#e89251', suffix: ' L/min' },
];

export function buildCpapDoctorReportHtml({ readings, settings = [], range, periodLabel, streak, generatedAt = new Date(), usageDays = cpapUsageDayCounts(readings, range, generatedAt) }: ReportOptions) {
  const ordered = [...readings].sort((a, b) => a.sleepDate.localeCompare(b.sleepDate));
  const summary = cpapSummary(ordered);
  const dateSpan = ordered.length ? `${formatDate(ordered[0].sleepDate)} – ${formatDate(ordered.at(-1)!.sleepDate)}` : 'No saved readings';
  const averages = summary ? [
    ['Nights recorded', `${summary.count}`],
    ['Average therapy time', formatMinutes(summary.averageUsedMinutes)],
    ['Average AHI', formatDecimal(summary.averageAhi)],
    ['Average CAI', formatAverage(ordered, 'cai')],
    ['Average leak', `${formatDecimal(summary.averageLeak)} L/min`],
    ['Average 95% leak', `${formatDecimal(summary.averageP95Leak)} L/min`],
    ['Average pressure', `${formatAverage(ordered, 'averagePressure')} cmH₂O`],
    ['Average P95 pressure', `${formatAverage(ordered, 'p95Pressure')} cmH₂O`],
  ] : [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { margin: 0.45in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.42; }
    h1, h2, p { margin: 0; }
    h1 { color: #101827; font-size: 24px; line-height: 1.15; }
    h2 { color: #101827; font-size: 15px; margin: 22px 0 9px; }
    .eyebrow { color: #52657d; font-size: 8px; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; }
    .subtitle { color: #52657d; font-size: 10px; margin-top: 6px; }
    .meta { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #dce3ec; padding: 14px 0 12px; color: #52657d; }
    .meta strong { color: #172033; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
    .stat { border: 1px solid #dce3ec; border-radius: 7px; padding: 9px; min-height: 53px; break-inside: avoid; }
    .stat-label { color: #68788d; font-size: 7px; font-weight: 700; letter-spacing: .55px; text-transform: uppercase; }
    .stat-value { color: #101827; font-size: 14px; font-weight: 700; margin-top: 4px; }
    .consistency { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; break-inside: avoid; }
    .consistency .stat:first-child { border-color: #9fbde8; background: #f4f8ff; }
    .status { color: #235fae; font-size: 8px; font-weight: 700; text-transform: uppercase; }
    .status-copy { color: #52657d; margin-top: 4px; }
    .charts { display: grid; grid-template-columns: 1fr; gap: 9px; }
    .chart { border: 1px solid #dce3ec; border-radius: 7px; padding: 9px; break-inside: avoid; }
    .chart-title { color: #101827; font-size: 11px; font-weight: 700; }
    .chart-subtitle { color: #68788d; font-size: 8px; margin-top: 1px; }
    svg { display: block; width: 100%; height: 145px; margin-top: 6px; overflow: visible; }
    table { width: 100%; border-collapse: collapse; font-size: 8px; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th { color: #52657d; background: #f1f4f8; font-size: 7px; letter-spacing: .35px; text-align: right; text-transform: uppercase; }
    th:first-child, td:first-child { text-align: left; }
    th, td { border: 1px solid #dce3ec; padding: 6px 5px; text-align: right; white-space: nowrap; }
    td { color: #273449; }
    .notes { display: grid; gap: 6px; }
    .note { border-left: 3px solid #9fbde8; background: #f5f7fa; padding: 7px 9px; break-inside: avoid; }
    .note-date { color: #52657d; font-size: 8px; font-weight: 700; }
    .note-copy { color: #273449; margin-top: 2px; white-space: pre-wrap; }
    .disclaimer { border-top: 1px solid #dce3ec; color: #68788d; font-size: 8px; margin-top: 22px; padding-top: 10px; }
    .empty { color: #68788d; border: 1px dashed #cbd5e1; border-radius: 7px; padding: 18px; text-align: center; }
  </style>
</head>
<body>
  <div class="eyebrow">Personal CPAP record · Reclaim</div>
  <h1>CPAP Therapy Report</h1>
  <p class="subtitle">Machine-screen values recorded by the user and presented without diagnosis or interpretation.</p>
  <div class="meta">
    <div><strong>Period:</strong> ${escapeHtml(periodLabel)}<br />${escapeHtml(dateSpan)}</div>
    <div><strong>Generated:</strong> ${escapeHtml(generatedAt.toLocaleString())}</div>
  </div>
  ${summary ? `
    <h2>Period summary</h2>
    <div class="grid">${averages.map(([label, value]) => statHtml(label, value)).join('')}</div>
    <h2>Four-hour usage consistency</h2>
    <div class="consistency">
      <div class="stat"><div class="status">${escapeHtml(streakLabel(streak))}</div><div class="stat-value">${streak.current} ${streak.current === 1 ? 'night' : 'nights'}</div><div class="status-copy">${escapeHtml(streakDescription(streak))}</div></div>
      ${statHtml('Longest run', `${streak.longest}`)}
      ${statHtml('Qualifying nights', `${streak.qualifyingNights}`)}
      ${statHtml('Recorded nights', `${streak.recordedNights}`)}
      ${statHtml('Days under 4 hours', `${usageDays.underFourHours}`)}
      ${statHtml('Days missed', `${usageDays.missed}`)}
    </div>
    <p class="subtitle">Under 4 hours: recorded use of 1–239 minutes. Missed: no entry or zero recorded use since tracking began. A missing entry does not confirm the machine was unused; today is excluded until recorded.</p>
    <h2>Trends</h2>
    <div class="charts">${REPORT_METRICS.map((item) => chartHtml(ordered, range, item.metric, item.label, item.color, item.suffix)).join('')}${pressureChartHtml(ordered, settings, range)}</div>
    ${settings.length ? `<h2>Therapy settings timeline</h2>${settingsTimelineHtml(settings, ordered)}${settingsComparisonHtml(settings, ordered)}` : ''}
    <h2>Recorded nights</h2>
    ${readingsTableHtml(ordered)}
    ${notesHtml(ordered)}
  ` : '<h2>Period summary</h2><div class="empty">No CPAP readings are saved in this period.</div>'}
  <p class="disclaimer">For personal recordkeeping only. A qualifying night in this report contains at least four recorded therapy hours; this is a tracking threshold, not medical advice. Values are transcribed from the CPAP machine summary and should be verified against the machine or clinical records.</p>
</body>
</html>`;
}

function pressureChartHtml(readings: CpapReading[], settings: CpapTherapySettings[], range: CpapTrendRange) {
  const average = cpapTrendPoints(readings, 'averagePressure', range);
  const p95 = cpapTrendPoints(readings, 'p95Pressure', range);
  if (!average.length) return '<div class="chart"><div class="chart-title">Pressure</div><div class="empty">No values</div></div>';
  const width = 660; const height = 145; const left = 36; const right = 18; const top = 20; const bottom = 28;
  const active = average.map((point) => activeCpapSettings(settings, point.endDate));
  const values = [...average.map((point) => point.value), ...p95.map((point) => point.value), ...active.flatMap((item) => item ? [item.minPressure, item.maxPressure] : [])];
  const rawMin = Math.min(...values); const rawMax = Math.max(...values); const padding = rawMax === rawMin ? 1 : Math.max(.5, (rawMax - rawMin) * .1);
  const min = Math.max(0, rawMin - padding); const max = rawMax + padding;
  const x = (index: number) => left + (average.length === 1 ? (width - left - right) / 2 : index * (width - left - right) / (average.length - 1));
  const y = (value: number) => top + (max - value) / Math.max(max - min, 1) * (height - top - bottom);
  const polyline = (points: typeof average) => points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const boundaryLines = active.map((setting, index) => {
    if (!setting) return '';
    const cellLeft = average.length === 1 ? left : index === 0 ? left : (x(index - 1) + x(index)) / 2;
    const cellRight = average.length === 1 ? width - right : index === average.length - 1 ? width - right : (x(index) + x(index + 1)) / 2;
    return `<line data-boundary="min" x1="${cellLeft}" x2="${cellRight}" y1="${y(setting.minPressure)}" y2="${y(setting.minPressure)}" stroke="#7653a8" stroke-width="2" stroke-dasharray="7 5" stroke-linecap="round" /><line data-boundary="max" x1="${cellLeft}" x2="${cellRight}" y1="${y(setting.maxPressure)}" y2="${y(setting.maxPressure)}" stroke="#c47a13" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" />`;
  }).join('');
  const marks = average.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="3" fill="#3f8cff" /><circle cx="${x(index)}" cy="${y(p95[index].value)}" r="3" fill="#8fba35" /><text x="${x(index)}" y="${height - 7}" text-anchor="${index === 0 ? 'start' : index === average.length - 1 ? 'end' : 'middle'}" font-size="7" fill="#68788d">${escapeHtml(point.label)}</text>`).join('');
  return `<div class="chart"><div class="chart-title">Pressure · cmH₂O</div><div class="chart-subtitle">Blue: average · Green: P95 · Purple dashed: minimum setting · Orange dotted: maximum setting</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pressure values and configured pressure boundaries"><line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#dce3ec" />${boundaryLines}<polyline points="${polyline(average)}" fill="none" stroke="#3f8cff" stroke-width="3" /><polyline points="${polyline(p95)}" fill="none" stroke="#8fba35" stroke-width="3" />${marks}</svg></div>`;
}

function settingsTimelineHtml(settings: CpapTherapySettings[], readings: CpapReading[]) {
  const periods = cpapSettingsPeriods(settings, readings);
  const rows = [...periods].reverse().map((period) => `<tr><td>${escapeHtml(formatSettingEffective(period.setting))}</td><td>${escapeHtml(period.setting.mode)}</td><td>${formatDecimal(period.setting.minPressure)}–${formatDecimal(period.setting.maxPressure)}</td><td>${period.readings.length}</td><td>${escapeHtml(period.setting.maskName ?? '—')}</td><td>${escapeHtml(period.setting.note ?? '—')}</td></tr>`).join('');
  return `<table><thead><tr><th>Effective</th><th>Mode</th><th>Range cmH₂O</th><th>Nights</th><th>Mask</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function settingsComparisonHtml(settings: CpapTherapySettings[], readings: CpapReading[]) {
  const comparison = equalNightSettingsComparison(settings, readings, 14);
  if (!comparison || comparison.count === 0) return '';
  const metrics: { key: keyof Pick<CpapReading, 'usedMinutes' | 'ahi' | 'cai' | 'averagePressure' | 'p95Pressure' | 'averageLeak' | 'p95Leak'>; label: string; suffix: string }[] = [
    { key: 'usedMinutes', label: 'Therapy time', suffix: ' min' }, { key: 'ahi', label: 'AHI', suffix: '' }, { key: 'cai', label: 'CAI', suffix: '' }, { key: 'averagePressure', label: 'Average pressure', suffix: ' cmH₂O' }, { key: 'p95Pressure', label: 'P95 pressure', suffix: ' cmH₂O' }, { key: 'averageLeak', label: 'Average leak', suffix: ' L/min' }, { key: 'p95Leak', label: '95% leak', suffix: ' L/min' },
  ];
  const rows = metrics.map((metric) => `<tr><td>${escapeHtml(metric.label)}</td><td>${formatDecimal(averageValue(comparison.beforeReadings, metric.key))}${escapeHtml(metric.suffix)}</td><td>${formatDecimal(averageValue(comparison.afterReadings, metric.key))}${escapeHtml(metric.suffix)}</td></tr>`).join('');
  return `<h2>Equal-night settings comparison</h2><p class="subtitle">${comparison.count} recorded nights from each settings period. Values are presented without interpretation.</p><table><thead><tr><th>Metric</th><th>${escapeHtml(`${formatDecimal(comparison.before.minPressure)}–${formatDecimal(comparison.before.maxPressure)} before`)}</th><th>${escapeHtml(`${formatDecimal(comparison.after.minPressure)}–${formatDecimal(comparison.after.maxPressure)} after`)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function chartHtml(readings: CpapReading[], range: CpapTrendRange, metric: CpapTrendMetric, label: string, color: string, suffix: string) {
  const points = cpapTrendPoints(readings, metric, range);
  if (!points.length) return `<div class="chart"><div class="chart-title">${escapeHtml(label)}</div><div class="empty">No values</div></div>`;
  const width = 660; const height = 132; const left = 36; const right = 18; const top = 22; const bottom = 27;
  const values = points.map((point) => point.value); const rawMin = Math.min(...values); const rawMax = Math.max(...values);
  const padding = rawMax === rawMin ? Math.max(Math.abs(rawMax) * .1, 1) : (rawMax - rawMin) * .18;
  const min = Math.max(0, rawMin - padding); const max = rawMax + padding;
  const x = (index: number) => left + (points.length === 1 ? (width - left - right) / 2 : index * (width - left - right) / (points.length - 1));
  const y = (value: number) => top + (max - value) / Math.max(max - min, 1) * (height - top - bottom);
  const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const marks = points.map((point, index) => {
    const px = x(index); const py = y(point.value); const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
    return `<circle cx="${px}" cy="${py}" r="3.5" fill="${color}" /><text x="${px}" y="${Math.max(10, py - 8)}" text-anchor="${anchor}" font-size="8" font-weight="700" fill="#273449">${escapeHtml(formatMetric(metric, point.value, suffix))}</text><text x="${px}" y="${height - 7}" text-anchor="${anchor}" font-size="7" fill="#68788d">${escapeHtml(point.label)}</text>`;
  }).join('');
  return `<div class="chart"><div class="chart-title">${escapeHtml(label)}</div><div class="chart-subtitle">${escapeHtml(cpapTrendDescription(range, readings))}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)} trend"><line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#dce3ec" stroke-width="1" /><polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />${marks}</svg></div>`;
}

function readingsTableHtml(readings: CpapReading[]) {
  const rows = [...readings].reverse().map((reading) => `<tr><td>${escapeHtml(formatDate(reading.sleepDate))}</td><td>${escapeHtml(formatMinutes(reading.usedMinutes))}</td><td>${formatDecimal(reading.ahi)}</td><td>${formatDecimal(reading.cai)}</td><td>${formatDecimal(reading.averagePressure)}</td><td>${formatDecimal(reading.p95Pressure)}</td><td>${formatDecimal(reading.averageLeak)}</td><td>${formatDecimal(reading.p95Leak)}</td></tr>`).join('');
  return `<table><thead><tr><th>Date</th><th>Use</th><th>AHI</th><th>CAI</th><th>Avg P</th><th>P95 P</th><th>Avg leak</th><th>95% leak</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function notesHtml(readings: CpapReading[]) {
  const notes = [...readings].reverse().filter((reading) => reading.note?.trim());
  if (!notes.length) return '';
  return `<h2>Recorded notes</h2><div class="notes">${notes.map((reading) => `<div class="note"><div class="note-date">${escapeHtml(formatDate(reading.sleepDate))}</div><div class="note-copy">${escapeHtml(reading.note!)}</div></div>`).join('')}</div>`;
}

function statHtml(label: string, value: string) { return `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div>`; }
function formatAverage(readings: CpapReading[], key: 'cai' | 'averagePressure' | 'p95Pressure') { return formatDecimal(readings.reduce((sum, item) => sum + item[key], 0) / readings.length); }
function formatMinutes(value: number) { const rounded = Math.round(value); return `${Math.floor(rounded / 60)}h ${rounded % 60}m`; }
function formatDecimal(value: number) { return Number.isInteger(value) ? value.toFixed(1) : `${Math.round(value * 10) / 10}`; }
function formatMetric(metric: CpapTrendMetric, value: number, suffix: string) { return metric === 'usedMinutes' ? `${Math.round(value)}m` : `${formatDecimal(value)}${suffix}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function formatSettingEffective(setting: CpapTherapySettings) { return `${formatDate(setting.effectiveDate)}${setting.effectiveTime ? ` ${formatClock(setting.effectiveTime)}` : ''}`; }
function formatClock(value: string) { const [rawHour, minute] = value.split(':').map(Number); return `${rawHour % 12 || 12}:${String(minute).padStart(2, '0')} ${rawHour >= 12 ? 'PM' : 'AM'}`; }
function averageValue(readings: CpapReading[], key: keyof Pick<CpapReading, 'usedMinutes' | 'ahi' | 'cai' | 'averagePressure' | 'p95Pressure' | 'averageLeak' | 'p95Leak'>) { return readings.reduce((sum, reading) => sum + reading[key], 0) / readings.length; }
function streakLabel(streak: CpapUsageStreakStats) { if (streak.state === 'active') return 'Active'; if (streak.state === 'building') return 'Building'; if (streak.state === 'below_threshold') return 'Ended'; return 'No data'; }
function streakDescription(streak: CpapUsageStreakStats) { if (streak.state === 'active') return 'Consecutive qualifying nights.'; if (streak.state === 'building') return 'One qualifying night recorded.'; if (streak.state === 'below_threshold') return 'Latest recorded night was under four hours.'; if (streak.current) return 'Last confirmed run; the latest expected night has no record.'; return 'No confirmed qualifying run.'; }
export function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!); }
