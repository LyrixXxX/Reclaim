import { canShowCompletionAd, canShowPostSaveAd, recordCompletionAd, shouldOfferWeightSaveAd } from './ad-frequency';

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

test('meal saves have no daily or time cap while route saves retain the shared cap', () => {
  const start = new Date(2026, 10, 1, 9, 0);
  const history = { day: '2026-11-01', shownAt: Array.from({ length: 6 }, (_, index) => start.getTime() + index * 1000) };
  const now = new Date(2026, 10, 1, 9, 1);
  expect(canShowPostSaveAd('meal', history, now)).toBe(true);
  expect(canShowPostSaveAd('route', history, now)).toBe(false);
});

test('weight ad is limited to one per local day and still respects the shared cooldown', () => {
  const morning = new Date(2026, 10, 1, 9, 0);
  const start = { day: '', shownAt: [] };
  expect(canShowPostSaveAd('weight', start, morning)).toBe(true);
  const afterWeight = recordCompletionAd(start, morning, 'weight');
  expect(canShowPostSaveAd('weight', afterWeight, new Date(2026, 10, 1, 15, 0))).toBe(false);
  expect(canShowPostSaveAd('weight', afterWeight, new Date(2026, 10, 2, 9, 0))).toBe(true);
  const afterRoute = recordCompletionAd(start, morning, 'route');
  expect(canShowPostSaveAd('weight', afterRoute, new Date(2026, 10, 1, 9, 14))).toBe(false);
  expect(canShowPostSaveAd('weight', afterRoute, new Date(2026, 10, 1, 9, 15))).toBe(true);
});

test('weight ad is offered only for a new current-day weigh-in', () => {
  expect(shouldOfferWeightSaveAd('2026-11-01', '2026-11-01', false, [])).toBe(true);
  expect(shouldOfferWeightSaveAd('2026-11-01', '2026-11-01', true, [])).toBe(false);
  expect(shouldOfferWeightSaveAd('2026-11-01', '2026-11-01', false, ['2026-11-01'])).toBe(false);
  expect(shouldOfferWeightSaveAd('2026-10-31', '2026-11-01', false, [])).toBe(false);
});
