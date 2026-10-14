import { MuscleGroup } from '@/models/tracker';

export const MUSCLE_GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'core', 'traps', 'forearms', 'arms', 'legs', 'full body'];

export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === 'string' && MUSCLE_GROUPS.includes(value as MuscleGroup);
}
