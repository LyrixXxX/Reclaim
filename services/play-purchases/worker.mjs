const PACKAGE_NAME = 'com.greekkid60.reclaim';
const PRODUCT_ID = 'remove_ads';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const MAX_BODY_BYTES = 8192;

class VerificationStageError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function logVerificationError(logger, error) {
  if (!(error instanceof VerificationStageError)) {
    logger.warn('purchase_verifier_unexpected_error');
    return;
  }
  if (Number.isInteger(error.status) && error.status >= 100 && error.status <= 599) {
    logger.warn(error.code, { status: error.status });
  } else {
    logger.warn(error.code);
  }
}

function result(valid, status = 200, extraHeaders = {}, acknowledged) {
  return Response.json(acknowledged === undefined ? { valid } : { valid, acknowledged }, { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } });
}

async function limitedJson(request) {
  const declaredSize = Number(request.headers.get('content-length'));
  if (declaredSize > MAX_BODY_BYTES) return { status: 413 };
  if (!request.body) return { status: 400 };
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return { status: 413 }; }
      text += decoder.decode(value, { stream: true });
    }
    return { value: JSON.parse(text + decoder.decode()) };
  } catch {
    return { status: 400 };
  }
}

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
  let assertion;
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
    const claims = encodeJson({ iss: serviceAccount.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const signingInput = `${header}.${claims}`;
    const keyBytes = Uint8Array.from(atob(serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')), (character) => character.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))));
    assertion = `${signingInput}.${signature}`;
  } catch {
    throw new VerificationStageError('purchase_verifier_oauth_signing_error');
  }
  let response;
  try {
    response = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
  } catch {
    throw new VerificationStageError('purchase_verifier_oauth_transport_error');
  }
  if (!response.ok) throw new VerificationStageError('purchase_verifier_oauth_http_error', response.status);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new VerificationStageError('purchase_verifier_oauth_response_error');
  }
  if (typeof body?.access_token !== 'string' || !body.access_token) throw new VerificationStageError('purchase_verifier_oauth_response_error');
  return body.access_token;
}

export async function verifyPurchase(request, env, fetcher = fetch, logger = console) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!env.RATE_LIMITER || !env.GLOBAL_RATE_LIMITER) {
    logger.warn('purchase_verifier_missing_rate_limit_binding');
    return result(false, 503);
  }
  try {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const [individual, global] = await Promise.all([
      env.RATE_LIMITER.limit({ key: ip }),
      env.GLOBAL_RATE_LIMITER.limit({ key: 'purchase-verification' }),
    ]);
    if (!individual.success || !global.success) return result(false, 429, { 'Retry-After': '60' });
  } catch {
    logger.warn('purchase_verifier_rate_limit_error');
    return result(false, 503);
  }
  const parsed = await limitedJson(request);
  if (parsed.status) return result(false, parsed.status);
  const input = parsed.value;
  if (input?.packageName !== PACKAGE_NAME || input?.productId !== PRODUCT_ID || typeof input?.purchaseToken !== 'string' || input.purchaseToken.length < 10 || input.purchaseToken.length > 4096) {
    return result(false, 400);
  }
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    logger.warn('purchase_verifier_missing_secret');
    return result(false, 503);
  }
  try {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new VerificationStageError('purchase_verifier_invalid_secret');
    }
    if (typeof serviceAccount?.client_email !== 'string' || !serviceAccount.client_email
      || typeof serviceAccount?.private_key !== 'string' || !serviceAccount.private_key) {
      throw new VerificationStageError('purchase_verifier_invalid_secret');
    }
    const accessToken = await googleAccessToken(serviceAccount, fetcher);
    const token = encodeURIComponent(input.purchaseToken);
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/productsv2/tokens/${token}`;
    let response;
    try {
      response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch {
      throw new VerificationStageError('purchase_verifier_play_lookup_transport_error');
    }
    if (response.status === 404) return result(false);
    if (!response.ok) throw new VerificationStageError('purchase_verifier_play_lookup_http_error', response.status);
    let purchase;
    try {
      purchase = await response.json();
    } catch {
      throw new VerificationStageError('purchase_verifier_play_lookup_response_error');
    }
    if (!isPurchasedProduct(purchase)) return result(false);
    if (purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') return result(true, 200, {}, true);
    if (purchase.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_PENDING') {
      logger.warn('purchase_verifier_unknown_ack_state');
      return result(false, 503);
    }
    const acknowledgeUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${PRODUCT_ID}/tokens/${token}:acknowledge`;
    try {
      const acknowledge = await fetcher(acknowledgeUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (acknowledge.ok) return result(true, 200, {}, true);
    } catch { /* The app may still acknowledge through Play Billing. */ }
    // Another request may have acknowledged the same token; check Play before falling back to the device.
    try {
      const recheck = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (recheck.status === 404) return result(false);
      if (recheck.ok) {
        const updated = await recheck.json();
        if (!isPurchasedProduct(updated)) return result(false);
        if (updated.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') return result(true, 200, {}, true);
      }
    } catch { /* Keep the verified purchase eligible for the device fallback. */ }
    logger.warn('purchase_verifier_acknowledgment_error');
    return result(true, 200, {}, false);
  } catch (error) {
    logVerificationError(logger, error);
    return result(false, 503);
  }
}

// Cloudflare's third fetch-handler argument is ExecutionContext, not a fetch implementation.
export default {
  fetch(request, env) {
    return verifyPurchase(request, env);
  },
};
