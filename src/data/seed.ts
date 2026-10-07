import { TrackerState } from '@/models/tracker';
import { colors } from '@/theme';

export function createSeedState(): TrackerState {
  return {
    checkIns: [],
    historicalEntries: [],
    trackers: [
      {
        id: 'marijuana',
        name: 'Marijuana',
        icon: '◇',
        color: colors.marijuana,
        mode: 'abstinence',
        startedAt: '2026-07-20T00:00:00',
        checkpointDays: [1, 3, 7, 14, 30, 60, 90, 180, 365],
      },
      {
        id: 'porn',
        name: 'Porn',
        icon: '○',
        color: colors.porn,
        mode: 'abstinence',
        startedAt: '2026-07-23T00:00:00',
        checkpointDays: [1, 3, 7, 14, 30, 60, 90, 180, 365],
      },
      {
        id: 'nicotine',
        name: 'Nicotine',
        icon: '↘',
        color: colors.nicotine,
        mode: 'reduction',
        startedAt: '2026-07-20T00:00:00',
        baseline: 3,
        current: 1.5,
        unit: 'mg/mL',
      },
      {
        id: 'caffeine',
        name: 'Caffeine',
        icon: '⌁',
        color: colors.caffeine,
        mode: 'reduction',
        startedAt: '2026-07-20T00:00:00',
        baseline: 300,
        current: 0,
        currentStepStartedAt: '2026-07-25T00:00:00',
        unit: 'mg/day',
      },
    ],
    taperSteps: [
      {
        id: 'seed-caffeine-initial', trackerId: 'caffeine', amount: 300, unit: 'mg/day',
        startedAt: '2026-07-20T00:00:00', endedAt: '2026-07-20T00:00:00', status: 'completed',
        datePrecision: 'date_only', recordedAt: '2026-07-20T00:00:00',
      },
      {
        id: 'seed-caffeine-160', trackerId: 'caffeine', amount: 160, unit: 'mg/day',
        startedAt: '2026-07-20T00:00:00', endedAt: '2026-07-25T00:00:00', status: 'completed',
        datePrecision: 'approximate', recordedAt: '2026-07-20T00:00:00',
      },
      {
        id: 'seed-caffeine-current', trackerId: 'caffeine', amount: 0, unit: 'mg/day',
        startedAt: '2026-07-25T00:00:00', status: 'current',
        datePrecision: 'approximate', recordedAt: '2026-07-25T00:00:00',
      },
    ],
  };
}
