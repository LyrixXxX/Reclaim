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
  getWalkingIntervals(date: string): Promise<{ startedAt: number; endedAt: number }[]>;
  getWalkingHistory(): Promise<{ date: string; intervals: { startedAt: number; endedAt: number }[] }[]>;
  hasStepDetector(): Promise<boolean>;
  restoreHistory(entries: { date: string; count: number; incomplete: boolean }[]): Promise<void>;
};

export default requireOptionalNativeModule<ReclaimStepsNativeModule>('ReclaimSteps');
