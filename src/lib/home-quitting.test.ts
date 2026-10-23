import { Tracker, TaperStep } from '@/models/tracker';
import { homeQuittingTapering } from './home-quitting';

const now = new Date('2026-10-22T18:00:00Z');
const tracker = (id: string, mode: Tracker['mode'], startedAt?: string): Tracker => ({ id, name: id, icon: 'x', color: '#fff', mode, startedAt });

test('shows quit time and time at the current taper level without an end date', () => {
  const quit = tracker('quit', 'abstinence', '2026-10-20T18:00:00Z');
  const taper = { ...tracker('taper', 'reduction', '2026-10-01T18:00:00Z'), current: 5, unit: 'mg' };
  const steps: TaperStep[] = [{ id: 'step', trackerId: 'taper', amount: 5, unit: 'mg', startedAt: '2026-10-21T18:00:00Z', status: 'current', datePrecision: 'exact', recordedAt: '2026-10-21T18:00:00Z' }];
  const result = homeQuittingTapering([quit, taper], steps, now);
  expect(result.quitting[0].timeframe).toBe('Time since quitting · 2 days');
  expect(result.tapering[0].timeframe).toBe('Current level 5 mg · Time at this level · 1 day');
  expect(result.tapering[0].href).toBe('/tracker/taper');
});

test('moves a zero-level taper into quitting and hides archived items', () => {
  const taper = tracker('taper', 'reduction');
  const steps: TaperStep[] = [{ id: 'step', trackerId: 'taper', amount: 0, unit: 'mg', startedAt: '2026-10-22T17:30:00Z', status: 'current', datePrecision: 'exact', recordedAt: '2026-10-22T17:30:00Z' }];
  const result = homeQuittingTapering([taper, { ...tracker('old', 'abstinence'), archived: true }], steps, now);
  expect(result.quitting[0].timeframe).toBe('Time since quitting · 30 min');
  expect(result.tapering).toEqual([]);
});
