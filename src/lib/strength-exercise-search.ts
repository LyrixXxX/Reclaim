import { ExerciseEquipment, MuscleGroup, StrengthExercise } from '@/models/tracker';

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export type ExerciseSearchFilters = { muscle?: MuscleGroup | 'all'; equipment?: ExerciseEquipment | 'all'; source?: 'all' | 'builtin' | 'custom' };

export function searchStrengthExercises(exercises: StrengthExercise[], query: string, filters: ExerciseSearchFilters = {}) {
  const words = normalize(query).split(' ').filter(Boolean);
  return exercises.filter((item) => {
    if (filters.muscle && filters.muscle !== 'all' && item.primaryMuscle !== filters.muscle && !item.secondaryMuscles.includes(filters.muscle)) return false;
    if (filters.equipment && filters.equipment !== 'all' && item.equipment !== filters.equipment) return false;
    if (filters.source === 'builtin' && item.custom) return false;
    if (filters.source === 'custom' && !item.custom) return false;
    const terms = [item.name, item.primaryMuscle, item.equipment, ...(item.aliases ?? [])].map(normalize);
    return words.every((word) => terms.some((term) => term.split(' ').some((piece) => piece.startsWith(word))));
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function similarStrengthExercises(exercises: StrengthExercise[], candidate: Pick<StrengthExercise, 'name' | 'equipment' | 'primaryMuscle'>, excludeId?: string) {
  return exercises.filter((item) => item.id !== excludeId && normalize(item.name) === normalize(candidate.name) && item.equipment === candidate.equipment && item.primaryMuscle === candidate.primaryMuscle);
}
