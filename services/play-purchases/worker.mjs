const PACKAGE_NAME = 'com.greekkid60.reclaim';
const PRODUCT_ID = 'remove_ads';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export function isPurchasedProduct(value) {
  return value?.purchaseStateContext?.purchaseState === 'PURCHASED'
    && Array.isArray(value.productLineItem)
    && value.productLineItem.some((item) => item.productId === PRODUCT_ID);
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeJson(value) { return base64url(new TextEncoder().encode(JSON.stringify(value))); }

async function googleAccessToken(serviceAccount, fetcher) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
  const claims = encodeJson({ iss: serviceAccount.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signingInput = `${header}.${claims}`;
  const keyBytes = Uint8Array.from(atob(serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))));
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${signingInput}.${signature}` }),
  });
  if (!response.ok) throw new Error('Google authorization failed.');
  const body = await response.json();
  if (typeof body.access_token !== 'string') throw new Error('Google authorization returned no token.');
  return body.access_token;
}

export async function verifyPurchase(request, env, fetcher = fetch) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ valid: false }, { status: 400 }); }
  if (input?.packageName !== PACKAGE_NAME || input?.productId !== PRODUCT_ID || typeof input?.purchaseToken !== 'string' || input.purchaseToken.length < 10 || input.purchaseToken.length > 4096) {
    return Response.json({ valid: false }, { status: 400 });
  }
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) return Response.json({ valid: false }, { status: 503 });
  try {
    const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const accessToken = await googleAccessToken(serviceAccount, fetcher);
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/productsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 404) return Response.json({ valid: false });
    if (!response.ok) throw new Error('Google Play verification failed.');
    return Response.json({ valid: isPurchasedProduct(await response.json()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ valid: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export default { fetch: verifyPurchase };
