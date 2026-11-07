import type { ActivityRoute } from '@/models/tracker';

import { activityDurationMs, routeMovingDurationMs } from './activity';
import { formatMiles } from './activity-units';
import { routeElevation } from './route-elevation';

const FEET_PER_METER = 3.28084;

export type RouteShareStat = { label: string; value: string };

function shortDuration(ms: number) {
  const minutes = Math.round(Math.max(0, ms) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** The numbers on a shared route image. A stat the route didn't record is left out rather than shown blank. */
export function routeShareStats(route: ActivityRoute): RouteShareStat[] {
  const movingMs = routeMovingDurationMs(route);
  const elevation = routeElevation(route.points);
  return [
    { label: 'Distance', value: formatMiles(route.distanceMeters) },
    movingMs === null ? { label: 'Time', value: shortDuration(activityDurationMs(route)) } : { label: 'Moving time', value: shortDuration(movingMs) },
    ...(elevation ? [{ label: 'Elevation gain', value: `${Math.round(elevation.gainMeters * FEET_PER_METER).toLocaleString()} ft` }] : []),
    ...(route.routeSteps ? [{ label: 'Steps', value: route.routeSteps.toLocaleString() }] : []),
  ];
}
