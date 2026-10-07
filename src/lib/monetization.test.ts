import { adMode, hasAdFreePurchase, verifyAdFreePurchase } from './monetization';

test('test ads are a distinct mode and take precedence over live monetization', () => {
  expect(adMode(undefined, undefined)).toBe('off');
  expect(adMode('1', undefined)).toBe('test');
  expect(adMode(undefined, '1')).toBe('live');
  expect(adMode('1', '1')).toBe('test');
});

test('only a completed remove-ads purchase unlocks ad-free', () => {
  expect(hasAdFreePurchase([])).toBe(false);
  expect(hasAdFreePurchase([{ productId: 'remove_ads', purchaseState: 'pending' }])).toBe(false);
  expect(hasAdFreePurchase([{ productId: 'other', purchaseState: 'purchased' }])).toBe(false);
  expect(hasAdFreePurchase([{ productId: 'remove_ads', purchaseState: 'purchased' }])).toBe(true);
});

test('never verifies a pending purchase or one without a token', async () => {
  await expect(verifyAdFreePurchase({ productId: 'remove_ads', purchaseState: 'pending', purchaseToken: 'pending-token' })).resolves.toBe(false);
  await expect(verifyAdFreePurchase({ productId: 'remove_ads', purchaseState: 'purchased' })).resolves.toBe(false);
});
