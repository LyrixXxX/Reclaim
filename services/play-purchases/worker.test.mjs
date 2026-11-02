import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

import worker, { isPurchasedProduct, verifyPurchase } from './worker.mjs';

const body = { packageName: 'com.greekkid60.reclaim', productId: 'remove_ads', purchaseToken: 'a-real-looking-token' };
const limiter = { limit: async () => ({ success: true }) };
const limits = { RATE_LIMITER: limiter, GLOBAL_RATE_LIMITER: limiter };
const request = (value = body, headers) => new Request('https://example.com', { method: 'POST', headers, body: JSON.stringify(value) });

function googleFixture(value, googleStatus = 200, ackStatus = 204, recheckValue = value) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = { ...limits, GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'tester@example.test', private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }) }) };
  const urls = [];
  let purchaseReads = 0;
  const fetcher = async (url, init) => {
    urls.push(url);
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test-access-token' });
    assert.equal(init.headers.Authorization, 'Bearer test-access-token');
    if (url.endsWith(':acknowledge')) {
      assert.equal(init.method, 'POST');
      return new Response(null, { status: ackStatus });
    }
    purchaseReads += 1;
    return Response.json(purchaseReads > 1 ? recheckValue : value, { status: googleStatus });
  };
  return { env, urls, fetcher };
}

test('only the expected completed product is valid', () => {
  assert.equal(isPurchasedProduct({ purchaseStateContext: { purchaseState: 'PENDING' }, productLineItem: [{ productId: 'remove_ads' }] }), false);
  assert.equal(isPurchasedProduct({ purchaseStateContext: { purchaseState: 'CANCELLED' }, productLineItem: [{ productId: 'remove_ads' }] }), false);
  assert.equal(isPurchasedProduct({ purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'other' }] }), false);
  assert.equal(isPurchasedProduct({ purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }] }), true);
});

test('rejects malformed and unrelated requests before contacting Google', async () => {
  const response = await verifyPurchase(request({ ...body, packageName: 'other' }), limits, () => { throw new Error('should not call Google'); });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { valid: false });
});

test('checks the purchase token with Google Play before granting entitlement', async () => {
  const { env, urls, fetcher } = googleFixture({ purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }], acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
  const response = await verifyPurchase(request(), env, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { valid: true, acknowledged: true });
  assert.equal(urls.length, 2);
  assert.match(urls[1], /productsv2\/tokens\/a-real-looking-token$/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('production fetch handler does not pass Cloudflare execution context as fetcher', async () => {
  const purchase = { purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }], acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' };
  const { env, fetcher } = googleFixture(purchase);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    const response = await worker.fetch(request(), env, { waitUntil: () => undefined });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { valid: true, acknowledged: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('server acknowledges a verified pending purchase before confirming delivery', async () => {
  const purchase = { purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }], acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' };
  const { env, urls, fetcher } = googleFixture(purchase);
  const response = await verifyPurchase(request(), env, fetcher);
  assert.deepEqual(await response.json(), { valid: true, acknowledged: true });
  assert.equal(urls.length, 3);
  assert.match(urls[2], /purchases\/products\/remove_ads\/tokens\/a-real-looking-token:acknowledge$/);
});

test('acknowledgment failure remains verified but requires the device fallback', async () => {
  const purchase = { purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }], acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' };
  const { env, fetcher } = googleFixture(purchase, 200, 403);
  const logged = [];
  const response = await verifyPurchase(request(), env, fetcher, { warn: (code) => logged.push(code) });
  assert.deepEqual(await response.json(), { valid: true, acknowledged: false });
  assert.deepEqual(logged, ['purchase_verifier_acknowledgment_error']);
});

test('concurrent acknowledgment is accepted only after Play reports it acknowledged', async () => {
  const purchase = { purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }], acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' };
  const { env, fetcher } = googleFixture(purchase, 200, 409, { ...purchase, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
  const response = await verifyPurchase(request(), env, fetcher);
  assert.deepEqual(await response.json(), { valid: true, acknowledged: true });
});

test('a purchase canceled during acknowledgment is not entitled', async () => {
  const purchase = { purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }], acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' };
  const canceled = { ...purchase, purchaseStateContext: { purchaseState: 'CANCELLED' } };
  const { env, fetcher } = googleFixture(purchase, 200, 409, canceled);
  const response = await verifyPurchase(request(), env, fetcher);
  assert.deepEqual(await response.json(), { valid: false });
});

test('unknown acknowledgement state fails closed', async () => {
  const purchase = { purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'remove_ads' }] };
  const { env, fetcher } = googleFixture(purchase);
  const response = await verifyPurchase(request(), env, fetcher, { warn: () => undefined });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { valid: false });
});

test('pending, cancelled, and unrelated Play purchases never verify', async () => {
  for (const value of [
    { purchaseStateContext: { purchaseState: 'PENDING' }, productLineItem: [{ productId: 'remove_ads' }] },
    { purchaseStateContext: { purchaseState: 'CANCELLED' }, productLineItem: [{ productId: 'remove_ads' }] },
    { purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: 'another_product' }] },
  ]) {
    const { env, fetcher } = googleFixture(value);
    const response = await verifyPurchase(request(), env, fetcher);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { valid: false });
  }
});

