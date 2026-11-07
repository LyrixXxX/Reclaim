/** Colors for tracked nutrients on the Nutrition screens. */
export const NUTRIENT_COLORS = [
  '#6DD7B1', '#B98CFF', '#63D8C6', '#C8F15A',
  '#F2B766', '#F47F9B', '#78B7FF', '#19DDD0',
] as const;

/** Spread around the color wheel so goals are easy to tell apart in the Home ring. */
export const HOME_GOAL_COLOR_NAMES = {
  '#FF5C5C': 'Red', '#FF9F43': 'Orange', '#FFD93D': 'Yellow', '#B8F13C': 'Lime',
  '#3DDC6E': 'Green', '#19DDD0': 'Teal', '#38BDF8': 'Sky blue', '#5B8CFF': 'Blue',
  '#A970FF': 'Purple', '#E85DFF': 'Magenta', '#FF6FB1': 'Pink', '#E8EDF2': 'White',
} as const;
export const HOME_GOAL_COLORS = Object.keys(HOME_GOAL_COLOR_NAMES) as (keyof typeof HOME_GOAL_COLOR_NAMES)[];

// Goals colored from the earlier, softer palette move to its closest replacement.
const EARLIER_COLORS: Record<string, string> = {
  '#6DD7B1': '#3DDC6E', '#B98CFF': '#A970FF', '#63D8C6': '#19DDD0', '#C8F15A': '#B8F13C',
  '#F2B766': '#FF9F43', '#F47F9B': '#FF6FB1', '#78B7FF': '#5B8CFF',
};
const currentColor = (color: unknown): string | undefined => {
  const updated = typeof color === 'string' ? EARLIER_COLORS[color] ?? color : undefined;
  return HOME_GOAL_COLORS.includes(updated as typeof HOME_GOAL_COLORS[number]) ? updated : undefined;
};

// A goal's natural color when it's free, so water tends to be blue and so on.
const SUGGESTED_COLORS: Record<string, string> = {
  steps: '#38BDF8', nutrition: '#FFD93D', water: '#5B8CFF', walk: '#3DDC6E', reading: '#FF9F43',
  sleep: '#A970FF', supplements: '#FF5C5C', mindfulness: '#19DDD0', dental: '#E8EDF2', exercise: '#FF6FB1',
};

export type ColoredGoal = { id: string; kind: string };

/**
 * Gives every goal its own color. Goals keep the color they have; one with no color, or sharing a
 * color with an earlier goal, gets the first free one. Colors repeat only if goals outnumber them.
 */
export function assignGoalColors(goals: readonly ColoredGoal[], saved: Record<string, string>): Record<string, string> {
  const assigned = { ...saved };
  const used = new Set<string>();
  const needColor: ColoredGoal[] = [];
  for (const goal of goals) {
    const color = saved[goal.id];
    if (color && !used.has(color)) used.add(color);
    else needColor.push(goal);
  }
  for (const goal of needColor) {
    const suggested = SUGGESTED_COLORS[goal.kind];
    const color = suggested && !used.has(suggested) ? suggested : HOME_GOAL_COLORS.find((option) => !used.has(option)) ?? HOME_GOAL_COLORS[used.size % HOME_GOAL_COLORS.length];
    assigned[goal.id] = color;
    used.add(color);
  }
  return assigned;
}

export function normalizeHomeGoalColors(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, color]) => { const current = currentColor(color); return id.length > 0 && current ? [[id, current]] : []; }));
}

export function homeGoalColor(id: string, saved: Record<string, string> | undefined, fallback: string): string {
  return currentColor(saved?.[id]) ?? fallback;
}
