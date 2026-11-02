import type { ActivityPoint } from '@/models/tracker';

type Coordinate = [number, number];

function isValid(point: ActivityPoint) {
  return Number.isFinite(point.longitude) && Number.isFinite(point.latitude)
    && Math.abs(point.longitude) <= 180 && Math.abs(point.latitude) <= 85;
}

export function routeMapBounds(points: readonly ActivityPoint[]): [number, number, number, number] | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const point of points) {
    if (!isValid(point)) continue;
    west = Math.min(west, point.longitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    north = Math.max(north, point.latitude);
  }
  if (!Number.isFinite(west)) return null;
  const longitudeMargin = Math.max((east - west) * 0.08, 0.0003);
  const latitudeMargin = Math.max((north - south) * 0.08, 0.0003);
  return [
    Math.max(-180, west - longitudeMargin),
    Math.max(-85, south - latitudeMargin),
    Math.min(180, east + longitudeMargin),
    Math.min(85, north + latitudeMargin),
  ];
}

export function routeMapSegments(points: readonly ActivityPoint[]): Coordinate[][] {
  const segments: Coordinate[][] = [];
  let current: Coordinate[] = [];
  let previousSegment: number | undefined;
  for (const point of points) {
    if (!isValid(point)) {
      if (current.length > 1) segments.push(current);
      current = [];
      previousSegment = undefined;
      continue;
    }
    const segment = point.segment ?? 0;
    if (previousSegment !== undefined && segment !== previousSegment) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push([point.longitude, point.latitude]);
    previousSegment = segment;
  }
  if (current.length > 1) segments.push(current);
  return segments;
}
