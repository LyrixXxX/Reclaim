import { ActivityPoint } from '@/models/tracker';
import { pointDistanceMeters } from './activity';

export type ElevationSample = { distanceMeters: number; elevationMeters: number };
export type RouteElevation = { series: ElevationSample[][]; distanceMeters: number; gainMeters: number; lossMeters: number; minMeters: number; maxMeters: number };

// Phone GPS altitude is noisy. Smooth nearby fixes and ignore changes below
// three meters; do not connect separate route segments or missing readings.
export function routeElevation(points: ActivityPoint[]): RouteElevation | null {
  const runs: ElevationSample[][] = [];
  let run: ElevationSample[] = [];
  let distanceMeters = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (index && (point.segment ?? 0) === (points[index - 1].segment ?? 0)) {
      distanceMeters += pointDistanceMeters(points[index - 1], point);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
    const altitude = point.altitudeMeters;
    const accuracy = point.altitudeAccuracyMeters;
    if (altitude == null || !Number.isFinite(altitude) || (accuracy != null && (!Number.isFinite(accuracy) || accuracy > 25 || accuracy < 0))) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push({ distanceMeters, elevationMeters: altitude });
  }
  if (run.length) runs.push(run);

  const series = runs.filter((part) => part.length >= 3 && part.at(-1)!.distanceMeters - part[0].distanceMeters >= 40).map((part) => part.map((sample, index) => {
    const nearby = part.slice(Math.max(0, index - 2), Math.min(part.length, index + 3)).map((item) => item.elevationMeters).sort((a, b) => a - b);
    return { ...sample, elevationMeters: nearby[Math.floor(nearby.length / 2)] };
  }));
  if (!series.length) return null;

  let gainMeters = 0;
  let lossMeters = 0;
  for (const part of series) {
    let anchor = part[0].elevationMeters;
    for (const sample of part.slice(1)) {
      const change = sample.elevationMeters - anchor;
      if (Math.abs(change) < 3) continue;
      if (change > 0) gainMeters += change;
      else lossMeters -= change;
      anchor = sample.elevationMeters;
    }
  }
  const bounds = series.reduce((value, part) => part.reduce((current, sample) => ({ min: Math.min(current.min, sample.elevationMeters), max: Math.max(current.max, sample.elevationMeters) }), value), { min: Infinity, max: -Infinity });
  return { series, distanceMeters, gainMeters, lossMeters, minMeters: bounds.min, maxMeters: bounds.max };
}
