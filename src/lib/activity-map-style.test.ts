import { RASTER_MAX_ZOOM, rasterMapStyle, rasterTileCoordinates, rasterTileUrl } from './activity-map-style';

test('builds a directly authenticated Stadia raster source with attribution', () => {
  expect(rasterTileUrl('a+b')).toContain('api_key=a%2Bb');
  const style = rasterMapStyle('a+b');
  const source = style.sources.stadia;
  if (source.type !== 'raster') throw new Error('Expected a raster source');
  expect(source.tiles?.[0]).toContain('api_key=a%2Bb');
  expect(source.attribution).toContain('OpenStreetMap');
});

test('caps tile requests at the deepest zoom Stadia serves', () => {
  const source = rasterMapStyle('key').sources.stadia;
  if (source.type !== 'raster') throw new Error('Expected a raster source');
  expect(source.maxzoom).toBe(RASTER_MAX_ZOOM);
  expect(RASTER_MAX_ZOOM).toBeLessThanOrEqual(20);
});

test('locates a valid tile at the dateline and latitude limits', () => {
  expect(rasterTileCoordinates(0, 0, 1)).toEqual({ x: 1, y: 1 });
  expect(rasterTileCoordinates(-180, 90, 12).x).toBe(0);
  expect(rasterTileCoordinates(180, -90, 12).x).toBe(4095);
});
