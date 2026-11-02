import { updateRouteSteps, type RouteStepState } from './route-steps';

test('counts live steps and excludes a manual-pause gap', () => {
  const route: RouteStepState = {};
  updateRouteSteps(route, '2026-10-28', 1000, true);
  updateRouteSteps(route, '2026-10-28', 1030);
  updateRouteSteps(route, '2026-10-28', 1040);
  expect(route.routeSteps).toBe(40);
  updateRouteSteps(route, '2026-10-28', 1200, true);
  updateRouteSteps(route, '2026-10-28', 1215);
  expect(route.routeSteps).toBe(55);
});

test('missing readings and counter reset do not invent steps', () => {
  const route: RouteStepState = {};
  updateRouteSteps(route, '2026-10-28', 50, true);
  updateRouteSteps(route, '2026-10-28', 60);
  updateRouteSteps(route, '2026-10-28', undefined);
  expect(route.routeSteps).toBe(10);
  expect(route.routeStepStatus).toBe('unavailable');
  updateRouteSteps(route, '2026-10-28', 3, true);
  updateRouteSteps(route, '2026-10-28', 8);
  expect(route.routeSteps).toBe(15);
});

test('midnight rollover retains known steps and flags a partial count', () => {
  const route: RouteStepState = {};
  updateRouteSteps(route, '2026-10-28', 800, true);
  updateRouteSteps(route, '2026-10-28', 825);
  updateRouteSteps(route, '2026-10-29', 7);
  expect(route.routeSteps).toBe(32);
  expect(route.routeStepStatus).toBe('partial');
});
