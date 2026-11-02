import { QUIET_PROMPTS, QUIET_PROMPT_INTERVAL_MS, quietPromptFor } from './mindfulness-prompts';

test('quiet prompts advance gently with practiced time and loop', () => {
  expect(quietPromptFor(0)).toBe(QUIET_PROMPTS[0]);
  expect(quietPromptFor(QUIET_PROMPT_INTERVAL_MS - 1)).toBe(QUIET_PROMPTS[0]);
  expect(quietPromptFor(QUIET_PROMPT_INTERVAL_MS)).toBe(QUIET_PROMPTS[1]);
  expect(quietPromptFor(QUIET_PROMPT_INTERVAL_MS * QUIET_PROMPTS.length)).toBe(QUIET_PROMPTS[0]);
});
