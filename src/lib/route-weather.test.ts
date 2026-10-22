import { clearRouteForecastCacheForTests, getRouteForecast, gpsAccuracyBars } from './route-weather';

beforeEach(() => clearRouteForecastCacheForTests());

test('shows GPS accuracy levels without claiming satellite signal strength', () => {
  expect([5, 15, 30, 45, 100, null].map(gpsAccuracyBars)).toEqual([4, 3, 2, 1, 0, 0]);
});

test('loads current-hour NWS forecast and caches the location', async () => {
  const request = jest.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => url.includes('/points/')
      ? { properties: { forecastHourly: 'https://api.weather.gov/gridpoints/OHX/1,2/forecast/hourly', relativeLocation: { properties: { city: 'Crossville', state: 'TN' } } } }
      : { properties: { periods: [{ startTime: '2026-10-18T12:00:00Z', endTime: '2026-10-18T13:00:00Z', temperature: 65, temperatureUnit: 'F', shortForecast: 'Partly Cloudy' }] } },
  })) as unknown as typeof fetch;
  const now = Date.parse('2026-10-18T12:30:00Z');
  expect(await getRouteForecast(35.95, -85.03, now, request)).toMatchObject({ status: 'ready', area: 'Crossville, TN', temperature: 65, symbol: '☁' });
  await getRouteForecast(35.951, -85.031, now + 1000, request);
  expect(request).toHaveBeenCalledTimes(2);
});

test('does not request outside U.S. coverage and handles missing or failed NWS responses', async () => {
  const request = jest.fn(async () => ({ status: 404, ok: false })) as unknown as typeof fetch;
  expect(await getRouteForecast(40.42, -3.70, Date.now(), request)).toEqual({ status: 'unavailable' });
  expect(request).not.toHaveBeenCalled();
  expect(await getRouteForecast(35.95, -85.03, Date.now(), request)).toEqual({ status: 'unavailable' });
  const failure = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  expect(await getRouteForecast(36.01, -85.03, Date.now(), failure)).toEqual({ status: 'error' });
});
