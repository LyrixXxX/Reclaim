import { canShowCompletionAd, recordCompletionAd } from './ad-frequency';

test('limits completion ads to six per local day and fifteen minutes apart', () => {
  const start = new Date(2026, 9, 13, 9, 0);
  let history = recordCompletionAd({ day: '', shownAt: [] }, start);
  expect(canShowCompletionAd(history, new Date(2026, 9, 13, 9, 14))).toBe(false);
  for (let index = 1; index < 6; index++) {
    const next = new Date(2026, 9, 13, 9, index * 15);
    expect(canShowCompletionAd(history, next)).toBe(true);
    history = recordCompletionAd(history, next);
  }
  expect(canShowCompletionAd(history, new Date(2026, 9, 13, 18))).toBe(false);
  expect(canShowCompletionAd(history, new Date(2026, 9, 14, 0, 1))).toBe(true);
});
