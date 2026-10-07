export const REMOVE_ADS_PRODUCT_ID = 'remove_ads';
export function adMode(testFlag?: string, liveFlag?: string): 'off' | 'test' | 'live' {
  return testFlag === '1' ? 'test' : liveFlag === '1' ? 'live' : 'off';
}

const mode = adMode(process.env.EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED, process.env.EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED);
export const TEST_ADS_ENABLED = mode === 'test';

// Keep ads and billing dormant until the public policy and store accounts exist.
export const MONETIZATION_ENABLED = mode === 'live'
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_PRIVACY_URL?.startsWith('https://'))
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL)
  && Boolean(process.env.EXPO_PUBLIC_ADMOB_BANNER_ID)
  && !process.env.EXPO_PUBLIC_ADMOB_BANNER_ID?.startsWith('ca-app-pub-3940256099942544')
  && Boolean(process.env.EXPO_PUBLIC_ADMOB_APP_ID)
  && !process.env.EXPO_PUBLIC_ADMOB_APP_ID?.startsWith('ca-app-pub-3940256099942544')
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL?.startsWith('https://'));

export function hasAdFreePurchase(purchases: readonly { productId: string; purchaseState: string }[]) {
  return purchases.some((purchase) => purchase.productId === REMOVE_ADS_PRODUCT_ID && purchase.purchaseState === 'purchased');
}

export async function verifyAdFreePurchase(purchase: { productId: string; purchaseState: string; purchaseToken?: string | null }): Promise<boolean> {
  if (!hasAdFreePurchase([purchase]) || !purchase.purchaseToken) return false;
  const endpoint = process.env.EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL;
  if (!endpoint?.startsWith('https://')) throw new Error('Purchase verification is not configured.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageName: 'com.greekkid60.reclaim', productId: REMOVE_ADS_PRODUCT_ID, purchaseToken: purchase.purchaseToken }),
  });
  if (!response.ok) throw new Error('Google Play purchase verification is unavailable.');
  const result = await response.json() as { valid?: boolean };
  return result.valid === true;
}
