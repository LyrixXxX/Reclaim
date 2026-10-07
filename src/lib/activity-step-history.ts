import NativeSteps from '../../modules/reclaim-steps';
import { StepDay, StepGoal } from '@/models/tracker';

export const DEFAULT_STEP_GOAL = 0;

export function goalForDate(goals: readonly StepGoal[], date: string): number {
  return [...goals].filter((goal) => goal.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.count ?? DEFAULT_STEP_GOAL;
}

export function setDailyStepGoal(goals: readonly StepGoal[], date: string, count: number): StepGoal[] {
  if (!Number.isInteger(count) || count < 1 || count > 100000) throw new Error('Enter a goal between 1 and 100,000 steps.');
  return [...goals.filter((goal) => goal.effectiveDate !== date), { effectiveDate: date, count }]
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export async function readStepHistory(): Promise<StepDay[]> {
  return NativeSteps ? NativeSteps.getHistory() : [];
}

export async function restoreStepHistory(entries: StepDay[]): Promise<void> {
  if (!NativeSteps) {
    if (entries.length) throw new Error('This build cannot restore phone step history.');
    return;
  }
  await NativeSteps.restoreHistory(entries);
}
