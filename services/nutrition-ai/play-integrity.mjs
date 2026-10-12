const PACKAGE_NAME = 'com.greekkid60.reclaim';
const SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const MAX_VERDICT_AGE_MS = 2 * 60 * 1000;

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

export async function requestHash(path, body) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${path}\n${body}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validVerdict(verdict, expectedHash, now = Date.now()) {
  const details = verdict?.requestDetails;
  const timestamp = Number(details?.timestampMillis);
  return details?.requestPackageName === PACKAGE_NAME
    && details?.requestHash === expectedHash
    && Number.isFinite(timestamp) && timestamp <= now + 30_000 && now - timestamp <= MAX_VERDICT_AGE_MS
    && verdict?.appIntegrity?.packageName === PACKAGE_NAME
    && verdict?.appIntegrity?.appRecognitionVerdict === 'PLAY_RECOGNIZED'
    && verdict?.accountDetails?.appLicensingVerdict === 'LICENSED'
    && verdict?.deviceIntegrity?.deviceRecognitionVerdict?.includes('MEETS_DEVICE_INTEGRITY') === true;
}

export async function verifyPlayIntegrity(token, path, body, serviceAccountJson, fetcher = fetch) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 16_384) return false;
  const serviceAccount = JSON.parse(serviceAccountJson);
  const accessToken = await googleAccessToken(serviceAccount, fetcher);
  const response = await fetcher(`https://playintegrity.googleapis.com/v1/${PACKAGE_NAME}:decodeIntegrityToken`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrity_token: token }),
  });
  if (!response.ok) return false;
  const decoded = await response.json();
  return validVerdict(decoded.tokenPayloadExternal, await requestHash(path, body));
}
