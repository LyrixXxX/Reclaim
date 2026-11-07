import { MuscleGroup } from '@/models/tracker';
import { colors } from '@/theme';

/** The simple body parts people tag and chart workouts by. Detailed muscles roll up into these. */
export type BodyPart = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core' | 'full body';

export const BODY_PARTS: BodyPart[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full body'];

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', core: 'Core', 'full body': 'Full body',
};

export const BODY_PART_COLORS: Record<BodyPart, string> = {
  chest: colors.nutritionCalories, back: colors.weightNav, shoulders: colors.workoutsNav, arms: colors.nutritionNav,
  legs: colors.accent, core: colors.activityNav, 'full body': colors.settingsNav,
};

// Stored exercises keep their detailed primaryMuscle; the body part is always derived from it, so
// existing history and the built-in catalog need no migration.
const PART_BY_MUSCLE: Record<MuscleGroup, BodyPart> = {
  chest: 'chest',
  back: 'back', traps: 'back',
  shoulders: 'shoulders',
  biceps: 'arms', triceps: 'arms', forearms: 'arms', arms: 'arms',
  quadriceps: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', legs: 'legs',
  core: 'core',
  'full body': 'full body',
};

export function bodyPartFor(muscle: MuscleGroup): BodyPart {
  return PART_BY_MUSCLE[muscle];
}

/** The muscle stored when someone picks a body part without choosing a finer detail. */
export function genericMuscleFor(part: BodyPart): MuscleGroup {
  return part;
}

/** Optional finer tags within a body part, excluding the generic one. */
export function detailMusclesFor(part: BodyPart): MuscleGroup[] {
  return (Object.keys(PART_BY_MUSCLE) as MuscleGroup[]).filter((muscle) => PART_BY_MUSCLE[muscle] === part && muscle !== part);
}

export function muscleLabel(muscle: MuscleGroup): string {
  return muscle === 'quadriceps' ? 'Quads' : muscle.charAt(0).toUpperCase() + muscle.slice(1);
}
