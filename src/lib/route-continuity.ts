import type { ActivityPoint } from '@/models/tracker';
import { pointDistanceMeters } from './activity';

// A short GPS blackout near the same spot need not create a large straight
// line. Larger unsupported travel is always kept as a separate segment.
export const ROUTE_CONTINUITY = {
  maxAccuracyMeters: 35,
  maxFixGapMs: 30_000,
  maxNearbyBridgeMeters: 45,
  maxPlausibleSpeedMetersPerSecond: 12,
} as const;

export function reliableRouteFix(point: ActivityPoint): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
    && Number.isFinite(point.timestamp)
    && point.accuracy != null && Number.isFinite(point.accuracy)
    && point.accuracy >= 0 && point.accuracy <= ROUTE_CONTINUITY.maxAccuracyMeters;
}

export function plausibleRouteFix(previous: ActivityPoint | undefined, point: ActivityPoint): boolean {
  if (!reliableRouteFix(point)) return false;
  if (!previous) return true;
  const elapsedSeconds = (point.timestamp - previous.timestamp) / 1000;
  return elapsedSeconds > 0 && pointDistanceMeters(previous, point) / elapsedSeconds < ROUTE_CONTINUITY.maxPlausibleSpeedMetersPerSecond;
}

export function lostFixCoverage(previous: ActivityPoint | undefined, point: ActivityPoint): boolean {
  return !!previous && point.timestamp - previous.timestamp > ROUTE_CONTINUITY.maxFixGapMs;
}

export function nearbyRouteFix(a: ActivityPoint | undefined, b: ActivityPoint): boolean {
  return !!a && reliableRouteFix(a) && reliableRouteFix(b)
    && pointDistanceMeters(a, b) <= ROUTE_CONTINUITY.maxNearbyBridgeMeters;
}

export function canBridgeAutoPause(anchor: ActivityPoint | undefined, resumed: ActivityPoint, coverageBroken: boolean | undefined): boolean {
  return coverageBroken === false && nearbyRouteFix(anchor, resumed);
}
