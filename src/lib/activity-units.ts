export const METERS_PER_MILE = 1609.344;

export function formatMiles(meters: number) {
  return `${(meters / METERS_PER_MILE).toFixed(2)} mi`;
}