test('unknown token, Google failure, and missing secret fail closed', async () => {
  const notFound = googleFixture({}, 404);
  assert.deepEqual(await (await verifyPurchase(request(), notFound.env, notFound.fetcher)).json(), { valid: false });
  const failed = googleFixture({}, 503);
  const response = await verifyPurchase(request(), failed.env, failed.fetcher);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { valid: false });
  assert.equal((await verifyPurchase(request(), limits)).status, 503);
});

test('rate limiting, missing bindings, and oversized bodies never contact Google', async () => {
  const forbiddenFetch = () => { throw new Error('Google must not be called'); };
  assert.equal((await verifyPurchase(request(), {}, forbiddenFetch)).status, 503);
  const blocked = { ...limits, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const throttled = await verifyPurchase(request(), blocked, forbiddenFetch);
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers.get('retry-after'), '60');
  const large = request({ ...body, padding: 'x'.repeat(9000) });
  assert.equal((await verifyPurchase(large, limits, forbiddenFetch)).status, 413);
});

test('deployment config retains secret and rate limits without logging request URLs', () => {
  const config = JSON.parse(readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.preview_urls, false);
  assert.equal(config.observability.enabled, true);
  assert.equal(config.observability.redact_query_string, true);
  assert.equal(config.observability.logs.enabled, true);
  assert.equal(config.observability.logs.invocation_logs, false);
  assert.deepEqual(config.secrets.required, ['GOOGLE_SERVICE_ACCOUNT_JSON']);
  assert.deepEqual(config.ratelimits.map(({ name, namespace_id }) => [name, namespace_id]), [
    ['RATE_LIMITER', '2001'],
    ['GLOBAL_RATE_LIMITER', '2002'],
  ]);
});

test('operational logs contain fixed codes, not purchase or credential data', async () => {
  const logged = [];
  const logger = { warn: (...values) => logged.push(values) };
  const purchaseToken = 'sensitive-purchase-token-12345';
  const serviceAccount = 'sensitive-service-account-json';
  const response = await verifyPurchase(
    request({ ...body, purchaseToken }),
    { ...limits, GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccount },
    () => { throw new Error('Google must not be called'); },
    logger,
  );
  assert.equal(response.status, 503);
  assert.deepEqual(logged, [['purchase_verifier_invalid_secret']]);
  const output = JSON.stringify(logged);
  assert.equal(output.includes(purchaseToken), false);
  assert.equal(output.includes(serviceAccount), false);
});

test('diagnostic codes distinguish OAuth and Play failures without logging sensitive data', async () => {
  const secretText = 'secret-google-response-body';
  const purchaseToken = 'sensitive-purchase-token-12345';
  const cases = [
    {
      name: 'invalid signing key',
      make: () => ({
        env: { ...limits, GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'tester@example.test', private_key: 'not-a-key' }) },
        fetcher: () => { throw new Error('OAuth should not be called'); },
      }),
      expected: [['purchase_verifier_oauth_signing_error']],
    },
    {
      name: 'OAuth transport failure',
      make: () => ({ ...googleFixture({}), fetcher: () => { throw new Error(secretText); } }),
      expected: [['purchase_verifier_oauth_transport_error']],
    },
    {
      name: 'OAuth HTTP failure',
      make: () => ({ ...googleFixture({}), fetcher: () => Response.json({ message: secretText }, { status: 403 }) }),
      expected: [['purchase_verifier_oauth_http_error', { status: 403 }]],
    },
    {
      name: 'OAuth malformed response',
      make: () => ({ ...googleFixture({}), fetcher: () => Response.json({ error: secretText }) }),
      expected: [['purchase_verifier_oauth_response_error']],
    },
    {
      name: 'Play lookup transport failure',
      make: () => {
        const fixture = googleFixture({});
        return { ...fixture, fetcher: (url, init) => url.includes('oauth2.googleapis.com') ? fixture.fetcher(url, init) : Promise.reject(new Error(secretText)) };
      },
      expected: [['purchase_verifier_play_lookup_transport_error']],
    },
    {
      name: 'Play lookup HTTP failure',
      make: () => {
        const fixture = googleFixture({});
        return { ...fixture, fetcher: (url, init) => url.includes('oauth2.googleapis.com') ? fixture.fetcher(url, init) : Response.json({ message: secretText }, { status: 403 }) };
      },
      expected: [['purchase_verifier_play_lookup_http_error', { status: 403 }]],
    },
    {
      name: 'Play lookup malformed response',
      make: () => {
        const fixture = googleFixture({});
        return { ...fixture, fetcher: (url, init) => url.includes('oauth2.googleapis.com') ? fixture.fetcher(url, init) : new Response(secretText) };
      },
      expected: [['purchase_verifier_play_lookup_response_error']],
    },
  ];
  for (const entry of cases) {
    const logged = [];
    const { env, fetcher } = entry.make();
    const response = await verifyPurchase(request({ ...body, purchaseToken }), env, fetcher, { warn: (...values) => logged.push(values) });
    assert.equal(response.status, 503, entry.name);
    assert.deepEqual(await response.json(), { valid: false }, entry.name);
    assert.deepEqual(logged, entry.expected, entry.name);
    assert.equal(JSON.stringify(logged).includes(purchaseToken), false, entry.name);
    assert.equal(JSON.stringify(logged).includes(secretText), false, entry.name);
  }
});
