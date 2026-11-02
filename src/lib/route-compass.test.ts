import { compassDirection, directionArrowCoordinates, usableCompassHeading } from './route-compass';

describe('live route compass', () => {
  it('wraps headings and names cardinal directions', () => {
    expect(compassDirection(0)).toBe('N');
    expect(compassDirection(46)).toBe('NE');
    expect(compassDirection(181)).toBe('S');
    expect(compassDirection(359)).toBe('N');
    expect(compassDirection(-90)).toBe('W');
  });

  it('prefers true north and falls back to magnetic heading', () => {
    expect(usableCompassHeading({ trueHeading: 92, magHeading: 80, accuracy: 2 })).toBe(92);
    expect(usableCompassHeading({ trueHeading: -1, magHeading: 80, accuracy: 2 })).toBe(80);
  });

  it('rejects uncalibrated readings', () => {
    expect(usableCompassHeading({ trueHeading: 90, magHeading: 90, accuracy: 0 })).toBeNull();
  });

  it('points the map arrow along the heading', () => {
    const north = directionArrowCoordinates([-84, 36], 0);
    const east = directionArrowCoordinates([-84, 36], 90);
    expect(north[0][1]).toBeGreaterThan(36);
    expect(east[0][0]).toBeGreaterThan(-84);
    expect(north.at(-1)).toEqual(north[0]);
    const metersPerPixel = 156_543.03392 * Math.cos(36 * Math.PI / 180) / (2 ** 15);
    const widthPixels = (north[1][0] - north[3][0]) * 111_320 * Math.cos(36 * Math.PI / 180) / metersPerPixel;
    const heightPixels = (north[0][1] - north[1][1]) * 111_320 / metersPerPixel;
    expect(widthPixels).toBeCloseTo(14, 0);
    expect(heightPixels).toBeCloseTo(16, 0);
    const zoomedIn = directionArrowCoordinates([-84, 36], 0, 17);
    expect(zoomedIn[0][1] - 36).toBeLessThan(north[0][1] - 36);
  });
});
