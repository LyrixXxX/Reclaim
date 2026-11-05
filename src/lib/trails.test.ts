import { directionsUrl, isSavedTrail, milesBetween, parseTrails, removeSavedTrail, saveTrail, searchPlace, sortSavedTrails, toggleFavoriteTrail, trailPhoto, trailQuery, searchTrails, parseStadiaTrails, combineTrails, searchStadiaTrails } from './trails';

const ORIGIN = { latitude: 35.95, longitude: -85.03 };
const NOW = new Date('2026-11-04T12:00:00Z');

describe('trail search', () => {
  it('measures miles between points', () => {
    expect(milesBetween(ORIGIN, ORIGIN)).toBe(0);
    expect(milesBetween({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(69.09, 1);
  });

  it('searches named paths only on smaller radii', () => {
    expect(trailQuery(35.95, -85.03, 10)).toContain('way["highway"="path"]');
    expect(trailQuery(35.95, -85.03, 25)).not.toContain('way["highway"="path"]');
    expect(trailQuery(35.95, -85.03, 5)).toContain('around:8047,35.95000,-85.03000');
  });

  it('parses trails closest first, merges split paths, keeps unnamed trailheads', () => {
    const response = { elements: [
      { type: 'way', id: 2, center: { lat: 35.97, lon: -85.03 }, tags: { highway: 'path', name: 'Cumberland Trail', sac_scale: 'mountain_hiking' } },
      { type: 'way', id: 3, center: { lat: 35.96, lon: -85.03 }, tags: { highway: 'path', name: 'Cumberland Trail', surface: 'dirt' } },
      { type: 'relation', id: 9, center: { lat: 36.0, lon: -85.03 }, tags: { route: 'hiking', name: 'Cumberland Trail', distance: '16' } },
      { type: 'node', id: 4, lat: 35.951, lon: -85.03, tags: { highway: 'trailhead' } },
      { type: 'node', id: 5, lat: 35.958, lon: -85.03, tags: { highway: 'trailhead', name: 'Ozone Falls Trailhead', 'addr:city': 'Crossville', 'addr:state': 'TN' } },
      { type: 'way', id: 6, center: { lat: 35.96, lon: -85.03 }, tags: { highway: 'path' } },
      { type: 'node', id: 7, lat: 37.5, lon: -85.03, tags: { highway: 'trailhead', name: 'Too far' } },
    ] };
    const results = parseTrails(response, ORIGIN, 10);
    expect(results.map((item) => item.name)).toEqual(['Trailhead', 'Ozone Falls Trailhead', 'Cumberland Trail']);
    const trail = results[2];
    expect(trail).toMatchObject({ id: 'relation/9', kind: 'trail', latitude: 35.96, lengthMiles: 9.9, difficulty: 'Moderate', surface: 'Dirt' });
    expect(results[1].address).toBe('Crossville, TN');
    expect(parseTrails({}, ORIGIN, 10)).toEqual([]);
  });

  it('builds a Google Maps directions link', () => {
    expect(directionsUrl({ latitude: 35.95, longitude: -85.03 })).toBe('https://www.google.com/maps/dir/?api=1&destination=35.950000,-85.030000');
  });

  it('finds a place with Stadia', async () => {
    const request = jest.fn(async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [-85.03, 35.95] }, properties: { label: 'Crossville, TN, USA' } }] }) })) as unknown as typeof fetch;
    expect(await searchPlace('Crossville', 'key', request)).toEqual({ label: 'Crossville, TN, USA', latitude: 35.95, longitude: -85.03 });
    expect(await searchPlace('  ', 'key', request)).toBeNull();
    await expect(searchPlace('Crossville', '', request)).rejects.toThrow(/use your location/i);
  });
});

describe('saved trails', () => {
  const trail = { id: 'node/5', name: 'Ozone Falls', kind: 'trailhead' as const, latitude: 35.95, longitude: -85.03, distanceMiles: 3 };

  it('saves once, without the search distance', () => {
    const saved = saveTrail([], trail, NOW);
    expect(saved).toEqual([{ id: 'node/5', name: 'Ozone Falls', kind: 'trailhead', latitude: 35.95, longitude: -85.03, savedAt: NOW.toISOString() }]);
    expect(saveTrail(saved, trail, NOW)).toHaveLength(1);
    expect(isSavedTrail(saved[0])).toBe(true);
    expect(isSavedTrail({ ...saved[0], latitude: 200 })).toBe(false);
  });

  it('favorites, saving first when needed, and unfavorites', () => {
    const favorite = toggleFavoriteTrail([], trail, NOW);
    expect(favorite).toEqual([expect.objectContaining({ id: 'node/5', favorite: true })]);
    expect(favorite[0]).not.toHaveProperty('distanceMiles');
    expect(toggleFavoriteTrail(favorite, trail, NOW)[0].favorite).toBeUndefined();
  });

  it('lists favorites first, then newest, and removes', () => {
    const list = [
      { ...trail, id: 'a', savedAt: '2026-11-01T00:00:00Z' },
      { ...trail, id: 'b', savedAt: '2026-11-03T00:00:00Z' },
      { ...trail, id: 'c', savedAt: '2026-10-01T00:00:00Z', favorite: true },
    ];
    expect(sortSavedTrails(list).map((item) => item.id)).toEqual(['c', 'b', 'a']);
    expect(removeSavedTrail(list, 'b').map((item) => item.id)).toEqual(['a', 'c']);
  });
});

