import NativeSteps from '../../modules/reclaim-steps';

/** Today's count from the phone's step service, or undefined when it isn't counting. Safe to call with the app closed. */
export async function readWidgetStepCount(): Promise<number | undefined> {
  if (!NativeSteps) return undefined;
  try {
    const status = await NativeSteps.getStatus();
    return status.available && status.enabled ? status.count : undefined;
  } catch { return undefined; }
}
