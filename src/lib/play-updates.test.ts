import { shouldPromptForPlayUpdate } from './play-updates';

test('only offers a newer allowed Play update, at most once per version per day', () => {
  expect(shouldPromptForPlayUpdate(7, 8, true, null, '2026-10-15')).toBe(true);
  expect(shouldPromptForPlayUpdate(7, 7, true, null, '2026-10-15')).toBe(false);
  expect(shouldPromptForPlayUpdate(7, 8, false, null, '2026-10-15')).toBe(false);
  expect(shouldPromptForPlayUpdate(7, 8, true, { versionCode: 8, day: '2026-10-15' }, '2026-10-15')).toBe(false);
  expect(shouldPromptForPlayUpdate(7, 9, true, { versionCode: 8, day: '2026-10-15' }, '2026-10-15')).toBe(true);
  expect(shouldPromptForPlayUpdate(7, 8, true, { versionCode: 8, day: '2026-10-15' }, '2026-10-16')).toBe(true);
});
