import { filterHealthReadings, healthReadingId, healthSummary, removeHealthReading, upsertHealthReading, validateHealthReading } from './health';
import { HealthReading } from '@/models/tracker';

const reading = (id: string, measuredAt: string, systolic = 120, diastolic = 80, pulse = 60): HealthReading => ({ id, type: 'bloodPressure', systolic, diastolic, pulse, measuredAt, recordedAt: measuredAt });

describe('health readings', () => {
  test('validates required values while allowing a broad plausible range', () => {
    expect(validateHealthReading(reading('a', '2026-08-01T08:00:00', 90, 55, 45))).toBeUndefined();
    expect(validateHealthReading(reading('a', '2026-08-01T08:00:00', 500, 80, 60))).toBe('Double-check this reading before saving.');
    expect(validateHealthReading(reading('a', 'bad-date', 120, 80, 60))).toBe('Enter a valid date and time.');
  });

  test('adds, sorts, and edits without duplicating a reading', () => {
    const initial = [reading('old', '2026-08-01T08:00:00')];
    const added = upsertHealthReading(initial, { systolic: 125, diastolic: 82, pulse: 64, measuredAt: '2026-08-02T09:00:00' }, 'new', '2026-08-02T09:01:00Z');
    expect(added.map((item) => item.id)).toEqual(['new', 'old']);
    const edited = upsertHealthReading(added, { id: 'old', systolic: 118, diastolic: 76, pulse: 62, measuredAt: '2026-08-03T10:00:00' }, 'unused');
    expect(edited).toHaveLength(2); expect(edited[0].id).toBe('old'); expect(edited[0].systolic).toBe(118);
  });

  test('filters only actual saved readings in date ranges', () => {
    const data = [reading('recent', '2026-08-09T12:00:00'), reading('old', '2026-07-01T12:00:00')];
    expect(filterHealthReadings(data, '7D', new Date('2026-08-10T12:00:00Z')).map((item) => item.id)).toEqual(['recent']);
    expect(filterHealthReadings(data, 'ALL')).toHaveLength(2);
    expect(filterHealthReadings(data, 'CUSTOM', new Date('2026-08-10'), '2026-07-01', '2026-07-01').map((item) => item.id)).toEqual(['old']);
  });

  test('calculates direct reading averages and ranges', () => {
    const summary = healthSummary([reading('a', '2026-08-01', 120, 80, 60), reading('b', '2026-08-02', 130, 70, 80)]);
    expect(summary).toMatchObject({ count: 2, averageSystolic: 125, averageDiastolic: 75, averagePulse: 70, lowestSystolic: 120, highestSystolic: 130, lowestDiastolic: 70, highestDiastolic: 80, lowestPulse: 60, highestPulse: 80 });
  });

  test('requires confirmation and removes only the selected reading', () => {
    const data = [reading('a', '2026-08-01'), reading('b', '2026-08-02')];
    expect(removeHealthReading(data, 'a', false)).toEqual(data);
    expect(removeHealthReading(data, 'a', true).map((item) => item.id)).toEqual(['b']);
  });

  test('generates stable-shaped unique ids', () => {
    expect(healthReadingId(1000, 0.25)).toMatch(/^health-/);
    expect(healthReadingId(1000, 0.25)).not.toBe(healthReadingId(1001, 0.25));
  });
});
