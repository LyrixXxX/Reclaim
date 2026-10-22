import { NativeStepStatus } from '../../modules/reclaim-steps';
import { waitForStepServiceStartup } from './step-startup';

const status = (running: boolean): NativeStepStatus => ({ available: true, enabled: true, running, count: 0, date: '2026-10-15', lastSampleAt: 0, incomplete: true });

test('waits for a foreground step service that starts shortly after the native call', async () => {
  const read = jest.fn().mockResolvedValueOnce(status(false)).mockResolvedValueOnce(status(true));
  const wait = jest.fn().mockResolvedValue(undefined);
  expect((await waitForStepServiceStartup(read, wait)).running).toBe(true);
  expect(read).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(250);
});

test('still reports a service that never starts after bounded checks', async () => {
  const read = jest.fn().mockResolvedValue(status(false));
  const wait = jest.fn().mockResolvedValue(undefined);
  expect((await waitForStepServiceStartup(read, wait)).running).toBe(false);
  expect(read).toHaveBeenCalledTimes(4);
});

test('stops waiting when the counter is unavailable', async () => {
  const read = jest.fn().mockResolvedValue({ ...status(false), available: false });
  const wait = jest.fn().mockResolvedValue(undefined);
  expect((await waitForStepServiceStartup(read, wait)).available).toBe(false);
  expect(read).toHaveBeenCalledTimes(1);
});