describe('trail photos', () => {
  const commons = { query: { pages: { '1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/800px-Trail.jpg', thumbwidth: 800, thumbheight: 600, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Trail.jpg', extmetadata: { Artist: { value: '<a href="x">Jane &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } };
  const respond = (routes: Record<string, unknown>) => jest.fn(async (url: string) => {
    const key = Object.keys(routes).find((part) => url.includes(part));
    return { ok: !!key, json: async () => (key ? routes[key] : null) };
  }) as unknown as typeof fetch;

  it('follows Wikidata to a Commons photo with credit', async () => {
    const request = respond({ 'wikidata.org': { entities: { Q1: { claims: { P18: [{ mainsnak: { datavalue: { value: 'Trail.jpg' } } }] } } } }, 'commons.wikimedia.org': commons });
    expect(await trailPhoto({ wikidata: 'Q1' }, request)).toEqual({ url: 'https://upload.wikimedia.org/thumb/800px-Trail.jpg', width: 800, height: 600, credit: 'Jane & Co', license: 'CC BY-SA 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Trail.jpg' });
  });

  it('falls back to the Wikipedia article image', async () => {
    const request = respond({ 'en.wikipedia.org': { query: { pages: { '5': { pageimage: 'Trail.jpg' } } } }, 'commons.wikimedia.org': commons });
    expect((await trailPhoto({ wikipedia: 'en:Cumberland Trail' }, request))?.credit).toBe('Jane & Co');
  });

  it('skips files that are not on Commons, and trails with no links', async () => {
    const request = respond({ 'en.wikipedia.org': { query: { pages: { '5': { pageimage: 'Local.jpg' } } } }, 'commons.wikimedia.org': { query: { pages: { '-1': { missing: '' } } } } });
    expect(await trailPhoto({ wikipedia: 'en:Some Trail' }, request)).toBeNull();
    expect(await trailPhoto({}, request)).toBeNull();
  });

  it('reads Wikidata and Wikipedia links from the map', () => {
    const [trail] = parseTrails({ elements: [{ type: 'relation', id: 1, center: { lat: 35.96, lon: -85.03 }, tags: { route: 'hiking', name: 'Cumberland Trail', wikidata: 'Q5194226', wikipedia: 'en:Cumberland Trail' } }] }, ORIGIN, 10);
    expect(trail).toMatchObject({ wikidata: 'Q5194226', wikipedia: 'en:Cumberland Trail' });
  });
});

describe('trail search servers', () => {
  const ok = { ok: true, status: 200, json: async () => ({ elements: [{ type: 'node', id: 1, lat: 35.951, lon: -85.03, tags: { highway: 'trailhead', name: 'Ozone' } }] }) };
  it('moves on from a busy or unreachable server', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce(ok) as unknown as typeof fetch;
    expect((await searchTrails(35.95, -85.03, 5, request, ['a', 'b', 'c'])).map((item) => item.name)).toEqual(['Ozone']);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('says the service is busy when every server fails', async () => {
    const request = jest.fn().mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;
    await expect(searchTrails(35.95, -85.03, 5, request, ['a', 'b'])).rejects.toThrow(/busy/);
  });
  it('stops on a request error', async () => {
    const request = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as unknown as typeof fetch;
    await expect(searchTrails(35.95, -85.03, 5, request, ['a', 'b'])).rejects.toThrow('(400)');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('Stadia trail results', () => {
  const feature = (id: string, name: string, lon: number, lat: number, extra: object = {}) => ({ geometry: { coordinates: [lon, lat] }, properties: { id, name, source: 'openstreetmap', layer: 'venue', locality: 'Fairfield Glade', region_a: 'TN', ...extra } });

  it('keeps trailheads, trails and waterfalls, and skips everything else', () => {
    const results = parseStadiaTrails([{ features: [
      feature('node/1', 'Library Trail Trailhead', -85.03, 35.951),
      feature('way/2', 'Fox Trail', -85.03, 35.96),
      feature('node/3', 'Ozone Falls', -85.03, 35.97),
      feature('node/4', 'Cumberland Trail Nemo Bridge Kiosk', -85.03, 35.952),
      feature('node/5', 'Summers Park', -85.03, 35.953),
      feature('x', 'Trail Branch', -85.03, 35.954, { source: 'geonames' }),
      feature('polyline:6', 'Autumn Trail', -85.03, 35.955, { layer: 'street' }),
      feature('node/7', 'Far Falls', -85.03, 37.5),
    ] }], ORIGIN, 10);
    expect(results.map((item) => [item.name, item.kind])).toEqual([['Library Trail Trailhead', 'trailhead'], ['Fox Trail', 'trail'], ['Ozone Falls', 'waterfall']]);
    expect(results[0].address).toBe('Fairfield Glade, TN');
  });

  it('merges a place found by Stadia and by the map search into one', () => {
    const stadia = parseStadiaTrails([{ features: [feature('node/5', 'Ozone Falls Trailhead', -85.03, 35.958)] }], ORIGIN, 10);
    const overpass = parseTrails({ elements: [{ type: 'node', id: 5, lat: 35.958, lon: -85.03, tags: { highway: 'trailhead', name: 'Ozone Falls Trailhead', operator: 'TN State Parks' } }] }, ORIGIN, 10);
    const combined = combineTrails([stadia, overpass]);
    expect(combined).toHaveLength(1);
    expect(combined[0]).toMatchObject({ id: 'node/5', operator: 'TN State Parks', address: 'Fairfield Glade, TN' });
  });

  it('runs one search per word, and none without a key', async () => {
    const request = jest.fn(async () => ({ ok: true, json: async () => ({ features: [feature('node/1', 'Library Trail Trailhead', -85.03, 35.951)] }) })) as unknown as typeof fetch;
    expect(await searchStadiaTrails(35.95, -85.03, 10, 'key', request)).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(3);
    expect(String((request as jest.Mock).mock.calls[0][0])).toContain('boundary.circle.radius=16');
    expect(await searchStadiaTrails(35.95, -85.03, 10, '', request)).toEqual([]);
  });
});
