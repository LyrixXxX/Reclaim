import { BODY_PART_LABELS, bodyPartFor } from '@/lib/body-parts';
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
    const terms = [item.name, item.primaryMuscle, BODY_PART_LABELS[bodyPartFor(item.primaryMuscle)], item.equipment, ...(item.aliases ?? [])].map(normalize);
    return words.every((word) => terms.some((term) => term.split(' ').some((piece) => piece.startsWith(word))));
  }).map((item) => ({ item, rank: matchRank(item, words) })).sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name)).map(({ item }) => item);
}

/** Lower is closer: exact name, name prefix, every word in the name, an alias, then muscle/equipment only. */
function matchRank(item: StrengthExercise, words: string[]) {
  if (!words.length) return 0;
  const query = words.join(' ');
  const name = normalize(item.name);
  const nameWords = name.split(' ');
  const inName = (word: string) => nameWords.some((piece) => piece.startsWith(word));
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (words.every(inName)) return words.every((word, index) => index === 0 || name.indexOf(word) > name.indexOf(words[index - 1])) ? 2 : 3;
  if ((item.aliases ?? []).map(normalize).some((alias) => words.every((word) => alias.split(' ').some((piece) => piece.startsWith(word))))) return 4;
  return 5;
}

export function similarStrengthExercises(exercises: StrengthExercise[], candidate: Pick<StrengthExercise, 'name' | 'equipment' | 'primaryMuscle'>, excludeId?: string) {
  return exercises.filter((item) => item.id !== excludeId && normalize(item.name) === normalize(candidate.name) && item.equipment === candidate.equipment && item.primaryMuscle === candidate.primaryMuscle);
}
