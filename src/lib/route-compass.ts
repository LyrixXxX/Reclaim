export function compassDirection(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 45) % directions.length];
}

export function usableCompassHeading(heading: { trueHeading: number; magHeading: number; accuracy: number }): number | null {
  if (heading.accuracy < 1) return null;
  const degrees = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
  return Number.isFinite(degrees) ? ((degrees % 360) + 360) % 360 : null;
}

/** Signed shortest turn between two headings, in degrees within [-180, 180). */
export function headingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Low-pass filter for compass readings. Raw phone headings jitter by several degrees many times
 * a second; easing a fraction of the way toward each reading steadies the map and arrow. Wraps
 * through north, so 350° easing toward 10° turns forward instead of spinning back around.
 */
export function smoothHeading(previous: number | null, next: number, factor: number): number {
  if (previous === null) return next;
  return (((previous + headingDelta(previous, next) * factor) % 360) + 360) % 360;
}

export function directionArrowCoordinates(position: readonly [number, number], heading: number, zoom = 15): [number, number][] {
  const [longitude, latitude] = position;
  const radians = heading * Math.PI / 180;
  const latitudeDegreesPerMeter = 1 / 111_320;
  const latitudeScale = Math.max(0.01, Math.cos(latitude * Math.PI / 180));
  const longitudeDegreesPerMeter = 1 / (111_320 * latitudeScale);
  const metersPerPixel = 156_543.03392 * latitudeScale / (2 ** zoom);
  // Pixel-sized offsets keep the arrow legible as the map zoom changes.
  // About the same on-screen footprint as the 7 px location dot plus outline.
  const shape: [number, number][] = [[0, 9], [7, -7], [0, -3], [-7, -7], [0, 9]];
  return shape.map(([east, north]) => {
    const rotatedEast = (east * Math.cos(radians) + north * Math.sin(radians)) * metersPerPixel;
    const rotatedNorth = (north * Math.cos(radians) - east * Math.sin(radians)) * metersPerPixel;
    return [longitude + rotatedEast * longitudeDegreesPerMeter, latitude + rotatedNorth * latitudeDegreesPerMeter];
  });
}
