export const HOME_CARDS = [
  { id: 'quit', title: 'Quit & taper timer', description: 'Time, next badge and support for what you’re quitting.' },
  { id: 'habitBadges', title: 'Good habit badges', description: 'The next badge for each good habit.' },
  { id: 'weather', title: 'Weather', description: 'Today’s forecast for getting outside.' },
  { id: 'progress', title: 'Today’s progress', description: 'Your daily goals and how far along they are.' },
  { id: 'nutrition', title: 'Nutrition & Calories', description: 'What you’ve eaten and burned so far.' },
  { id: 'training', title: 'Training overview', description: 'Strength and cardio summaries.' },
  { id: 'mindfulness', title: 'Mindfulness', description: 'Your mindfulness goal and a quick way to start.' },
  { id: 'weekly', title: 'Weekly habits', description: 'Habits with a goal for the week.' },
  { id: 'weight', title: 'Weight', description: 'Your latest weigh-in and recent trend.' },
] as const;

export type HomeCardId = typeof HOME_CARDS[number]['id'];

const DEFAULT_ORDER = HOME_CARDS.map((card) => card.id) as HomeCardId[];
const isHomeCard = (id: unknown): id is HomeCardId => DEFAULT_ORDER.includes(id as HomeCardId);

/** Keeps the saved order, drops anything unknown, and puts any card added in an update at the end. */
export function normalizeHomeCardOrder(value: unknown): HomeCardId[] {
  const saved = Array.isArray(value) ? [...new Set(value.filter(isHomeCard))] : [];
  return [...saved, ...DEFAULT_ORDER.filter((id) => !saved.includes(id))];
}

export function normalizeHiddenHomeCards(value: unknown): HomeCardId[] {
  return Array.isArray(value) ? [...new Set(value.filter(isHomeCard))] : [];
}

/**
 * Moves a card among the ones this person can see. Cards that don't apply to them stay in their
 * own slots, so they come back in a sensible place if they ever apply.
 */
export function moveHomeCard(order: readonly HomeCardId[], id: HomeCardId, delta: number, available: readonly HomeCardId[] = order): HomeCardId[] {
  const shown = order.filter((card) => available.includes(card));
  const from = shown.indexOf(id);
  if (from < 0 || !Number.isFinite(delta)) return [...order];
  shown.splice(from, 1);
  shown.splice(Math.max(0, Math.min(shown.length, from + Math.round(delta))), 0, id);
  let next = 0;
  return order.map((card) => available.includes(card) ? shown[next++] : card);
}

/** Turned-off cards sit below the ones on Home, keeping their order within each group. */
export function hiddenCardsLast(order: readonly HomeCardId[], hidden: readonly HomeCardId[]): HomeCardId[] {
  return [...order.filter((id) => !hidden.includes(id)), ...order.filter((id) => hidden.includes(id))];
}

/** A card turned off drops to the very bottom; one turned back on joins the end of the cards on Home. */
export function reorderForVisibility(order: readonly HomeCardId[], hidden: readonly HomeCardId[], id: HomeCardId, visible: boolean): HomeCardId[] {
  const nextHidden = visible ? hidden.filter((card) => card !== id) : [...hidden.filter((card) => card !== id), id];
  const others = order.filter((card) => card !== id);
  return visible
    ? [...others.filter((card) => !nextHidden.includes(card)), id, ...others.filter((card) => nextHidden.includes(card))]
    : [...hiddenCardsLast(others, nextHidden), id];
}
