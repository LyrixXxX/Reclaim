export const QUIET_PROMPT_INTERVAL_MS = 30_000;

// Original, on-device prompts. No network request or voice playback is needed.
export const QUIET_PROMPTS = [
  'Take a moment to settle into the present.',
  'There is nowhere else you need to be right now.',
  'Allow your shoulders to relax.',
  'Let your thoughts come and go, without needing to follow them.',
  'You do not have to solve everything in this moment.',
  'Breathe naturally, at your own pace.',
  'Notice the quiet spaces between your thoughts.',
  'You are allowed to rest.',
  'Whatever today has brought, this moment can be a fresh beginning.',
  'Release what you cannot control.',
  'Give yourself permission to simply be.',
  'There is no perfect way to feel right now.',
  'If your mind wanders, gently return to the present.',
  'One moment at a time is enough.',
  'Let yourself enjoy this quiet.',
  'You can carry this sense of calm with you when you are ready.',
] as const;

export function quietPromptFor(elapsedMs: number) {
  const index = Math.floor(Math.max(0, elapsedMs) / QUIET_PROMPT_INTERVAL_MS) % QUIET_PROMPTS.length;
  return QUIET_PROMPTS[index];
}
