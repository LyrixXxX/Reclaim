export type RouteStepState = {
  routeSteps?: number;
  routeStepBaseline?: { date: string; count: number };
  routeStepStatus?: 'available' | 'unavailable' | 'partial';
};

/** Count observed phone steps during recording; never infer them from GPS. */
export function updateRouteSteps<T extends RouteStepState>(route: T, date: string, count: number | undefined, reset = false): T {
  if (count === undefined || !Number.isFinite(count) || count < 0) {
    delete route.routeStepBaseline;
    route.routeStepStatus = 'unavailable';
    return route;
  }
  const wasUnavailable = route.routeStepStatus === 'unavailable';
  route.routeSteps ??= 0;
  const previous = route.routeStepBaseline;
  if (!reset && previous) {
    if (previous.date === date && count >= previous.count) route.routeSteps += count - previous.count;
    else if (previous.date !== date) {
      // The native counter resets at midnight. Add only the steps observed so
      // far today; the unsampled final seconds of yesterday cannot be inferred.
      route.routeSteps += count;
      route.routeStepStatus = 'partial';
    } else route.routeStepStatus = 'partial';
  }
  route.routeStepBaseline = { date, count };
  if (wasUnavailable) route.routeStepStatus = 'partial';
  else if (route.routeStepStatus !== 'partial') route.routeStepStatus = 'available';
  return route;
}
