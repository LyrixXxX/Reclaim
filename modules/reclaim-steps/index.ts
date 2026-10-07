import { requireOptionalNativeModule } from 'expo';

export type NativeStepStatus = {
  available: boolean;
  enabled: boolean;
  running: boolean;
  count: number;
  date: string;
  lastSampleAt: number;
  incomplete: boolean;
};

export type ReclaimStepsNativeModule = {
  getStatus(): Promise<NativeStepStatus>;
  start(): Promise<NativeStepStatus>;
  stop(): Promise<NativeStepStatus>;
  getHistory(): Promise<{ date: string; count: number; incomplete: boolean }[]>;
  restoreHistory(entries: { date: string; count: number; incomplete: boolean }[]): Promise<void>;
};

export default requireOptionalNativeModule<ReclaimStepsNativeModule>('ReclaimSteps');
