import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import { isPurchasedProduct, verifyPurchase } from './worker.mjs';

test('only the expected completed product is valid', () => {
  assert.equal(isPurchasedProduct({ purchaseStateContext: { purchaseState: 'PENDING' }, productLineItem: [{ productId: 'remove_ads' }] }), false);
  assert.equal(isPurchasedProduct({ purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'other' }] }), false);
  assert.equal(isPurchasedProduct({ purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }] }), true);
});

test('rejects malformed and unrelated requests before contacting Google', async () => {
  const response = await verifyPurchase(new Request('https://example.com', { method: 'POST', body: JSON.stringify({ packageName: 'other', productId: 'remove_ads', purchaseToken: 'a-real-looking-token' }) }), {}, () => { throw new Error('should not call Google'); });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { valid: false });
});

test('checks the purchase token with Google Play before granting entitlement', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'tester@example.test', private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }) }) };
  const request = new Request('https://example.com', { method: 'POST', body: JSON.stringify({ packageName: 'com.greekkid60.reclaim', productId: 'remove_ads', purchaseToken: 'a-real-looking-token' }) });
  const urls = [];
  const response = await verifyPurchase(request, env, async (url, init) => {
    urls.push(url);
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test-access-token' });
    assert.equal(init.headers.Authorization, 'Bearer test-access-token');
    return Response.json({ purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }] });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { valid: true });
  assert.equal(urls.length, 2);
  assert.match(urls[1], /productsv2\/tokens\/a-real-looking-token$/);
});
