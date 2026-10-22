import { completedMile, nextMileAlert } from './route-mile-alerts';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

test('announces completed miles only after the threshold is crossed', () => {
  expect(completedMile(1609)).toBe(0);
  expect(completedMile(1609.344)).toBe(1);
  expect(nextMileAlert(1609.344, 0)).toBe(1);
  expect(nextMileAlert(1800, 1)).toBeNull();
  expect(nextMileAlert(3218.688, 1)).toBe(2);
  expect(nextMileAlert(NaN, 0)).toBeNull();
});
