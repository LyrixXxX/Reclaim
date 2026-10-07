import { buildCpapDoctorReportHtml, escapeHtml } from './cpap-report';
import { cpapUsageStreakStats } from './cpap';
import { CpapReading } from '@/models/tracker';

const reading = (id: string, sleepDate: string, values: Partial<CpapReading> = {}): CpapReading => ({ id, sleepDate, usedMinutes: 300, averagePressure: 6, p95Pressure: 9, ahi: 2, cai: .2, averageLeak: 3, p95Leak: 11, recordedAt: `${sleepDate}T09:00:00Z`, ...values });

describe('CPAP doctor PDF report', () => {
  test('includes the selected period, summaries, streak, trends, and nightly values', () => {
    const readings = [reading('a', '2026-09-10'), reading('b', '2026-09-11', { usedMinutes: 360, ahi: 3 })];
    const streak = cpapUsageStreakStats(readings, new Date(2026, 8, 12, 12));
    const html = buildCpapDoctorReportHtml({ readings, range: '30D', periodLabel: 'Last 30 days', streak, generatedAt: new Date('2026-09-12T15:00:00Z') });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('CPAP Therapy Report');
    expect(html).toContain('Last 30 days');
    expect(html).toContain('Average therapy time');
    expect(html).toContain('Four-hour usage consistency');
    expect(html).toContain('Days under 4 hours');
    expect(html).toContain('Days missed');
    expect(html).toContain('Weekly averages');
    expect(html).toContain('Sep 11, 2026');
    expect(html).toContain('6h 0m');
  });

  test('escapes notes and labels before inserting them into the report', () => {
    const readings = [reading('a', '2026-09-11', { note: '<script>alert("no")</script> & checked' })];
    const streak = cpapUsageStreakStats(readings, new Date(2026, 8, 12, 12));
    const html = buildCpapDoctorReportHtml({ readings, range: '30D', periodLabel: 'Last <30> days', streak });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(&quot;no&quot;)&lt;/script&gt; &amp; checked');
    expect(html).toContain('Last &lt;30&gt; days');
    expect(escapeHtml(`'"&<>`)).toBe('&#39;&quot;&amp;&lt;&gt;');
  });

  test('renders a useful empty report without invalid averages', () => {
    const streak = cpapUsageStreakStats([], new Date(2026, 8, 12, 12));
    const html = buildCpapDoctorReportHtml({ readings: [], range: '30D', periodLabel: 'Last 30 days', streak });
    expect(html).toContain('No CPAP readings are saved in this period.');
    expect(html).not.toContain('NaN');
  });

  test('includes settings boundaries, timeline, and neutral equal-night numbers', () => {
    const readings = [reading('a', '2026-09-10'), reading('b', '2026-09-11'), reading('c', '2026-09-12'), reading('d', '2026-09-13')];
    const settings = [
      { id: 'old', effectiveDate: '2026-09-01', mode: 'APAP' as const, minPressure: 4, maxPressure: 20, recordedAt: '2026-09-01T00:00:00Z' },
      { id: 'new', effectiveDate: '2026-09-12', mode: 'APAP' as const, minPressure: 5.5, maxPressure: 13, recordedAt: '2026-09-12T00:00:00Z' },
    ];
    const streak = cpapUsageStreakStats(readings, new Date(2026, 8, 14, 12));
    const html = buildCpapDoctorReportHtml({ readings, settings, range: '30D', periodLabel: 'Last 30 days', streak });
    expect(html).toContain('Therapy settings timeline');
    expect(html).toContain('Equal-night settings comparison');
    expect(html).toContain('Purple dashed: minimum setting');
    expect(html).toContain('data-boundary="min"');
    expect(html).toContain('data-boundary="max"');
    expect(html).toContain('5.5–13.0');
    expect(html).toContain('Values are presented without interpretation.');
    expect(html).not.toMatch(/good|bad|too high|too low|recommend/i);
  });
});
