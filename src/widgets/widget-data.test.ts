import { Tracker, TrackerState } from '@/models/tracker';
import { quitWidgetData } from './widget-data';

const NOW = Date.parse('2026-11-03T12:00:00');
const tracker = (id: string, days: number): Tracker => ({ id, name: id, icon: '•', color: '#E7C26E', mode: 'abstinence', startedAt: new Date(NOW - days * 86_400_000).toISOString() } as Tracker);

describe('quit widget data', () => {
  test('shows the featured quit', () => {
    const state = { trackers: [tracker('Kratom', 385), tracker('Nicotine', 44)], checkIns: [], preferences: { featuredTrackerId: 'Nicotine' } } as unknown as TrackerState;
    expect(quitWidgetData(state, NOW)).toMatchObject({ kind: 'quit', name: 'Nicotine', days: 44, next: '16 days to 2 months', beaten: 0 });
  });

  test('is empty without a running quit or when Habits is hidden', () => {
    expect(quitWidgetData(undefined, NOW)).toEqual({ kind: 'empty' });
    expect(quitWidgetData({ trackers: [], checkIns: [] } as TrackerState, NOW)).toEqual({ kind: 'empty' });
    expect(quitWidgetData({ trackers: [tracker('A', 3)], checkIns: [], preferences: { visibleSections: { goals: false } } } as unknown as TrackerState, NOW)).toEqual({ kind: 'empty' });
  });
});
