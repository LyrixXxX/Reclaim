import { createReclaimBackup, parseReclaimBackup } from './backup';
import { createFreshState } from './onboarding';
import { isRoutePhotoName, routePhotoName } from './route-photo-names';

describe('route photo names', () => {
  test('accepts only plain image file names', () => {
    expect(isRoutePhotoName('route-1-1700000000000-0.jpg')).toBe(true);
    expect(isRoutePhotoName('../secrets.jpg')).toBe(false);
    expect(isRoutePhotoName('folder/photo.jpg')).toBe(false);
    expect(isRoutePhotoName('photo.exe')).toBe(false);
    expect(isRoutePhotoName(5)).toBe(false);
  });

  test('builds a valid name from any route id and source', () => {
    const name = routePhotoName('route/1 two', 2, 'IMG_01.HEIC', 1000);
    expect(name).toBe('route-1-two-1000-2.heic');
    expect(isRoutePhotoName(name)).toBe(true);
    expect(routePhotoName('r', 0, 'no-extension', 1)).toBe('r-1-0.jpg');
  });
});

describe('route photos in backups', () => {
  const route = { id: 'r', kind: 'hike' as const, startedAt: '2026-11-01T10:00:00Z', endedAt: '2026-11-01T11:00:00Z', pausedMs: 0, distanceMeters: 100, points: [] };
  const backup = (photos: unknown) => JSON.stringify(createReclaimBackup({ ...createFreshState(), activityRoutes: [{ ...route, photos: photos as string[] }] }));

  test('a backup keeps the names, so photos reappear when restored on the same phone', () => {
    expect(parseReclaimBackup(backup(['r-1-0.jpg'])).state.activityRoutes?.[0].photos).toEqual(['r-1-0.jpg']);
  });

  test('a backup with an unsafe photo name is refused', () => {
    expect(() => parseReclaimBackup(backup(['../../secrets.jpg']))).toThrow();
    expect(() => parseReclaimBackup(backup('r-1-0.jpg'))).toThrow();
  });
});
