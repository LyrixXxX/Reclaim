export const HOME_GOAL_COLORS = [
  '#6DD7B1', '#B98CFF', '#63D8C6', '#C8F15A',
  '#F2B766', '#F47F9B', '#78B7FF', '#19DDD0',
] as const;

export function normalizeHomeGoalColors(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, color]) => id.length > 0 && HOME_GOAL_COLORS.includes(color as typeof HOME_GOAL_COLORS[number])));
}

export function homeGoalColor(id: string, saved: Record<string, string> | undefined, fallback: string): string {
  const chosen = saved?.[id];
  return chosen && HOME_GOAL_COLORS.includes(chosen as typeof HOME_GOAL_COLORS[number]) ? chosen : fallback;
}
