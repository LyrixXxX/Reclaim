import type { NativeStepStatus } from '../../modules/reclaim-steps';

const STARTUP_CHECK_DELAYS_MS = [250, 400, 600, 900];

/** Android starts a foreground service asynchronously; confirm it before reporting a failure. */
export async function waitForStepServiceStartup(
  readStatus: () => Promise<NativeStepStatus>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<NativeStepStatus> {
  let status: NativeStepStatus | undefined;
  for (const delay of STARTUP_CHECK_DELAYS_MS) {
    await wait(delay);
    status = await readStatus();
    if (status.running || !status.available || !status.enabled) return status;
  }
  return status!;
}
