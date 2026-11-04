import { TrackerState } from '@/models/tracker';

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** A typical adult walking stride (2.5 ft), used when there's nothing better. */
export const TYPICAL_STRIDE_METERS = 2.5 * METERS_PER_FOOT;
/** Walking stride is about 41% of height. */
const STRIDE_PER_HEIGHT = 0.413;
/** A walk needs a quarter mile and a full step count to tell us anything. */
const MIN_WALK_METERS = 400;
const MIN_WALK_STEPS = 300;
/** Outside this range the GPS or the step count was off; ignore the walk. */
const MIN_STRIDE_METERS = 0.4;
const MAX_STRIDE_METERS = 1.1;
/** Recent walks only, so the estimate follows changes in how you walk. */
const RECENT_WALKS = 10;

export type StrideSource = 'walks' | 'height' | 'typical';
export type Stride = { meters: number; source: StrideSource; walkCount: number };

type StrideState = Pick<TrackerState, 'activityRoutes' | 'weightTdeeProfile' | 'nutritionGoals'>;

/**
 * Walking stride, best source first: recorded walks (GPS distance ÷ steps counted on the walk),
 * then height, then a typical stride. Walks are pooled, so longer walks count for more.
 */
export function walkingStride(state: StrideState | undefined): Stride {
  const walks = (state?.activityRoutes ?? [])
    .filter((route) => route.kind === 'walk' && route.routeStepStatus === 'available' && (route.routeSteps ?? 0) >= MIN_WALK_STEPS && route.distanceMeters >= MIN_WALK_METERS)
    .filter((route) => { const stride = route.distanceMeters / route.routeSteps!; return stride >= MIN_STRIDE_METERS && stride <= MAX_STRIDE_METERS; })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, RECENT_WALKS);
  if (walks.length) {
    const meters = walks.reduce((sum, route) => sum + route.distanceMeters, 0) / walks.reduce((sum, route) => sum + route.routeSteps!, 0);
    return { meters, source: 'walks', walkCount: walks.length };
  }
  const heightCm = savedHeightCm(state);
  if (heightCm) return { meters: heightCm / 100 * STRIDE_PER_HEIGHT, source: 'height', walkCount: 0 };
  return { meters: TYPICAL_STRIDE_METERS, source: 'typical', walkCount: 0 };
}

function savedHeightCm(state: StrideState | undefined): number | undefined {
  const valid = (cm: number | undefined) => cm !== undefined && Number.isFinite(cm) && cm >= 100 && cm <= 250 ? cm : undefined;
  const fromProfile = valid(state?.weightTdeeProfile?.heightCm);
  if (fromProfile) return fromProfile;
  const latest = [...(state?.nutritionGoals ?? [])].filter((goal) => valid(goal.calculation?.heightCm)).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  return latest?.calculation?.heightCm;
}

export function stepDistanceMiles(steps: number, stride: Stride): number {
  return steps * stride.meters / METERS_PER_MILE;
}

export function strideFeet(stride: Stride): number {
  return stride.meters / METERS_PER_FOOT;
}

export function formatMiles(miles: number): string {
  return `${miles < 10 ? miles.toFixed(2) : miles.toFixed(1)} mi`;
}

export function strideNote(stride: Stride): string {
  const feet = `Stride ${strideFeet(stride).toFixed(1)} ft`;
  if (stride.source === 'walks') return `${feet}, from your last ${stride.walkCount === 1 ? 'walk' : `${stride.walkCount} walks`}.`;
  if (stride.source === 'height') return `${feet}, estimated from your height. Record a walk in Routes to measure it.`;
  return `${feet}, a typical stride. Record a walk in Routes to measure yours.`;
}
