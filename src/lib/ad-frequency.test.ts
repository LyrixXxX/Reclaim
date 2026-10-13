import { canShowCompletionAd, recordCompletionAd } from './ad-frequency';

test('limits completion ads to two per local day and twenty minutes apart', () => {
  const start = new Date(2026, 9, 13, 9, 0);
  const first = recordCompletionAd({ day: '', shownAt: [] }, start);
  expect(canShowCompletionAd(first, new Date(2026, 9, 13, 9, 19))).toBe(false);
  expect(canShowCompletionAd(first, new Date(2026, 9, 13, 9, 20))).toBe(true);
  const second = recordCompletionAd(first, new Date(2026, 9, 13, 9, 20));
  expect(canShowCompletionAd(second, new Date(2026, 9, 13, 12))).toBe(false);
  expect(canShowCompletionAd(second, new Date(2026, 9, 14, 0, 1))).toBe(true);
});
