import { walkingMinutesHistoryOutsideRoutes, walkingMinutesOutsideRoutes } from './walking-minutes';

const at = (minute: number) => new Date(2026, 9, 22, 9, minute).getTime();
const route = (start: number, end: number) => ({ startedAt: new Date(at(start)).toISOString(), endedAt: new Date(at(end)).toISOString() });

test('credits confirmed walking outside route recording, including overlapping routes', () => {
  expect(walkingMinutesOutsideRoutes([{ startedAt: at(0), endedAt: at(30) }], [route(5, 15), route(10, 25)])).toBe(10);
});

test('excludes a live route and ignores invalid or interrupted intervals', () => {
  const intervals = [{ startedAt: at(0), endedAt: at(10) }, { startedAt: at(15), endedAt: at(20) }, { startedAt: at(21), endedAt: at(21) }];
  expect(walkingMinutesOutsideRoutes(intervals, [], { startedAt: new Date(at(5)).toISOString() }, at(18))).toBe(7);
  expect(walkingMinutesOutsideRoutes([], [route(0, 20)])).toBe(0);
});

test('preserves separate daily walking history and never backfills a missing day', () => {
  expect(walkingMinutesHistoryOutsideRoutes([{ date: '2026-10-22', intervals: [{ startedAt: at(0), endedAt: at(10) }] }], [route(5, 7)]))
    .toEqual({ '2026-10-22': 8 });
});
