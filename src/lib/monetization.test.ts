import { adMode, confirmAdFreePurchase, hasAdFreePurchase, reconcileAdFreePurchases, removeAdsPurchaseOption, showRemoveAdsButton, verifyAdFreePurchase } from './monetization';

test('Remove Ads button waits for ownership check and hides after verified purchase', () => {
  expect(showRemoveAdsButton(true, false, false)).toBe(false);
  expect(showRemoveAdsButton(true, true, false)).toBe(true);
  expect(showRemoveAdsButton(true, true, true)).toBe(false);
  expect(showRemoveAdsButton(false, true, false)).toBe(false);
});

test('selects only the configured Google Play buy option and its offer token', () => {
  const product = { id: 'remove_ads', discountOffers: [
    { purchaseOptionIdAndroid: 'other-option', offerTokenAndroid: 'wrong-token', displayPrice: '$1.00' },
    { purchaseOptionIdAndroid: 'buy-remove-ads', offerTokenAndroid: 'expected-token', displayPrice: '$5.99' },
  ] };
  expect(removeAdsPurchaseOption(product)).toEqual(product.discountOffers[1]);
  expect(removeAdsPurchaseOption({ ...product, id: 'other' })).toBeUndefined();
  expect(removeAdsPurchaseOption({ id: 'remove_ads', discountOffers: [{ purchaseOptionIdAndroid: 'buy-remove-ads', offerTokenAndroid: null, displayPrice: '$5.99' }] })).toBeUndefined();
});

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

test('acknowledges only a server-verified, completed purchase', async () => {
  const acknowledge = jest.fn(async () => undefined);
  const verify = jest.fn(async () => true);
  const purchase = { productId: 'remove_ads', purchaseState: 'purchased', purchaseToken: 'token', isAcknowledgedAndroid: false };
  await expect(confirmAdFreePurchase(purchase, acknowledge, verify)).resolves.toEqual({ valid: true, acknowledgmentPending: false });
  expect(acknowledge).toHaveBeenCalledWith(purchase);
  acknowledge.mockClear();
  await expect(confirmAdFreePurchase({ ...purchase, isAcknowledgedAndroid: true }, acknowledge, verify)).resolves.toEqual({ valid: true, acknowledgmentPending: false });
  expect(acknowledge).not.toHaveBeenCalled();
});

test('rejected verification never acknowledges or grants ad-free', async () => {
  const acknowledge = jest.fn(async () => undefined);
  const verify = jest.fn(async () => true);
  const purchase = { productId: 'remove_ads', purchaseState: 'pending', purchaseToken: 'token' };
  await expect(confirmAdFreePurchase(purchase, acknowledge, verify)).resolves.toEqual({ valid: false, acknowledgmentPending: false });
  expect(verify).not.toHaveBeenCalled();
  expect(acknowledge).not.toHaveBeenCalled();
  await expect(confirmAdFreePurchase({ ...purchase, purchaseState: 'purchased' }, acknowledge, async () => false)).resolves.toEqual({ valid: false, acknowledgmentPending: false });
  expect(acknowledge).not.toHaveBeenCalled();
});

test('verifier outage never acknowledges or grants ad-free', async () => {
  const acknowledge = jest.fn(async () => undefined);
  const purchase = { productId: 'remove_ads', purchaseState: 'purchased', purchaseToken: 'token' };
  await expect(confirmAdFreePurchase(purchase, acknowledge, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  expect(acknowledge).not.toHaveBeenCalled();
});

test('acknowledgment failure preserves verified entitlement for retry', async () => {
  const purchase = { productId: 'remove_ads', purchaseState: 'purchased', purchaseToken: 'token', isAcknowledgedAndroid: false };
  await expect(confirmAdFreePurchase(purchase, async () => { throw new Error('offline'); }, async () => true)).resolves.toEqual({ valid: true, acknowledgmentPending: true });
});

test('server-confirmed acknowledgment does not depend on a second device acknowledgment', async () => {
  const acknowledge = jest.fn(async () => { throw new Error('device unavailable'); });
  const purchase = { productId: 'remove_ads', purchaseState: 'purchased', purchaseToken: 'token', isAcknowledgedAndroid: false };
  await expect(confirmAdFreePurchase(purchase, acknowledge, async () => ({ valid: true, acknowledged: true }))).resolves.toEqual({ valid: true, acknowledgmentPending: false });
  expect(acknowledge).not.toHaveBeenCalled();
});

test('device acknowledgment remains the fallback when the server could not acknowledge', async () => {
  const acknowledge = jest.fn(async () => undefined);
  const purchase = { productId: 'remove_ads', purchaseState: 'purchased', purchaseToken: 'token', isAcknowledgedAndroid: false };
  await expect(confirmAdFreePurchase(purchase, acknowledge, async () => ({ valid: true, acknowledged: false }))).resolves.toEqual({ valid: true, acknowledgmentPending: false });
  expect(acknowledge).toHaveBeenCalledWith(purchase);
});

test('restore diagnostics distinguish missing, pending, tokenless, and rejected purchases', async () => {
  const acknowledge = jest.fn(async () => undefined);
  const verify = jest.fn(async () => false);
  const purchase = { productId: 'remove_ads', purchaseState: 'purchased', purchaseToken: 'token' };
  await expect(reconcileAdFreePurchases([], acknowledge, verify)).resolves.toEqual({ status: 'not-returned' });
  await expect(reconcileAdFreePurchases([{ ...purchase, productId: 'other' }], acknowledge, verify)).resolves.toEqual({ status: 'not-returned' });
  await expect(reconcileAdFreePurchases([{ ...purchase, purchaseState: 'pending' }], acknowledge, verify)).resolves.toEqual({ status: 'pending' });
  await expect(reconcileAdFreePurchases([{ ...purchase, purchaseToken: '' }], acknowledge, verify)).resolves.toEqual({ status: 'missing-token' });
  await expect(reconcileAdFreePurchases([purchase], acknowledge, verify)).resolves.toEqual({ status: 'rejected' });
  expect(verify).toHaveBeenCalledTimes(1);
  expect(acknowledge).not.toHaveBeenCalled();
});

test('restore verifies the correct product and acknowledges only after verification', async () => {
  const acknowledge = jest.fn(async () => undefined);
  const verify = jest.fn(async () => true);
  const purchase = { productId: 'remove_ads', purchaseState: 'purchased', purchaseToken: 'token', isAcknowledgedAndroid: false };
  await expect(reconcileAdFreePurchases([{ ...purchase, productId: 'other' }, purchase], acknowledge, verify)).resolves.toEqual({ status: 'verified', acknowledgmentPending: false });
  expect(verify).toHaveBeenCalledTimes(1);
  expect(verify).toHaveBeenCalledWith(purchase);
  expect(acknowledge).toHaveBeenCalledWith(purchase);
});

test('restore keeps verification outages distinct from a rejected purchase', async () => {
  const purchase = { productId: 'remove_ads', purchaseState: 'purchased', purchaseToken: 'token' };
  await expect(reconcileAdFreePurchases([purchase], async () => undefined, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
});
