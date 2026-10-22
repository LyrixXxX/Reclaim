import { pointDistanceMeters } from './activity';

export type MotionFix = { latitude: number; longitude: number; timestamp: number; accuracy?: number | null; speed?: number | null; segment: number };
export type TimeInterval = { startedAt: string; endedAt: string };
export type MotionState = {
  status: 'unknown' | 'moving' | 'stopped';
  lastFix?: MotionFix;
  slowAnchor?: MotionFix;
  candidate?: 'moving' | 'stopped';
  candidateMs: number;
  candidateSince?: number;
  movingMs: number;
  stoppedMs: number;
  stationaryIntervals: TimeInterval[];
  openStationaryAt?: number;
};

// Conservative starting values. These are deliberately not tied to the GPS
// route-point filter, and can be tuned after real walks and hikes.
export const MOTION_LIMITS = {
  maxAccuracyMeters: 30,
  maxSampleGapMs: 20_000,
  maxSpeedMetersPerSecond: 12,
  stopSpeedMetersPerSecond: 0.5,
  resumeSpeedMetersPerSecond: 0.8,
  stopConfirmMs: 12_000,
  resumeConfirmMs: 4_000,
} as const;

export function freshMotionState(): MotionState {
  return { status: 'unknown', candidateMs: 0, movingMs: 0, stoppedMs: 0, stationaryIntervals: [] };
}

export function closeMotion(state: MotionState, at: number): MotionState {
  if (state.openStationaryAt !== undefined) {
    const lastSupportedStop = state.candidate === 'moving' ? state.candidateSince : state.lastFix?.timestamp;
    const end = Math.max(state.openStationaryAt, Math.min(at, lastSupportedStop ?? at));
    state.stationaryIntervals.push({ startedAt: new Date(state.openStationaryAt).toISOString(), endedAt: new Date(end).toISOString() });
    delete state.openStationaryAt;
  }
  state.status = 'unknown';
  state.candidateMs = 0;
  delete state.candidate;
  delete state.candidateSince;
  delete state.lastFix;
  delete state.slowAnchor;
  return state;
}

export function addMotionFix(state: MotionState, fix: MotionFix): MotionState {
  const previous = state.lastFix;
  if (!Number.isFinite(fix.timestamp) || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)
    || Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180) return state;
  if (fix.accuracy == null || fix.accuracy < 0 || fix.accuracy > MOTION_LIMITS.maxAccuracyMeters) {
    closeMotion(state, previous?.timestamp ?? fix.timestamp);
    return state;
  }
  state.lastFix = fix;
  if (!previous || previous.segment !== fix.segment) { state.slowAnchor = fix; return state; }
  const delta = fix.timestamp - previous.timestamp;
  if (delta <= 0 || delta > MOTION_LIMITS.maxSampleGapMs || previous.accuracy == null) {
    closeMotion(state, previous.timestamp);
    state.lastFix = fix;
    return state;
  }
  const distance = pointDistanceMeters(previous, fix);
  const velocity = distance / (delta / 1000);
  if (velocity > MOTION_LIMITS.maxSpeedMetersPerSecond) {
    closeMotion(state, previous.timestamp);
    state.lastFix = fix;
    return state;
  }
  const reportedSpeed = fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : null;
  const uncertainty = Math.max(previous.accuracy, fix.accuracy);
  const anchor = state.slowAnchor && state.slowAnchor.segment === fix.segment ? state.slowAnchor : previous;
  const anchorDelta = fix.timestamp - anchor.timestamp;
  const anchorDistance = pointDistanceMeters(anchor, fix);
  const slowMovement = anchorDelta >= 10_000 && anchorDelta <= 25_000
    && anchorDistance >= Math.max(10, (anchor.accuracy ?? 10) + fix.accuracy)
    && anchorDistance / (anchorDelta / 1000) >= MOTION_LIMITS.stopSpeedMetersPerSecond;
  const confirmedMovement = (velocity >= MOTION_LIMITS.resumeSpeedMetersPerSecond
    && distance >= Math.max(4, uncertainty * 0.6))
    || slowMovement
    || (state.status === 'moving' && velocity >= MOTION_LIMITS.stopSpeedMetersPerSecond && distance >= 2.5 && uncertainty <= 15);
  const stationary = velocity < MOTION_LIMITS.stopSpeedMetersPerSecond
    && (reportedSpeed === null || reportedSpeed < MOTION_LIMITS.stopSpeedMetersPerSecond)
    && distance <= Math.max(4, uncertainty);
  const next = confirmedMovement ? 'moving' : stationary ? 'stopped' : null;
  if (confirmedMovement) state.slowAnchor = fix;
  else if (anchorDelta > 25_000) state.slowAnchor = previous;
  if (!next) {
    if (velocity >= MOTION_LIMITS.stopSpeedMetersPerSecond && velocity < MOTION_LIMITS.resumeSpeedMetersPerSecond
      && distance <= Math.max(4, uncertainty)) return state;
    closeMotion(state, previous.timestamp);
    state.lastFix = fix;
    return state;
  }
  if (next === state.status) {
    if (next === 'moving') state.movingMs += delta;
    else state.stoppedMs += delta;
    state.candidateMs = 0;
    delete state.candidate;
    delete state.candidateSince;
    return state;
  }
  if (state.candidate !== next) {
    state.candidate = next;
    state.candidateMs = 0;
    state.candidateSince = slowMovement ? anchor.timestamp : previous.timestamp;
  }
  state.candidateMs += slowMovement && state.status !== 'moving' ? Math.max(delta, anchorDelta) : delta;
  const threshold = next === 'stopped' ? MOTION_LIMITS.stopConfirmMs : MOTION_LIMITS.resumeConfirmMs;
  if (state.candidateMs >= threshold) {
    if (state.openStationaryAt !== undefined) {
      state.stationaryIntervals.push({ startedAt: new Date(state.openStationaryAt).toISOString(), endedAt: new Date(state.candidateSince ?? fix.timestamp).toISOString() });
      delete state.openStationaryAt;
    }
    state.status = next;
    if (next === 'moving') state.movingMs += state.candidateMs;
    else {
      state.stoppedMs += state.candidateMs;
      state.openStationaryAt = state.candidateSince;
    }
    state.candidateMs = 0;
    delete state.candidate;
    delete state.candidateSince;
  }
  return state;
}

export function motionTotals(state: MotionState | undefined, activeMs: number) {
  if (!state) return { movingMs: null, stoppedMs: null, unclassifiedMs: activeMs };
  const movingMs = Math.max(0, Math.min(activeMs, state.movingMs));
  const stoppedMs = Math.max(0, Math.min(activeMs - movingMs, state.stoppedMs));
  return { movingMs, stoppedMs, unclassifiedMs: Math.max(0, activeMs - movingMs - stoppedMs) };
}
