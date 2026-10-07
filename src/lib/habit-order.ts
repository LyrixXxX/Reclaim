import { TrackerState } from '@/models/tracker';
import { trackerJourneySection } from './taper-quit';

/** Swap visible neighbors in one Habits section without changing tracker records. */
export function swapHabitOrder(state: TrackerState, firstId: string, secondId: string): TrackerState {
  if (firstId === secondId) return state;
  const firstIndex = state.trackers.findIndex((tracker) => tracker.id === firstId);
  const secondIndex = state.trackers.findIndex((tracker) => tracker.id === secondId);
  if (firstIndex < 0 || secondIndex < 0) return state;
  const first = state.trackers[firstIndex];
  const second = state.trackers[secondIndex];
  if (first.archived || second.archived ||
    trackerJourneySection(first, state.taperSteps ?? []) !== trackerJourneySection(second, state.taperSteps ?? [])) return state;
  const trackers = [...state.trackers];
  trackers[firstIndex] = second;
  trackers[secondIndex] = first;
  return { ...state, trackers };
}
