import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useNow } from '@/hooks/use-now';
import { readWalkingHistory } from '@/lib/activity-steps';
import { readActiveRoute } from '@/lib/activity-recording';
import { localDateKey } from '@/lib/progress';
import { closestBadge, earnedBadges, trackerBadges } from '@/lib/trophy-case';
import { walkingMinutesHistoryOutsideRoutes } from '@/lib/walking-minutes';
import { useTrackers } from '@/state/tracker-context';

const WALK_REFRESH_MS = 2 * 60_000;

/** Badges for every habit. Phone walking minutes live in the step service, so they're read separately. */
export function useTrophyCase() {
  const { trackers, historicalEntries, goodHabitLogs, waterLogs, activityRoutes, taperSteps } = useTrackers();
  const hasWalk = trackers.some((tracker) => tracker.habitTemplate === 'walk');
  const [phoneMinutes, setPhoneMinutes] = useState<Record<string, number>>({});
  const [phoneRead, setPhoneRead] = useState(false);
  useEffect(() => {
    if (!hasWalk) return;
    let mounted = true;
    const read = () => void Promise.all([readWalkingHistory(), readActiveRoute().catch(() => null)]).then(([history, active]) => {
      if (!mounted) return;
      setPhoneMinutes(walkingMinutesHistoryOutsideRoutes(history, activityRoutes ?? [], active));
      setPhoneRead(true);
    });
    read();
    const timer = setInterval(read, WALK_REFRESH_MS);
    const subscription = AppState.addEventListener('change', (status) => { if (status === 'active') read(); });
    return () => { mounted = false; clearInterval(timer); subscription.remove(); };
  }, [hasWalk, activityRoutes]);

  // Results only change with new data or a new day (the sleep habit's day turns over at 6 AM).
  const now = useNow(60_000);
  const clock = new Date(now);
  const dayKey = `${localDateKey(clock)}-${clock.getHours() < 6}`;
  return useMemo(() => {
    const list = trackerBadges({ trackers, historicalEntries, goodHabitLogs, waterLogs, activityRoutes, taperSteps }, new Date(), phoneMinutes);
    return { list, closest: closestBadge(list), earned: earnedBadges(list), ready: !hasWalk || phoneRead };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey moves the calculation to the new day.
  }, [trackers, historicalEntries, goodHabitLogs, waterLogs, activityRoutes, taperSteps, phoneMinutes, phoneRead, hasWalk, dayKey]);
}
